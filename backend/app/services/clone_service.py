import asyncio
import logging
import os
import subprocess
import xml.etree.ElementTree as ET
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT
from app.services.config_service import get_cached_str, get_cached_int
from app.services.libvirt_pool import ensure_pool, ensure_template_volume, PoolError
from app.services.libvirt_network import ensure_dhcp_host, remove_dhcp_host, NetworkError

logger = logging.getLogger(__name__)

guestfish_semaphore = asyncio.Semaphore(3)

POOL_NAME = os.getenv("LIBVIRT_POOL", "images")
BRIDGE = os.getenv("VM_BRIDGE", "virbr0")
NETWORK = os.getenv("VM_NETWORK", "default")
MAC_PREFIX = os.getenv("VM_MAC_PREFIX", "52:54:00:35:E0")
STORAGE_PATH = os.getenv("STORAGE_PATH", "/var/lib/libvirt/images")


def mac_from_num(num: int) -> str:
    return f"{MAC_PREFIX}:{num:02X}"


def _domain_xml(name: str, vol_path: str, mac: str, memory_mb: int = 4096, vcpus: int = 2) -> str:
    return f"""<domain type='kvm'>
  <name>{name}</name>
  <memory unit='MB'>{memory_mb}</memory>
  <vcpu placement='static'>{vcpus}</vcpu>
  <os>
    <type arch='x86_64' machine='pc-q35-8.2'>hvm</type>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-passthrough' check='none'/>
  <clock offset='utc'>
    <timer name='rtc' tickpolicy='catchup'/>
  </clock>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='{vol_path}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <mac address='{mac}'/>
      <source network='{NETWORK}'/>
      <model type='virtio'/>
    </interface>
    <serial type='pty'>
      <target port='0'/>
    </serial>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
    <video>
      <model type='qxl'/>
    </video>
    <memballoon model='virtio'/>
  </devices>
</domain>"""


async def _detect_distro(vol_path: str, default: str = "ubuntu") -> str:
    """Detecta la distribución Linux en una imagen qcow2 usando guestfish."""
    def _check() -> str:
        try:
            r = subprocess.run(
                ["guestfish", "-a", vol_path, "-i", "cat", "/etc/os-release"],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                content = r.stdout.lower()
                if "alpine" in content:
                    return "alpine"
                if any(x in content for x in ["rhel", "rocky", "fedora", "almalinux", "centos"]):
                    return "rhel"
                if "ubuntu" in content:
                    return "ubuntu"
                if "debian" in content:
                    return "debian"
        except Exception:
            pass
        return default

    return await asyncio.to_thread(_check)


async def _customize_guest(vol_path: str, hostname: str, initramfs: bool = False, template: str | None = None) -> None:
    """Customiza el guest OS dentro de una imagen qcow2: hostname, red DHCP e initramfs."""
    distro = await _detect_distro(vol_path)
    async with guestfish_semaphore:

        def _run() -> subprocess.CompletedProcess:
            vm_num = hostname.split("-")[-1] if "-" in hostname else "0"
            cockpit_conf = f"""[WebService]
UrlRoot = /mv{vm_num}
ForwardedHeader = X-Forwarded-For
AllowUnencrypted = true
"""

            if distro == "alpine":
                cmds = f"""
                  write /etc/hostname "{hostname}"
                  write /etc/hosts "127.0.0.1 localhost {hostname}
                ::1     localhost ip6-localhost ip6-loopback"
                  rm-f /etc/machine-id
                  write /etc/conf.d/hostname "hostname=\\"{hostname}\\""
                  mkdir-p /etc/cockpit
                  write /etc/cockpit/cockpit.conf "{cockpit_conf}"
                  command "hostname {hostname} 2>/dev/null || true"
                  command "ssh-keygen -A 2>/dev/null || true"
                  command "rc-service cockpit restart 2>/dev/null || true"
                  {('command "update-initramfs -u -k all 2>/dev/null || update-initramfs -u 2>/dev/null || true"' if initramfs else '# initramfs skipped')}
                """
            elif distro == "rhel":
                cmds = f"""
                  write /etc/hostname "{hostname}"
                  write /etc/hosts "127.0.0.1 localhost {hostname}
                ::1     localhost ip6-localhost ip6-loopback"
                  rm-f /etc/machine-id
                  rm-f /var/lib/systemd/random-seed
                  mkdir-p /etc/cockpit
                  write /etc/cockpit/cockpit.conf "{cockpit_conf}"
                  command "hostnamectl set-hostname {hostname} || true"
                  command "ssh-keygen -A 2>/dev/null || true"
                  command "systemctl enable cockpit.socket 2>/dev/null || true"
                  {('command "update-initramfs -u -k all 2>/dev/null || update-initramfs -u 2>/dev/null || true"' if initramfs else '# initramfs skipped')}
                """
            else:
                cmds = f"""
                  write /etc/hostname "{hostname}"
                  write /etc/hosts "127.0.0.1 localhost {hostname}
                ::1     localhost ip6-localhost ip6-loopback"
                  rm-f /etc/machine-id
                  rm-f /var/lib/systemd/random-seed
                  rm-rf /etc/netplan
                  mkdir-p /etc/netplan
                  write /etc/netplan/01-dhcp.yaml "network:
                  version: 2
                  renderer: networkd
                  ethernets:
                    id0:
                      match:
                        name: en*
                      dhcp4: true
                      dhcp6: false"
                  rm-f /etc/network/interfaces
                  rm-f /etc/network/interfaces.d/*
                  mkdir-p /etc/cockpit
                  write /etc/cockpit/cockpit.conf "{cockpit_conf}"
                  command "hostnamectl set-hostname {hostname} || true"
                  command "ssh-keygen -A 2>/dev/null || true"
                  command "systemctl enable cockpit.socket 2>/dev/null || true"
                  {('command "update-initramfs -u -k all 2>/dev/null || update-initramfs -u 2>/dev/null || true"' if initramfs else '# initramfs skipped')}
                """

            return subprocess.run(
                ["guestfish", "-a", vol_path, "-i"],
                input=cmds,
                capture_output=True,
                text=True,
                timeout=120,
            )

        try:
            result = await asyncio.to_thread(_run)
            if result.returncode == 0:
                logger.info("Guest OS customizado (%s): %s", distro, hostname)
            else:
                logger.warning("guestfish stderr para %s (%s): %s", hostname, distro, result.stderr[:500])
        except FileNotFoundError:
            logger.warning("guestfish no instalado, saltando customización de %s", hostname)
        except subprocess.TimeoutExpired:
            logger.warning("guestfish timeout para %s", hostname)
        except Exception as e:
            logger.warning("Error customizando guest %s: %s", hostname, e)


class CloneService:
    async def clone_vm(self, source_name: str, new_name: str, new_mac: str, memory_mb: int = 4096, vcpus: int = 2) -> dict:
        if not HAVE_LIBVIRT:
            logger.error("Intento de clonado sin libvirt disponible")
            return {"success": False, "error": "libvirt no está disponible en este servidor"}

        def _libvirt_clone() -> dict:
            try:
                ensure_pool()
                template_name = source_name or get_cached_str("default_template", "ubuntu-server-main")
                ensure_template_volume(template_name)
            except PoolError as e:
                return {"success": False, "error": str(e)}

            import libvirt
            try:
                conn = get_connection()
                pool = conn.storagePoolLookupByName(POOL_NAME)
            except libvirt.libvirtError as e:
                return {"success": False, "error": f"Error accediendo al storage pool: {e}"}

            template_name = source_name or get_cached_str("default_template", "ubuntu-server-main")
            template_vol_name = f"{template_name}.qcow2"
            try:
                template_vol = pool.storageVolLookupByName(template_vol_name)
            except libvirt.libvirtError as e:
                return {"success": False, "error": f"Volumen plantilla '{template_vol_name}' no encontrado: {e}"}
            template_path = template_vol.path()
            new_vol_name = f"{new_name}.qcow2"
            _disk_gb = get_cached_int("default_vm_disk_gb", 10)

            vol_xml = f"""<volume>
  <name>{new_vol_name}</name>
  <capacity unit='G'>{_disk_gb}</capacity>
  <target>
    <format type='qcow2'/>
    <permissions>
      <mode>0644</mode>
      <owner>0</owner>
      <group>0</group>
    </permissions>
  </target>
  <backingStore>
    <path>{template_path}</path>
    <format type='qcow2'/>
  </backingStore>
</volume>"""

            try:
                new_vol = pool.createXML(vol_xml, 0)
            except libvirt.libvirtError as e:
                return {"success": False, "error": f"Error creando volumen: {e}"}

            vol_path = new_vol.path()
            xml = _domain_xml(new_name, vol_path, new_mac, memory_mb, vcpus)

            try:
                dom = conn.defineXML(xml)
            except libvirt.libvirtError as e:
                new_vol.delete(0)
                return {"success": False, "error": f"Error definiendo dominio: {e}"}

            try:
                num = int(new_name.split("-")[-1])
                ip = f"{os.getenv('VM_SUBNET', '192.168.122')}.{num}"
                ensure_dhcp_host(new_name, new_mac, ip)
            except (ValueError, IndexError, NetworkError) as e:
                logger.warning("No se pudo añadir DHCP host para %s: %s", new_name, e)

            return {
                "success": True,
                "name": dom.name(),
                "uuid": dom.UUIDString(),
                "mac": new_mac,
                "path": vol_path,
                "vol_path": vol_path,
            }

        r = await asyncio.to_thread(_libvirt_clone)
        if r["success"]:
            await _customize_guest(r["vol_path"], new_name, initramfs=True)
            del r["vol_path"]
        return r

    async def recreate_vm(self, vm_name: str, template_name: str = "",
                           mac_address: str | None = None,
                            memory_mb: int = 4096, vcpus: int = 2) -> dict:
        if not HAVE_LIBVIRT:
            logger.error("Intento de recreación sin libvirt disponible")
            return {"success": False, "error": "libvirt no está disponible en este servidor"}

        def _libvirt_recreate() -> dict:
            try:
                ensure_pool()
                tpl = template_name or get_cached_str("default_template", "ubuntu-server-main")
                ensure_template_volume(tpl)
            except PoolError as e:
                return {"success": False, "error": str(e)}

            import libvirt
            try:
                conn = get_connection()
                pool = conn.storagePoolLookupByName(POOL_NAME)
            except libvirt.libvirtError as e:
                return {"success": False, "error": f"Error accediendo al storage pool: {e}"}

            try:
                template_vol = pool.storageVolLookupByName(f"{template_name}.qcow2")
            except libvirt.libvirtError as e:
                return {"success": False, "error": f"Volumen plantilla '{template_name}.qcow2' no encontrado: {e}"}
            template_path = template_vol.path()
            _disk_gb = get_cached_int("default_vm_disk_gb", 10)
            vol_name = f"{vm_name}.qcow2"
            temp_vol_name = f"{vm_name}.recreate.qcow2"

            vol_xml = f"""<volume>
  <name>{temp_vol_name}</name>
  <capacity unit='G'>{_disk_gb}</capacity>
  <target>
    <format type='qcow2'/>
    <permissions>
      <mode>0644</mode>
      <owner>0</owner>
      <group>0</group>
    </permissions>
  </target>
  <backingStore>
    <path>{template_path}</path>
    <format type='qcow2'/>
  </backingStore>
</volume>"""

            # Step 1: CREATE new volume FIRST (safe — old volume still intact)
            try:
                new_vol = pool.createXML(vol_xml, 0)
            except libvirt.libvirtError as e:
                return {"success": False, "error": f"Error creando volumen: {e}"}
            temp_path = new_vol.path()

            try:
                # Step 2: Look up existing domain
                try:
                    dom = conn.lookupByName(vm_name)
                except libvirt.libvirtError:
                    dom = None

                if dom is not None:
                    # Step 2a: Update existing domain to use temp volume
                    if dom.info()[0] == 1:
                        try:
                            dom.destroy()
                        except libvirt.libvirtError:
                            pass
                    xml = dom.XMLDesc()
                    root = ET.fromstring(xml)
                    for disk in root.iter("disk"):
                        source = disk.find("source")
                        if source is not None and source.get("file"):
                            source.set("file", temp_path)
                    # Atomic swap — no undefine() needed
                    conn.defineXML(ET.tostring(root, encoding="unicode"))
                else:
                    # Step 2b: Create new domain with temp volume
                    if not mac_address:
                        new_vol.delete(0)
                        return {"success": False, "error": "mac_address requerido para crear VM nueva en libvirt"}
                    xml = _domain_xml(vm_name, temp_path, mac_address, memory_mb, vcpus)
                    conn.defineXML(xml)

                # Step 3: Delete OLD volume (safe — domain already points to temp)
                try:
                    old_vol = pool.storageVolLookupByName(vol_name)
                    old_vol.delete(0)
                except libvirt.libvirtError as e:
                    logger.warning("No se pudo eliminar volumen anterior %s: %s", vol_name, e)

                # Step 4: Create canonical-name volume (old name is now free)
                canon_vol_xml = vol_xml.replace(f">{temp_vol_name}<", f">{vol_name}<")
                canon_vol = pool.createXML(canon_vol_xml, 0)
                canon_path = canon_vol.path()

                # Step 5: Point domain to canonical path
                dom2 = conn.lookupByName(vm_name)
                xml2 = dom2.XMLDesc()
                root2 = ET.fromstring(xml2)
                for disk in root2.iter("disk"):
                    source = disk.find("source")
                    if source is not None and source.get("file"):
                        source.set("file", canon_path)
                conn.defineXML(ET.tostring(root2, encoding="unicode"))

                # Step 6: Delete temporary volume
                new_vol.delete(0)
                new_path = canon_path

                # DHCP host for new domains
                if dom is None and mac_address:
                    try:
                        num = int(vm_name.split("-")[-1])
                        ip = f"{os.getenv('VM_SUBNET', '192.168.122')}.{num}"
                        ensure_dhcp_host(vm_name, mac_address, ip)
                    except (ValueError, IndexError, NetworkError) as e:
                        logger.warning("No se pudo añadir DHCP host para %s: %s", vm_name, e)

            except Exception as e:
                logger.error("Error en recreate_vm para %s: %s", vm_name, e)
                try:
                    new_vol.delete(0)
                    logger.info("Volumen temporal %s eliminado por limpieza", temp_vol_name)
                except Exception:
                    pass
                return {"success": False, "error": f"Error actualizando VM: {e}"}

            return {"success": True, "name": vm_name, "path": new_path, "vol_path": new_path}

        r = await asyncio.to_thread(_libvirt_recreate)
        if r["success"]:
            await _customize_guest(r["vol_path"], vm_name, initramfs=True)
            del r["vol_path"]
        return r

    async def delete_vm_storage(self, vm_name: str) -> bool:
        if not HAVE_LIBVIRT:
            return True

        def _delete() -> bool:
            import libvirt
            conn = get_connection()
            pool = conn.storagePoolLookupByName(POOL_NAME)
            vol_name = f"{vm_name}.qcow2"
            try:
                vol = pool.storageVolLookupByName(vol_name)
                vol.delete(0)
                return True
            except libvirt.libvirtError:
                return False

        return await asyncio.to_thread(_delete)
