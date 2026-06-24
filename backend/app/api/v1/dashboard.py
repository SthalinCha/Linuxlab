import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import admin_profesor
from app.core.security import get_current_user
from app.models import User, VirtualMachine, AuditLog, VMTemplate
from app.database.session import get_session
from app.services.host_service import get_host_metrics_async as get_host_metrics
from app.services.metrics_collector import collector
from app.services.config_service import get_cached_int
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardHistoryResponse,
    CpuHistoryPoint,
    RamHistoryPoint,
    DashboardAlertsResponse,
    AlertItem,
    TopConsumersResponse,
    TopConsumerItem,
    RecentActivityResponse,
    ActivityItem,
    CapacityResponse,
)
from app.core.dates import utc_iso

router = APIRouter()


def _compute_alerts_count(host: dict, crashed_vm_count: int) -> int:
    count = 0
    cpu_warn = get_cached_int("alert_cpu_warn", 75)
    ram_warn = get_cached_int("alert_ram_warn", 75)
    disk_warn = get_cached_int("alert_disk_warn", 80)
    if host["cpu_percent"] > cpu_warn:
        count += 1
    if host["ram_percent"] > ram_warn:
        count += 1
    if host["disk_percent"] > disk_warn:
        count += 1
    count += crashed_vm_count
    return count


def _vm_owner_filter(query, user, alias=None):
    if user.role.name == "profesor":
        col = (alias or VirtualMachine).owner_id
        query = query.where(col == user.id)
    return query


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    user: User = Depends(admin_profesor),
    session: AsyncSession = Depends(get_session),
):
    host = await get_host_metrics()

    vm_base = [VirtualMachine.deleted_at.is_(None), VirtualMachine.template_id.is_(None)]
    if user.role.name == "profesor":
        vm_base.append(VirtualMachine.owner_id == user.id)

    result = await session.execute(
        select(func.coalesce(func.sum(VirtualMachine.vcpus), 0)).where(*vm_base)
    )
    vcpu_assigned = result.scalar() or 0

    # VM counts scoped by role
    result = await session.execute(
        select(
            func.count(VirtualMachine.id),
            func.sum(case((VirtualMachine.current_state == "running", 1), else_=0)),
        ).where(*vm_base)
    )
    row = result.one()
    total_vms = row[0] or 0
    running_vms = row[1] or 0
    stopped_vms = total_vms - running_vms

    health_factors = []

    cpu_score = max(0, 100 - float(host["cpu_percent"]))
    health_factors.append(cpu_score)

    ram_score = max(0, 100 - float(host["ram_percent"]))
    health_factors.append(ram_score)

    disk_score = max(0, 100 - float(host["disk_percent"]))
    health_factors.append(disk_score)

    vm_ratio = float(running_vms) / max(float(total_vms), 1)
    vm_score = vm_ratio * 100
    health_factors.append(vm_score)

    health_score = round(sum(health_factors) / len(health_factors), 1)

    crashed_query = [VirtualMachine.current_state.in_(["crashed", "unknown"]), VirtualMachine.deleted_at.is_(None)]
    if user.role.name == "profesor":
        crashed_query.append(VirtualMachine.owner_id == user.id)
    crashed_count = await session.scalar(
        select(func.count(VirtualMachine.id)).where(*crashed_query)
    )
    alerts_count = _compute_alerts_count(host, crashed_count or 0)

    return {
        **host,
        "total_vms": total_vms,
        "running_vms": running_vms,
        "stopped_vms": stopped_vms,
        "health_score": health_score,
        "vcpu_assigned": vcpu_assigned,
        "alerts_count": alerts_count,
    }


@router.get("/dashboard/history", response_model=DashboardHistoryResponse)
async def get_dashboard_history(
    user: User = Depends(admin_profesor),
    session: AsyncSession = Depends(get_session),
):
    history = await collector.get_history(session)

    return {
        "cpu_history": [CpuHistoryPoint(**p) for p in history["cpu_history"]],
        "ram_history": [RamHistoryPoint(**p) for p in history["ram_history"]],
    }


@router.get("/dashboard/alerts", response_model=DashboardAlertsResponse)
async def get_dashboard_alerts(
    user: User = Depends(admin_profesor),
    session: AsyncSession = Depends(get_session),
):
    host = await get_host_metrics()
    alerts = []

    cpu_crit = get_cached_int("alert_cpu_crit", 90)
    cpu_warn = get_cached_int("alert_cpu_warn", 75)
    ram_crit = get_cached_int("alert_ram_crit", 90)
    ram_warn = get_cached_int("alert_ram_warn", 75)
    disk_crit = get_cached_int("alert_disk_crit", 90)

    if host["cpu_percent"] > cpu_crit:
        alerts.append({"level": "critical", "message": f"CPU al {host['cpu_percent']}%", "resource": "Host"})
    elif host["cpu_percent"] > cpu_warn:
        alerts.append({"level": "warning", "message": f"CPU al {host['cpu_percent']}%", "resource": "Host"})

    if host["ram_percent"] > ram_crit:
        alerts.append({"level": "critical", "message": f"RAM al {host['ram_percent']}%", "resource": "Host"})
    elif host["ram_percent"] > ram_warn:
        alerts.append({"level": "warning", "message": f"RAM al {host['ram_percent']}%", "resource": "Host"})

    if host["disk_percent"] > disk_crit:
        alerts.append({"level": "critical", "message": f"Almacenamiento al {host['disk_percent']}%", "resource": "Storage"})

    vm_query = [VirtualMachine.current_state.in_(["crashed", "unknown"]), VirtualMachine.deleted_at.is_(None)]
    if user.role.name == "profesor":
        vm_query.append(VirtualMachine.owner_id == user.id)
    result = await session.execute(
        select(VirtualMachine).where(*vm_query)
    )
    for vm in result.scalars().all():
        alerts.append({"level": "critical", "message": f"VM sin respuesta", "resource": vm.name})

    return {"alerts": alerts}


@router.get("/dashboard/top-consumers", response_model=TopConsumersResponse)
async def get_top_consumers(
    user: User = Depends(admin_profesor),
    session: AsyncSession = Depends(get_session),
):
    template_result = await session.execute(select(VMTemplate.name))
    template_names = {row[0] for row in template_result}
    from functools import partial
    stats = await asyncio.to_thread(partial(collector.get_vm_stats, exclude_names=template_names))
    if user.role.name == "profesor":
        result = await session.execute(
            select(VirtualMachine.name).where(
                VirtualMachine.deleted_at.is_(None),
                VirtualMachine.owner_id == user.id,
            )
        )
        own_vm_names = {row[0] for row in result}
        stats["top_cpu"] = [s for s in stats["top_cpu"] if s["name"] in own_vm_names]
        stats["top_ram"] = [s for s in stats["top_ram"] if s["name"] in own_vm_names]
    return stats


@router.get("/dashboard/recent-activity", response_model=RecentActivityResponse)
async def get_recent_activity(
    user: User = Depends(admin_profesor),
    session: AsyncSession = Depends(get_session),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    if user.role.name == "profesor":
        query = query.where(AuditLog.admin_username == user.username)
    result = await session.execute(query.limit(20))
    logs = result.scalars().all()
    return {
        "activity": [
            {
                "time": utc_iso(log.created_at) or "",
                "event": log.action,
                "resource": f"{log.resource_type or ''} #{log.resource_id}" if log.resource_id else "-",
                "type": log.event_type,
            }
            for log in logs
        ]
    }


@router.get("/dashboard/capacity", response_model=CapacityResponse)
async def get_capacity(user: User = Depends(admin_profesor)):
    host = await get_host_metrics()

    total_ram_gb = host["ram_total_gb"]
    used_ram_gb = host["ram_used_gb"]
    free_ram_gb = round(total_ram_gb - used_ram_gb, 1)

    total_disk_gb = host["disk_total_gb"]
    used_disk_gb = host["disk_used_gb"]
    free_disk_gb = round(total_disk_gb - used_disk_gb, 1)

    avg_vm_ram = get_cached_int("avg_vm_ram_gb", 4)
    avg_vm_disk = get_cached_int("avg_vm_disk_gb", 20)
    overcommit_ratio = get_cached_int("vcpu_overcommit_ratio", 4)

    vms_by_ram = int(free_ram_gb / avg_vm_ram) if avg_vm_ram > 0 else 0
    vms_by_disk = int(free_disk_gb / avg_vm_disk) if avg_vm_disk > 0 else 0
    estimated_vms = min(vms_by_ram, vms_by_disk)

    return {
        "free_vcpus": max(0, host.get("cpu_count", 0) * overcommit_ratio - host.get("total_vms", 0)),
        "free_ram_gb": free_ram_gb,
        "free_disk_gb": free_disk_gb,
        "estimated_vms": max(0, estimated_vms),
    }
