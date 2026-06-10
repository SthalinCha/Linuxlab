from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_admin
from app.database.models import Admin, VirtualMachine
from app.database.session import get_session
from app.services.host_service import get_host_metrics
from app.libvirt_layer.connection import HAVE_LIBVIRT
import subprocess
import psutil

router = APIRouter()


def _service_status(name: str) -> str:
    try:
        r = subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True, timeout=5)
        return r.stdout.strip()
    except Exception:
        return "unknown"


def _read_os_release() -> str:
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=")[1].strip().strip('"')
    except Exception:
        pass
    return ""


@router.get("")
async def get_host_info(
    admin: Admin = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    metrics = get_host_metrics()
    services = {
        "libvirtd": _service_status("libvirtd"),
        "qemu": _service_status("qemu-kvm"),
        "nginx": _service_status("nginx"),
        "cockpit": _service_status("cockpit"),
        "ssh": _service_status("ssh"),
    }

    uname = ""
    kernel = ""
    try:
        r = subprocess.run(["uname", "-a"], capture_output=True, text=True, timeout=5)
        uname = r.stdout.strip()
        kernel = uname.split(" ")[2] if len(uname.split(" ")) > 2 else ""
    except Exception:
        pass

    os_info = _read_os_release()

    bridge = ""
    try:
        if "virbr0" in psutil.net_if_addrs():
            bridge = "virbr0"
    except Exception:
        pass

    ip_principal = ""
    try:
        r = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5)
        ip_principal = r.stdout.strip().split()[0] if r.stdout.strip() else ""
    except Exception:
        pass

    swap = psutil.swap_memory()

    vcpu_result = await session.execute(
        select(func.coalesce(func.sum(VirtualMachine.vcpus), 0))
        .where(VirtualMachine.is_active == True, VirtualMachine.is_template == False)
    )
    vcpu_allocated = vcpu_result.scalar() or 0

    return {
        "hostname": metrics.get("hostname", ""),
        "uptime": metrics.get("uptime", ""),
        "os": os_info or "Ubuntu Server",
        "kernel": kernel,
        "ip_principal": ip_principal,
        "bridge": bridge,
        "hypervisor": "KVM/QEMU",
        "has_libvirt": HAVE_LIBVIRT,
        "cpu_percent": metrics.get("cpu_percent", 0),
        "cpu_count": psutil.cpu_count(logical=False) or metrics.get("cpu_count", 0),
        "vcpu_allocated": vcpu_allocated,
        "ram_used_gb": metrics.get("ram_used_gb", 0),
        "ram_total_gb": metrics.get("ram_total_gb", 0),
        "ram_percent": metrics.get("ram_percent", 0),
        "disk_used_gb": metrics.get("disk_used_gb", 0),
        "disk_total_gb": metrics.get("disk_total_gb", 0),
        "disk_percent": metrics.get("disk_percent", 0),
        "swap_used_gb": round(swap.used / (1024**3), 1),
        "swap_total_gb": round(swap.total / (1024**3), 1),
        "load_1": metrics.get("load_1", 0),
        "load_5": metrics.get("load_5", 0),
        "load_15": metrics.get("load_15", 0),
        "services": services,
    }


@router.post("/service/{service_name}/restart")
async def restart_service(service_name: str, admin: Admin = Depends(get_current_admin)):
    allowed = ["libvirtd", "qemu-kvm", "nginx", "cockpit", "ssh"]
    if service_name not in allowed:
        raise HTTPException(status_code=422, detail=f"Servicio no permitido: {service_name}")
    try:
        r = subprocess.run(["systemctl", "restart", service_name], capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            raise HTTPException(status_code=500, detail=r.stderr or "Error al reiniciar servicio")
        return {"message": f"Servicio {service_name} reiniciado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
