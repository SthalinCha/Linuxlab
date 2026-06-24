import asyncio
import datetime
import logging
import os
import time
import psutil
from app.core.libvirt.connection import get_connection

logger = logging.getLogger(__name__)

_metrics_cache: dict | None = None
_metrics_cache_time: float = 0
METRICS_CACHE_TTL = int(os.getenv("METRICS_CACHE_TTL", "10"))


def get_host_metrics() -> dict:
    global _metrics_cache, _metrics_cache_time
    now = time.time()
    if _metrics_cache is not None and now - _metrics_cache_time < METRICS_CACHE_TTL:
        return dict(_metrics_cache)

    conn = get_connection()

    try:
        info = conn.getInfo()
    except Exception as e:
        logger.warning("getInfo falló: %s", e)
        info = [0, 0, 0, 0]

    cpu_percent = psutil.cpu_percent(interval=0)
    cpu_count = psutil.cpu_count(logical=False)
    load_1, load_5, load_15 = psutil.getloadavg()
    disk_usage = psutil.disk_usage("/")
    boot_time = psutil.boot_time()

    uptime_delta = datetime.datetime.now() - datetime.datetime.fromtimestamp(boot_time)
    days = uptime_delta.days
    hours, remainder = divmod(uptime_delta.seconds, 3600)
    minutes = remainder // 60
    uptime_str = f"{days}d {hours}h {minutes}m"

    mem = psutil.virtual_memory()
    total_mem_mb = mem.total // (1024 * 1024)
    used_mem_mb = (mem.total - mem.available) // (1024 * 1024)
    ram_percent = mem.percent

    os_info = ""
    for os_path in ("/host-os-release", "/etc/os-release"):
        try:
            with open(os_path) as f:
                for line in f:
                    if line.startswith("PRETTY_NAME="):
                        os_info = line.split("=")[1].strip().strip('"')
                        break
            if os_info:
                break
        except Exception as e:
            logger.debug("No se pudo leer %s: %s", os_path, e)
    if not os_info:
        os_info = "Desconocido"

    cpu_temp = None
    try:
        temps = psutil.sensors_temperatures()
        if "coretemp" in temps and temps["coretemp"]:
            cpu_temp = round(temps["coretemp"][0].current, 1)
    except Exception as e:
        logger.debug("sensors_temperatures no disponible: %s", e)

    from app.core.libvirt.vm_manager import VMManager
    mgr = VMManager()
    domains = mgr.list_domains()
    total_vms = len(domains)
    running_vms = sum(1 for d in domains if d.get("state") == "running")

    result = {
        "hostname": conn.getHostname(),
        "os": os_info,
        "cpu_percent": round(cpu_percent, 1),
        "cpu_temp": cpu_temp,
        "cpu_count": cpu_count,
        "ram_percent": round(ram_percent, 1),
        "ram_used_gb": round(used_mem_mb / 1024, 1),
        "ram_total_gb": round(total_mem_mb / 1024, 1),
        "disk_percent": round(disk_usage.percent, 1),
        "disk_used_gb": round(disk_usage.used / (1024**3), 1),
        "disk_total_gb": round(disk_usage.total / (1024**3), 1),
        "uptime": uptime_str,
        "load_1": round(load_1, 2),
        "load_5": round(load_5, 2),
        "load_15": round(load_15, 2),
        "total_vms": total_vms,
        "running_vms": running_vms,
        "stopped_vms": total_vms - running_vms,
    }
    _metrics_cache = result
    _metrics_cache_time = now
    return result


async def get_host_metrics_async() -> dict:
    return await asyncio.to_thread(get_host_metrics)
