import asyncio
import logging
import time
import xml.etree.ElementTree as ET
from typing import Optional, List
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT

logger = logging.getLogger(__name__)

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

_manager: Optional["VMManager"] = None


def get_manager() -> "VMManager":
    global _manager
    if _manager is None:
        _manager = VMManager()
    return _manager


class VMManager:
    def __init__(self):
        self._domains_cache: list[dict] | None = None
        self._domains_cache_time: float = 0

    def invalidate_cache(self):
        self._domains_cache = None

    def get_cached_if_fresh(self) -> Optional[List[dict]]:
        now = time.time()
        if self._domains_cache is not None and now - self._domains_cache_time < _DOMAINS_CACHE_TTL:
            return list(self._domains_cache)
        return None

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

    @staticmethod
    def _parse_domain_xml(dom) -> tuple[str, int]:
        xml = dom.XMLDesc(0)
        root = ET.fromstring(xml)
        mac = ""
        mac_el = root.find(".//mac")
        if mac_el is not None:
            mac = mac_el.get("address", "").upper()
        rss_mb = 0
        try:
            if hasattr(dom, 'memoryStats'):
                stats = dom.memoryStats()
                rss_kib = stats.get('rss', 0)
                if rss_kib:
                    rss_mb = rss_kib // 1024
        except (LIBVIRT_ERR, Exception) as e:
            logger.debug("memoryStats no disponible para %s: %s", dom.name(), e)
        return mac, rss_mb

    def list_domains(self) -> List[dict]:
        now = time.time()
        if self._domains_cache is not None and now - self._domains_cache_time < _DOMAINS_CACHE_TTL:
            return list(self._domains_cache)
        conn = get_connection()
        domains = []
        for dom in conn.listAllDomains(0):
            try:
                state, max_mem, mem, vcpus, cpu_time = dom.info()
                mac, rss_mb = self._parse_domain_xml(dom)
            except LIBVIRT_ERR:
                continue
            max_mem_mb = max_mem // 1024
            mem_mb = mem // 1024
            cpu_time_sec = cpu_time / 1e9
            ram_used = rss_mb if rss_mb else mem_mb
            domains.append({
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
            })
        result = sorted(domains, key=lambda d: d["name"])
        self._domains_cache = result
        self._domains_cache_time = now
        return result

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
