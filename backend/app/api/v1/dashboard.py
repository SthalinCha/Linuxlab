from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_admin
from app.database.models import Admin, VirtualMachine, VMAssignment, AuditLog, Student
from app.database.session import get_session
from app.services.host_service import get_host_metrics
from app.services.metrics_collector import collector
from app.libvirt_layer.connection import HAVE_LIBVIRT
import psutil

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard(
    admin: Admin = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    host = get_host_metrics()

    result = await session.execute(
        select(func.coalesce(func.sum(VirtualMachine.vcpus), 0)).where(
            VirtualMachine.is_active == True, VirtualMachine.is_template == False
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

    import subprocess
    swap = psutil.swap_memory()
    try:
        load_1, load_5, load_15 = psutil.getloadavg()
    except Exception:
        load_1 = load_5 = load_15 = 0

    return {
        **host,
        "health_score": health_score,
        "vcpu_assigned": vcpu_assigned,
        "ram_assigned_gb": host.get("ram_used_gb", 0),
        "swap_used_mb": round(swap.used / (1024 * 1024), 1),
        "swap_total_mb": round(swap.total / (1024 * 1024), 1),
        "swap_percent": round(swap.percent, 1),
        "alerts_count": 0,
        "has_libvirt": HAVE_LIBVIRT,
    }


@router.get("/dashboard/history")
async def get_dashboard_history(
    admin: Admin = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    history = collector.get_history()

    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.is_active == True, VirtualMachine.is_template == False)
    )
    vms = result.scalars().all()
    running = sum(1 for v in vms if v.current_state == "running")
    stopped = sum(1 for v in vms if v.current_state == "shut off")
    suspended = sum(1 for v in vms if v.current_state == "paused")
    error = sum(1 for v in vms if v.current_state in ("crashed", "unknown"))

    return {
        "cpu_history": history["cpu_history"],
        "ram_history": history["ram_history"],
        "disk_history": history["disk_history"],
        "vm_distribution": [
            {"name": "Encendidas", "value": running},
            {"name": "Apagadas", "value": stopped},
            {"name": "Suspendidas", "value": suspended},
            {"name": "Error", "value": error},
        ],
    }


@router.get("/dashboard/alerts")
async def get_dashboard_alerts(
    admin: Admin = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    host = get_host_metrics()
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
        select(VirtualMachine).where(VirtualMachine.current_state.in_(["crashed", "unknown"]))
    )
    for vm in result.scalars().all():
        alerts.append({"level": "critical", "message": f"VM sin respuesta", "resource": vm.name})

    return {"alerts": alerts}


@router.get("/dashboard/top-consumers")
async def get_top_consumers(
    admin: Admin = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stats = collector.get_vm_stats()
    return stats


@router.get("/dashboard/recent-activity")
async def get_recent_activity(
    admin: Admin = Depends(get_current_admin),
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


@router.get("/dashboard/capacity")
async def get_capacity(admin: Admin = Depends(get_current_admin)):
    host = get_host_metrics()

    total_ram_gb = host["ram_total_gb"]
    used_ram_gb = host["ram_used_gb"]
    free_ram_gb = round(total_ram_gb - used_ram_gb, 1)

    total_disk_gb = host["disk_total_gb"]
    used_disk_gb = host["disk_used_gb"]
    free_disk_gb = round(total_disk_gb - used_disk_gb, 1)

    avg_vm_ram = 4  
    avg_vm_cpu = 1  
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
