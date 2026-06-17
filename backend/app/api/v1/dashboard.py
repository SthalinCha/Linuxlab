from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.models import User, VirtualMachine, AuditLog
from app.database.session import get_session
from app.services.host_service import get_host_metrics_async as get_host_metrics
from app.services.metrics_collector import collector
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

router = APIRouter()


def _compute_alerts_count(host: dict, crashed_vm_count: int) -> int:
    count = 0
    if host["cpu_percent"] > 75:
        count += 1
    if host["ram_percent"] > 75:
        count += 1
    if host["disk_percent"] > 80:
        count += 1
    count += crashed_vm_count
    return count


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    host = await get_host_metrics()

    result = await session.execute(
        select(func.coalesce(func.sum(VirtualMachine.vcpus), 0)).where(
            VirtualMachine.deleted_at.is_(None),
            VirtualMachine.template_id.is_(None)
        )
    )
    vcpu_assigned = result.scalar() or 0

    health_factors = []

    cpu_score = max(0, 100 - host["cpu_percent"])
    health_factors.append(cpu_score)

    ram_score = max(0, 100 - host["ram_percent"])
    health_factors.append(ram_score)

    disk_score = max(0, 100 - host["disk_percent"])
    health_factors.append(disk_score)

    vm_ratio = host["running_vms"] / max(host["total_vms"], 1)
    vm_score = vm_ratio * 100
    health_factors.append(vm_score)

    health_score = round(sum(health_factors) / len(health_factors), 1)

    crashed_count = await session.scalar(
        select(func.count(VirtualMachine.id)).where(
            VirtualMachine.current_state.in_(["crashed", "unknown"]),
            VirtualMachine.deleted_at.is_(None),
        )
    )
    alerts_count = _compute_alerts_count(host, crashed_count or 0)

    return {
        **host,
        "health_score": health_score,
        "vcpu_assigned": vcpu_assigned,
        "alerts_count": alerts_count,
    }


@router.get("/dashboard/history", response_model=DashboardHistoryResponse)
async def get_dashboard_history(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    history = await collector.get_history(session)

    return {
        "cpu_history": [CpuHistoryPoint(**p) for p in history["cpu_history"]],
        "ram_history": [RamHistoryPoint(**p) for p in history["ram_history"]],
    }


@router.get("/dashboard/alerts", response_model=DashboardAlertsResponse)
async def get_dashboard_alerts(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    host = await get_host_metrics()
    alerts = []

    if host["cpu_percent"] > 90:
        alerts.append({"level": "critical", "message": f"CPU al {host['cpu_percent']}%", "resource": "Host"})
    elif host["cpu_percent"] > 75:
        alerts.append({"level": "warning", "message": f"CPU al {host['cpu_percent']}%", "resource": "Host"})

    if host["ram_percent"] > 90:
        alerts.append({"level": "critical", "message": f"RAM al {host['ram_percent']}%", "resource": "Host"})
    elif host["ram_percent"] > 75:
        alerts.append({"level": "warning", "message": f"RAM al {host['ram_percent']}%", "resource": "Host"})

    if host["disk_percent"] > 80:
        alerts.append({"level": "critical", "message": f"Almacenamiento al {host['disk_percent']}%", "resource": "Storage"})

    result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.current_state.in_(["crashed", "unknown"]),
            VirtualMachine.deleted_at.is_(None),
        )
    )
    for vm in result.scalars().all():
        alerts.append({"level": "critical", "message": f"VM sin respuesta", "resource": vm.name})

    return {"alerts": alerts}


@router.get("/dashboard/top-consumers", response_model=TopConsumersResponse)
async def get_top_consumers(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stats = collector.get_vm_stats()
    return stats


@router.get("/dashboard/recent-activity", response_model=RecentActivityResponse)
async def get_recent_activity(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(20)
    )
    logs = result.scalars().all()
    return {
        "activity": [
            {
                "time": log.created_at.isoformat() if log.created_at else "",
                "event": log.action,
                "resource": f"{log.resource_type or ''} #{log.resource_id}" if log.resource_id else "-",
                "type": log.event_type,
            }
            for log in logs
        ]
    }


@router.get("/dashboard/capacity", response_model=CapacityResponse)
async def get_capacity(user: User = Depends(get_current_user)):
    host = await get_host_metrics()

    total_ram_gb = host["ram_total_gb"]
    used_ram_gb = host["ram_used_gb"]
    free_ram_gb = round(total_ram_gb - used_ram_gb, 1)

    total_disk_gb = host["disk_total_gb"]
    used_disk_gb = host["disk_used_gb"]
    free_disk_gb = round(total_disk_gb - used_disk_gb, 1)

    avg_vm_ram = 4
    avg_vm_disk = 20

    vms_by_ram = int(free_ram_gb / avg_vm_ram) if avg_vm_ram > 0 else 0
    vms_by_disk = int(free_disk_gb / avg_vm_disk) if avg_vm_disk > 0 else 0
    estimated_vms = min(vms_by_ram, vms_by_disk)

    return {
        "free_vcpus": max(0, host.get("cpu_count", 0) * 4 - host.get("total_vms", 0)),
        "free_ram_gb": free_ram_gb,
        "free_disk_gb": free_disk_gb,
        "estimated_vms": max(0, estimated_vms),
    }
