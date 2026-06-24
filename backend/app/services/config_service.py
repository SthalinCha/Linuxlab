import asyncio
import json
import os
import time
from typing import Any

_cache: dict[str, tuple[Any, float]] = {}
_cache_ttl: float = float(os.getenv("CONFIG_CACHE_TTL", "60"))
_refresh_task: asyncio.Task | None = None
_is_refreshing: bool = False

PORT_MAP_DEFAULTS = [
    ("SSH", 2200, 22),
    ("HTTP", 8000, 80),
    ("WEB", 8080, 8081),
    ("Cockpit", 9000, 9090),
    ("FTP", 2100, 21),
]

_PARAM_DEFAULTS: dict[str, tuple[Any, str, str]] = {
    "port_map": (
        [["SSH", 2200, 22], ["HTTP", 8000, 80], ["WEB", 8080, 8081], ["Cockpit", 9000, 9090], ["FTP", 2100, 21]],
        "json",
        "Port mapping: [name, host_base_port, guest_port]",
    ),
    "alert_cpu_warn": (75, "int", "CPU warning threshold"),
    "alert_ram_warn": (75, "int", "RAM warning threshold"),
    "alert_disk_warn": (80, "int", "Disk warning threshold"),
    "alert_cpu_crit": (90, "int", "CPU critical threshold"),
    "alert_ram_crit": (90, "int", "RAM critical threshold"),
    "alert_disk_crit": (90, "int", "Disk critical threshold"),
    "rate_limit_attempts": (5, "int", "Max login attempts"),
    "rate_limit_window": (60, "int", "Login window in seconds"),
    "metrics_interval": (300, "int", "Metrics collection interval in seconds"),
    "metrics_history_maxlen": (288, "int", "Max in-memory history points"),
    "metrics_retention_hours": (48, "int", "DB retention for host_metrics"),
    "max_vm_recreations": (3, "int", "Max VM recreations per assignment"),
    "default_vm_ram_mb": (4096, "int", "Default RAM for cloned VMs"),
    "default_vm_vcpus": (2, "int", "Default vCPUs for cloned VMs"),
    "default_vm_disk_gb": (20, "int", "Default disk for cloned VMs"),
    "avg_vm_ram_gb": (4, "int", "Avg RAM GB for capacity estimation"),
    "avg_vm_disk_gb": (20, "int", "Avg disk GB for capacity estimation"),
    "vcpu_overcommit_ratio": (4, "int", "vCPUs per physical core"),
    "teacher_vm_name": ("vhost-10", "string", "VM excluded from assignments"),
    "host_ip_cache_ttl": (60, "int", "Host IP cache TTL in seconds"),
    "default_template": ("ubuntu-server-main", "string", "Default VM template name"),
    "vm_bridge": ("virbr0", "string", "Default VM bridge interface"),
    "vm_network": ("192.168.122.0/24", "string", "Default VM network CIDR"),
}


def _get_cached(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    val, ts = entry
    if time.monotonic() - ts > _cache_ttl:
        if _can_schedule_refresh():
            _schedule_refresh()
        return val
    return val


def _set_cache(key: str, val: Any):
    _cache[key] = (val, time.monotonic())


def _can_schedule_refresh() -> bool:
    try:
        asyncio.get_running_loop()
        return True
    except RuntimeError:
        return False


def _schedule_refresh():
    if not _is_refreshing:
        asyncio.create_task(refresh_cache())


async def start_config_refresh():
    global _refresh_task
    if _refresh_task is None:
        _refresh_task = asyncio.create_task(_refresh_loop())


async def _refresh_loop():
    while True:
        await asyncio.sleep(_cache_ttl)
        await refresh_cache()


async def refresh_cache():
    global _is_refreshing
    if _is_refreshing:
        return
    _is_refreshing = True
    try:
        from app.database.session import async_session
        from app.models.system_parameter import SystemParameter
        from sqlalchemy import select

        async with async_session() as session:
            result = await session.execute(select(SystemParameter))
            for param in result.scalars().all():
                _set_cache(param.name, param.get_value())
        logger = __import__("logging").getLogger(__name__)
        logger.debug("Config cache refreshed (%d params)", len(_cache))
    except Exception as e:
        logger = __import__("logging").getLogger(__name__)
        logger.warning("Error refreshing config cache: %s", e)
    finally:
        _is_refreshing = False


def get_port_map() -> list[tuple[str, int, int]]:
    val = _get_cached("port_map")
    if val is not None:
        return [tuple(v) for v in val]
    return PORT_MAP_DEFAULTS


def get_cached_int(key: str, default: int) -> int:
    val = _get_cached(key)
    if val is not None:
        return int(val)
    return default


def get_cached_str(key: str, default: str) -> str:
    val = _get_cached(key)
    if val is not None:
        return str(val)
    return default


async def load_config():
    from app.database.session import async_session
    from app.models.system_parameter import SystemParameter
    from sqlalchemy import select

    async with async_session() as session:
        for name, (default_val, value_type, desc) in _PARAM_DEFAULTS.items():
            result = await session.execute(
                select(SystemParameter).where(SystemParameter.name == name)
            )
            existing = result.scalar_one_or_none()
            if not existing:
                if value_type == "json":
                    str_val = json.dumps(default_val)
                else:
                    str_val = str(default_val)
                param = SystemParameter(
                    name=name,
                    value=str_val,
                    value_type=value_type,
                    description=desc,
                )
                session.add(param)

        await session.commit()

        result = await session.execute(select(SystemParameter))
        for param in result.scalars().all():
            _set_cache(param.name, param.get_value())
