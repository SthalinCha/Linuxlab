import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VirtualMachine
from app.core.audit import log_event
from app.core.utils import num_from_name
from app.services.iptables_service import forward_port, unforward_port
from app.core.config import VM_SUBNET

logger = logging.getLogger(__name__)

_port_lock = asyncio.Lock()


async def add_port_to_vm(session: AsyncSession, vm_id: int, service: str, port: int,
                         username: str, ip_address: str) -> dict | None:
    async with _port_lock:
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
        )
        vm = result.scalar_one_or_none()
        if not vm:
            return None

        ports = list(vm.ports) if vm.ports else []

        used_host_ports = set()
        result = await session.execute(
            select(VirtualMachine.ports).where(
                VirtualMachine.deleted_at.is_(None),
                VirtualMachine.ports.isnot(None),
            )
        )
        for ports in result.scalars().all():
            if ports:
                for p in ports:
                    used_host_ports.add(p["host"])

        next_host = 10000
        while next_host in used_host_ports:
            next_host += 1

        ports.append({"host": next_host, "vm": port, "service": service})
        vm.ports = ports
        await session.flush()

    num = num_from_name(vm.name)
    dest_ip = f"{VM_SUBNET}.{num}" if num else vm.ip_address or ""
    iptables_ok = True
    if dest_ip:
        ok, msg = forward_port(dest_ip, next_host, port, f"{service} custom {vm.name}")
        if not ok:
            iptables_ok = False
            logger.warning("Error creando regla iptables para puerto custom: %s", msg)

    await session.commit()
    await session.refresh(vm)

    await log_event(session, "port_add", username,
                    f"Añadió puerto {service}:{next_host}→{port} a {vm.name}",
                    "vm", vm.id, ip_address=ip_address)
    return vm


async def remove_port_from_vm(session: AsyncSession, vm_id: int, port_index: int,
                              username: str, ip_address: str) -> dict | None:
    async with _port_lock:
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
        )
        vm = result.scalar_one_or_none()
        if not vm:
            return None

        ports = list(vm.ports) if vm.ports else []
        if port_index < 0 or port_index >= len(ports):
            return None

        removed = ports.pop(port_index)
        vm.ports = ports
        await session.flush()

    num = num_from_name(vm.name)
    dest_ip = f"{VM_SUBNET}.{num}" if num else vm.ip_address or ""
    iptables_ok = True
    if dest_ip and removed.get("host"):
        ok, msg = unforward_port(dest_ip, removed["host"], removed["vm"],
                                 f"{removed.get('service', '?')} custom {vm.name}")
        if not ok:
            iptables_ok = False
            logger.warning("Error eliminando regla iptables para puerto custom: %s", msg)

    await session.commit()
    await session.refresh(vm)

    await log_event(session, "port_remove", username,
                    f"Eliminó puerto {removed.get('service', '?')}:{removed.get('host', '?')} de {vm.name}",
                    "vm", vm.id, ip_address=ip_address)
    return vm


async def bulk_add_ports_to_vm(session: AsyncSession, vm_id: int, ports: list[dict],
                                username: str, ip_address: str) -> dict | None:
    async with _port_lock:
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
        )
        vm = result.scalar_one_or_none()
        if not vm:
            return None

        existing = list(vm.ports) if vm.ports else []
        for p in ports:
            service = p.get("service", "").strip().upper()
            service_name = p.get("serviceName") or p.get("service_name") or service
            if service_name:
                service_name = service_name.strip().upper()
            entry = {"host": p["host"], "vm": p["vm"], "service": service}
            if service_name:
                entry["service_name"] = service_name
            existing.append(entry)
        vm.ports = existing
        await session.flush()

    await session.commit()
    await session.refresh(vm)

    await log_event(session, "ports_bulk_add", username,
                    f"Añadidos {len(ports)} puertos a {vm.name}",
                    "vm", vm.id, ip_address=ip_address)
    return vm
