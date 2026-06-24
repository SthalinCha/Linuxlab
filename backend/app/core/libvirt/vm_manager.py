import asyncio
import logging
import time
from typing import Optional, List
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT

logger = logging.getLogger(__name__)

# When libvirt is not available, use Exception as fallback error class
if HAVE_LIBVIRT:
    import libvirt
    LIBVIRT_ERR = libvirt.libvirtError
else:
    LIBVIRT_ERR = Exception

STATE_MAP = {
    0: "no state",
    1: "running",
    2: "blocked",
    3: "paused",
    4: "shutdown",
    5: "shut off",
    6: "crashed",
    7: "suspended",
}

_DOMAINS_CACHE_TTL = 3


class VMManager:
    def __init__(self):
        self._domains_cache: list[dict] | None = None
        self._domains_cache_time: float = 0

    def invalidate_cache(self):
        self._domains_cache = None

    async def list_domains_async(self) -> List[dict]:
        return await asyncio.to_thread(self.list_domains)

    async def get_domain_async(self, name: str) -> Optional[dict]:
        return await asyncio.to_thread(self.get_domain, name)

    async def start_async(self, name: str) -> bool:
        self.invalidate_cache()
        return await asyncio.to_thread(self.start, name)

    async def shutdown_async(self, name: str) -> bool:
        self.invalidate_cache()
        return await asyncio.to_thread(self.shutdown, name)

    async def reboot_async(self, name: str) -> bool:
        self.invalidate_cache()
        return await asyncio.to_thread(self.reboot, name)

    async def destroy_async(self, name: str) -> bool:
        self.invalidate_cache()
        return await asyncio.to_thread(self.destroy, name)

    async def undefine_async(self, name: str) -> bool:
        self.invalidate_cache()
        return await asyncio.to_thread(self.undefine, name)

    def list_domains(self) -> List[dict]:
        now = time.time()
        if self._domains_cache is not None and now - self._domains_cache_time < _DOMAINS_CACHE_TTL:
            return list(self._domains_cache)
        conn = get_connection()
        domains = []
        for domain_id in conn.listDomainsID():
            dom = conn.lookupByID(domain_id)
            state, max_mem, mem, vcpus, cpu_time = dom.info()
            domains.append(self._domain_info(dom, state, max_mem, vcpus, mem, cpu_time))
        for name in conn.listDefinedDomains():
            dom = conn.lookupByName(name)
            state, max_mem, mem, vcpus, cpu_time = dom.info()
            domains.append(self._domain_info(dom, state, max_mem, vcpus, mem, cpu_time))
        result = sorted(domains, key=lambda d: d["name"])
        self._domains_cache = result
        self._domains_cache_time = now
        return result

    @staticmethod
    def _get_mac(dom) -> str:
        try:
            xml = dom.XMLDesc(0)
            import xml.etree.ElementTree as ET
            root = ET.fromstring(xml)
            mac = root.find(".//mac")
            if mac is not None:
                return mac.get("address", "").upper()
        except (LIBVIRT_ERR, ET.ParseError) as e:
            logger.debug("Error obteniendo MAC de %s: %s", dom.name() if hasattr(dom, 'name') else '?', e)
        return ""

    @staticmethod
    def _get_rss_mb(dom) -> int:
        try:
            if hasattr(dom, 'memoryStats'):
                stats = dom.memoryStats()
                rss_kib = stats.get('rss', 0)
                if rss_kib:
                    return rss_kib // 1024
        except (LIBVIRT_ERR, Exception) as e:
            logger.debug("memoryStats no disponible para %s: %s", dom.name() if hasattr(dom, 'name') else '?', e)
        return 0

    def _domain_info(self, dom, state: int, max_mem: int, vcpus: int, mem: int = 0, cpu_time: int = 0) -> dict:
        mac = self._get_mac(dom)
        max_mem_mb = max_mem // 1024
        mem_kib = mem
        mem_mb = mem_kib // 1024
        cpu_time_sec = cpu_time / 1e9
        rss_mb = self._get_rss_mb(dom)
        ram_used = rss_mb if rss_mb else mem_mb
        return {
            "name": dom.name(),
            "uuid": dom.UUIDString(),
            "state": STATE_MAP.get(state, "unknown"),
            "state_code": state,
            "max_mem_mb": max_mem_mb,
            "ram_used_mb": ram_used,
            "ram_rss_mb": rss_mb,
            "ram_percent": round((ram_used * 1024 / max_mem * 100), 1) if max_mem > 0 else 0,
            "vcpus": vcpus,
            "cpu_time_sec": round(cpu_time_sec, 3),
            "mac_address": mac,
        }

    def get_domain(self, name: str) -> Optional[dict]:
        domains = self.list_domains()
        for d in domains:
            if d["name"] == name:
                return d
        return None

    def start(self, name: str) -> bool:
        conn = get_connection()
        try:
            dom = conn.lookupByName(name)
            dom.create()
            return True
        except LIBVIRT_ERR as e:
            logger.error("Error iniciando VM %s: %s", name, e)
            return False

    def shutdown(self, name: str) -> bool:
        conn = get_connection()
        try:
            dom = conn.lookupByName(name)
            dom.shutdown()
            return True
        except LIBVIRT_ERR as e:
            logger.error("Error apagando VM %s: %s", name, e)
            return False

    def reboot(self, name: str) -> bool:
        conn = get_connection()
        try:
            dom = conn.lookupByName(name)
            dom.reboot(0)
            return True
        except LIBVIRT_ERR as e:
            logger.error("Error reiniciando VM %s: %s", name, e)
            return False

    def destroy(self, name: str) -> bool:
        conn = get_connection()
        try:
            dom = conn.lookupByName(name)
            dom.destroy()
            return True
        except LIBVIRT_ERR as e:
            logger.error("Error destruyendo VM %s: %s", name, e)
            return False

    def undefine(self, name: str) -> bool:
        conn = get_connection()
        try:
            dom = conn.lookupByName(name)
            dom.undefine()
            return True
        except LIBVIRT_ERR as e:
            logger.error("Error undefine VM %s: %s", name, e)
            return False
