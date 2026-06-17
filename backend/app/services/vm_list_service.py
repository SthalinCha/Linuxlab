import asyncio
import time
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VirtualMachine


_cpu_cache: dict[str, dict] = {}


async def list_vms(
    session: AsyncSession,
    vm_manager,
    state: Optional[str] = None,
    include_templates: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    from app.services.sync_vms import sync_libvirt_domains
    await sync_libvirt_domains(session)

    query = select(VirtualMachine).where(VirtualMachine.deleted_at.is_(None))
    if not include_templates:
        query = query.where(VirtualMachine.template_id.is_(None))
    if state:
        query = query.where(VirtualMachine.current_state == state)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0

    query = query.order_by(VirtualMachine.name).offset(offset).limit(limit)
    result = await session.execute(query)
    vms = result.scalars().all()

    domains = await asyncio.to_thread(vm_manager.list_domains)
    domain_map = {d["name"]: d for d in domains}

    now = time.time()
    active_names = set()
    for vm in vms:
        active_names.add(vm.name)
        domain = domain_map.get(vm.name)
        if domain:
            vm.current_state = domain["state"]
            vm.ram_used_mb = domain.get("ram_used_mb")
            vm.ram_percent = domain.get("ram_percent")
            vm.max_ram_mb = domain.get("max_mem_mb")
            live_vcpus = domain.get("vcpus")
            vm.live_vcpus = live_vcpus

            cpu_time_sec = domain.get("cpu_time_sec", 0)
            prev = _cpu_cache.get(vm.name)
            if prev and cpu_time_sec > prev["cpu_time"] and domain["state"] == "running":
                elapsed = now - prev["time"]
                if elapsed > 0:
                    cpu_delta = cpu_time_sec - prev["cpu_time"]
                    vcpus = live_vcpus or vm.vcpus
                    pct = (cpu_delta / elapsed) / vcpus * 100
                    vm.cpu_usage_percent = round(min(max(pct, 0), 100), 1)
            _cpu_cache[vm.name] = {"cpu_time": cpu_time_sec, "time": now}

    # Purge stale entries for VMs no longer in the result set
    stale = [name for name in _cpu_cache if name not in active_names]
    for name in stale:
        del _cpu_cache[name]

    return {"items": vms, "total": total, "limit": limit, "offset": offset}
