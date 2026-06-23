import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import VMTemplate, VirtualMachine
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT
from app.services.config_service import get_cached_int, get_cached_str
from app.services.vm_service import build_ports
from app.services.libvirt_network import ensure_dhcp_host

logger = logging.getLogger(__name__)


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


def _domain_to_vm_data(dom) -> dict:
    from app.core.libvirt.vm_manager import STATE_MAP
    try:
        state, max_mem, mem, vcpus, cpu_time = dom.info()
        state_name = STATE_MAP.get(state, "unknown")
        max_mem_mb = int(max_mem / 1024) if max_mem else 2048
    except Exception as e:
        logger.warning("Error obteniendo info de dominio: %s", e)
        state_name = "unknown"
        max_mem_mb = 2048
        vcpus = 1

    try:
        xml = dom.XMLDesc(0)
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml)
        mac_el = root.find(".//mac")
        mac = mac_el.get("address", "") if mac_el is not None else ""
    except Exception as e:
        logger.warning("Error parseando XML del dominio: %s", e)
        mac = ""

    try:
        name = dom.name()
    except Exception as e:
        logger.warning("Error obteniendo nombre del dominio: %s", e)
        name = ""

    num = 0
    try:
        num = int(name.split("-")[-1]) if "-" in name else 0
    except ValueError:
        pass

    is_running = state == 1
    ip = _get_vm_ip(dom) if is_running else None
    if not ip and num:
        from app.core.config import VM_SUBNET
        ip = f"{VM_SUBNET}.{num}"

    ports = build_ports(num) if num else []

    return {
        "name": name,
        "mac_address": mac,
        "ip_address": ip,
        "vcpus": vcpus,
        "ram_mb": max_mem_mb,
        "current_state": state_name,
        "template_name": get_cached_str("default_template", "ubuntu-server-main"),
        "disk_gb": get_cached_int("default_vm_disk_gb", 10),
        "ports": ports,
    }


async def sync_libvirt_domains(session: AsyncSession, setup_iptables: bool = False):
    if not HAVE_LIBVIRT:
        return 0, 0

    conn = get_connection()
    synced = 0
    removed = 0

    libvirt_names = set()
    for domain_id in conn.listDomainsID():
        try:
            dom = conn.lookupByID(domain_id)
            libvirt_names.add(dom.name())
        except Exception as e:
            logger.warning("Error lookup domain ID %s: %s", domain_id, e)

    for name in conn.listDefinedDomains():
        libvirt_names.add(name)

    new_vms = []

    template_result = await session.execute(select(VMTemplate.name))
    all_template_names = {row[0] for row in template_result.all()}

    for vm_name in libvirt_names:
        if vm_name in all_template_names:
            logger.debug("Saltando dominio %s (es plantilla)", vm_name)
            continue

        try:
            dom = conn.lookupByName(vm_name)
            data = _domain_to_vm_data(dom)
        except Exception as e:
            logger.warning("Error obteniendo datos de dominio %s: %s", vm_name, e)
            continue

        existing = await session.execute(
            select(VirtualMachine).where(VirtualMachine.name == vm_name)
        )
        vm = existing.scalar_one_or_none()

        if vm:
            vm.mac_address = data["mac_address"]
            if data["ip_address"]:
                ip_taken = await session.execute(
                    select(VirtualMachine).where(
                        VirtualMachine.ip_address == data["ip_address"],
                        VirtualMachine.name != vm_name,
                    )
                )
                if ip_taken.scalar_one_or_none():
                    logger.debug("IP %s ya asignada a otra VM, ignorando para %s", data["ip_address"], vm_name)
                else:
                    vm.ip_address = data["ip_address"]
            vm.current_state = data["current_state"]
            vm.deleted_at = None
            if not vm.ports:
                vm.ports = data["ports"]
        else:
            vm = VirtualMachine(**data)
            session.add(vm)
            new_vms.append(vm_name)

        if data["mac_address"] and data["ip_address"]:
            try:
                ensure_dhcp_host(vm_name, data["mac_address"], data["ip_address"])
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
                forward_range(num, num)
                logger.info("Reglas iptables restauradas para %s", vm_name)
            except (ValueError, IndexError):
                logger.debug("No se pudo extraer número de VM %s para iptables", vm_name)
            except Exception as e:
                logger.warning("Error configurando iptables para %s: %s", vm_name, e)

    return synced, removed
