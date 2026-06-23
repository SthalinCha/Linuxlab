import logging
import os
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT

logger = logging.getLogger(__name__)

NETWORK = os.getenv("VM_NETWORK", "default")


class NetworkError(Exception):
    pass


def dhcp_host_exists(mac: str) -> bool:
    """Verifica si un DHCP host con esa MAC ya existe en la red."""
    import libvirt
    conn = get_connection()
    try:
        network = conn.networkLookupByName(NETWORK)
    except libvirt.libvirtError:
        return False
    try:
        xml = network.XMLDesc(0)
    except libvirt.libvirtError:
        return False
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    for ip in root.findall(".//ip"):
        dhcp = ip.find("dhcp")
        if dhcp is not None:
            for host in dhcp.findall("host"):
                if host.get("mac", "").lower() == mac.lower():
                    return True
    return False


def ensure_dhcp_host(name: str, mac: str, ip: str) -> None:
    if not HAVE_LIBVIRT:
        raise NetworkError("libvirt no está disponible en este servidor")

    import libvirt
    conn = get_connection()
    try:
        network = conn.networkLookupByName(NETWORK)
    except libvirt.libvirtError as e:
        raise NetworkError(f"Red '{NETWORK}' no encontrada: {e}")

    xml = f"<host mac='{mac}' name='{name}' ip='{ip}'/>"

    if dhcp_host_exists(mac):
        logger.debug("DHCP host ya existe (verificado): %s (%s)", name, mac)
        return

    try:
        network.update(
            libvirt.VIR_NETWORK_UPDATE_COMMAND_ADD_LAST,
            libvirt.VIR_NETWORK_SECTION_IP_DHCP_HOST,
            -1,
            xml,
            libvirt.VIR_NETWORK_UPDATE_AFFECT_LIVE | libvirt.VIR_NETWORK_UPDATE_AFFECT_CONFIG,
        )
        logger.info("DHCP host añadido: %s (%s → %s)", name, mac, ip)
    except libvirt.libvirtError as e:
        msg = str(e).lower()
        if "already exists" in msg or "duplicate" in msg or "existing" in msg:
            logger.debug("DHCP host ya existe: %s (%s)", name, mac)
        else:
            logger.warning("Error añadiendo DHCP host %s: %s", name, e)


def remove_dhcp_host(mac: str) -> None:
    if not HAVE_LIBVIRT:
        return

    import libvirt
    conn = get_connection()
    try:
        network = conn.networkLookupByName(NETWORK)
    except libvirt.libvirtError:
        return

    xml = f"<host mac='{mac}'/>"

    try:
        network.update(
            libvirt.VIR_NETWORK_UPDATE_COMMAND_DELETE,
            libvirt.VIR_NETWORK_SECTION_IP_DHCP_HOST,
            -1,
            xml,
            libvirt.VIR_NETWORK_UPDATE_AFFECT_LIVE | libvirt.VIR_NETWORK_UPDATE_AFFECT_CONFIG,
        )
        logger.info("DHCP host eliminado: %s", mac)
    except libvirt.libvirtError:
        pass
