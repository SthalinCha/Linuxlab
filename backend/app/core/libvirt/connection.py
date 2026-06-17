import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import libvirt
    HAVE_LIBVIRT = True
except ImportError:
    HAVE_LIBVIRT = False
    libvirt = None
    logger.warning("libvirt no disponible ")

_conn: Optional[object] = None


def get_connection() -> object:
    global _conn
    if not HAVE_LIBVIRT:
        return DummyConnection()
    if _conn is None:
        logger.info("Conectando a libvirt (qemu:///system)")
        _conn = libvirt.open("qemu:///system")
    return _conn


def close_connection():
    global _conn
    if HAVE_LIBVIRT and _conn:
        _conn.close()
        _conn = None


class DummyDomain:
    def __init__(self, name):
        self._name = name
        import hashlib
        h = hashlib.md5(name.encode()).hexdigest()[:6]
        self._mac = "52:54:00:{:02X}:{:02X}:{:02X}".format(
            int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        )
        self._uuid = "00000000-0000-0000-0000-{}-{}".format(h[:4], h[4:])

    def name(self):
        return self._name

    def UUIDString(self):
        return self._uuid

    def info(self):
        return [5, 0, 0, 0, 0]

    def XMLDesc(self, flags):
        return (
            "<domain><name>{}</name><devices>"
            "<interface><mac address='{}'/></interface>"
            "</devices></domain>"
        ).format(self._name, self._mac)

    def create(self):
        return True

    def shutdown(self):
        return True

    def reboot(self, flags=0):
        return True

    def destroy(self):
        return True

    def undefine(self):
        return True


class DummyConnection:
    def getInfo(self):
        import os
        return [os.cpu_count() or 4, 0, 0, 0]

    def getMemoryStats(self, *args, **kwargs):
        import psutil
        mem = psutil.virtual_memory()
        return {"total": mem.total // 1024, "free": mem.available // 1024}

    def getHostname(self):
        import socket
        return socket.gethostname()

    def listDefinedDomains(self):
        return []

    def listDomainsID(self):
        return []

    def lookupByID(self, domain_id):
        return DummyDomain(f"vhost-{domain_id}")

    def lookupByName(self, name):
        return DummyDomain(name)
