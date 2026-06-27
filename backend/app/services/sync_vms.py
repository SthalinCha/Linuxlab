import asyncio
import logging
import time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import VMTemplate, VirtualMachine
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT
from app.services.config_service import get_cached_int, get_cached_str
from app.services.vm_service import build_ports
from app.services.libvirt_network import ensure_dhcp_host

logger = logging.getLogger(__name__)

_sync_cache_time: float = 0
_SYNC_CACHE_TTL = 15


def _get_vm_ip(dom) -> str | None:
    import libvirt
    src_sources = [libvirt.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE]
    if hasattr(libvirt, "VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP"):
        src_sources.append(libvirt.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP)
    for src in src_sources:
        try:
            addrs = dom.interfaceAddresses(src)
            for iface_name, iface_data in addrs.items():
                for addr_info in iface_data.get("addrs", []):
                    if addr_info.get("type") in (0, getattr(libvirt, "VIR_IP_ADDR_TYPE_IPV4", 0)):
                        ip = addr_info.get("addr", "")
                        if ip:
                            return ip
        except Exception:
            continue
    return None


async def sync_libvirt_domains(session: AsyncSession, setup_iptables: bool = False):
    if not HAVE_LIBVIRT:
        return 0, 0

    global _sync_cache_time
    now = time.time()
    if now - _sync_cache_time < _SYNC_CACHE_TTL:
        return 0, 0
    _sync_cache_time = now

    from app.core.libvirt.vm_manager import get_manager
    mgr = get_manager()
    domains = await asyncio.to_thread(mgr.list_domains)
    conn = get_connection()
    synced = 0
    removed = 0
    new_vms = []

    template_result = await session.execute(select(VMTemplate.name))
    all_template_names = {row[0] for row in template_result.all()}

    # Pre-fetch all IPs to avoid N+1 IP conflict checks
    ip_result = await session.execute(
        select(VirtualMachine.ip_address).where(
            VirtualMachine.ip_address.isnot(None),
            VirtualMachine.deleted_at.is_(None),
        )
    )
    all_ips = {row[0] for row in ip_result}

    # Batch-load all existing VMs by name to avoid N+1
    domain_names = [d["name"] for d in domains if d["name"] not in all_template_names]
    if domain_names:
        existing_result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.name.in_(domain_names))
        )
        vm_map: dict[str, VirtualMachine] = {vm.name: vm for vm in existing_result.scalars().all()}
    else:
        vm_map = {}

    for dom_data in domains:
        vm_name = dom_data["name"]
        if vm_name in all_template_names:
            logger.debug("Saltando dominio %s (es plantilla)", vm_name)
            continue

        mac = dom_data.get("mac_address", "").upper()
        state_name = dom_data["state"]
        vcpus = dom_data.get("vcpus", 1)
        max_mem_mb = dom_data.get("max_mem_mb", 2048)
        is_running = state_name == "running"

        num = 0
        try:
            num = int(vm_name.split("-")[-1]) if "-" in vm_name else 0
        except ValueError:
            pass

        ip = None
        if is_running:
            try:
                dom = conn.lookupByName(vm_name)
                ip = _get_vm_ip(dom)
            except Exception:
                pass

        if not ip and num:
            from app.core.config import VM_SUBNET
            ip = f"{VM_SUBNET}.{num}"

        ports = build_ports(num) if num else []
        template_name = get_cached_str("default_template", "ubuntu-server-main")
        disk_gb = get_cached_int("default_vm_disk_gb", 10)

        vm = vm_map.get(vm_name)

        if vm:
            vm.mac_address = mac
            if ip:
                if ip not in all_ips or ip == vm.ip_address:
                    if vm.ip_address and vm.ip_address in all_ips:
                        all_ips.discard(vm.ip_address)
                    all_ips.add(ip)
                    vm.ip_address = ip
                else:
                    logger.debug("IP %s ya asignada a otra VM, ignorando para %s", ip, vm_name)
            vm.current_state = state_name
            vm.deleted_at = None
            if not vm.ports:
                vm.ports = ports
        else:
            vm = VirtualMachine(
                name=vm_name,
                mac_address=mac,
                ip_address=ip,
                vcpus=vcpus,
                ram_mb=max_mem_mb,
                current_state=state_name,
                template_name=template_name,
                disk_gb=disk_gb,
                ports=ports,
            )
            session.add(vm)
            new_vms.append(vm_name)
            if ip:
                all_ips.add(ip)

        if mac and ip:
            try:
                ensure_dhcp_host(vm_name, mac, ip)
            except Exception as e:
                logger.warning("Error añadiendo DHCP host para %s: %s", vm_name, e)

        synced += 1

    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.warning("Error en commit de sync_vms: %s", e)

    if setup_iptables:
        try:
            result = await session.execute(select(VirtualMachine.name))
            all_vm_names = result.scalars().all()
        except Exception:
            all_vm_names = []

        names_to_provision = set(new_vms) | {n for n in all_vm_names if n}
        for vm_name in sorted(names_to_provision):
            try:
                num = int(vm_name.split("-")[-1])
                from app.services.iptables_service import forward_range
                await forward_range(num, num)
                logger.info("Reglas iptables restauradas para %s", vm_name)
            except (ValueError, IndexError):
                logger.debug("No se pudo extraer número de VM %s para iptables", vm_name)
            except Exception as e:
                logger.warning("Error configurando iptables para %s: %s", vm_name, e)

    return synced, removed
