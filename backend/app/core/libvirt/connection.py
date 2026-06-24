import logging
import os
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

LIBVIRT_URI = os.getenv("LIBVIRT_URI", "qemu:///system")

try:
    import libvirt
    HAVE_LIBVIRT = True
except ImportError:
    HAVE_LIBVIRT = False
    libvirt = None
    logger.warning("libvirt no disponible ")

_conn: Optional[object] = None
_conn_lock = threading.Lock()
_last_health_check: float = 0
_HEALTH_CHECK_INTERVAL = 5.0


def _is_connection_alive(conn: object) -> bool:
    global _last_health_check
    now = time.time()
    if now - _last_health_check < _HEALTH_CHECK_INTERVAL:
        return True
    _last_health_check = now
    if not HAVE_LIBVIRT:
        return True
    try:
        conn.getURI()
        conn.getLibVersion()
        return True
    except libvirt.libvirtError:
        return False
    except AttributeError:
        return True


def get_connection() -> object:
    global _conn
    if not HAVE_LIBVIRT:
        return DummyConnection()

    with _conn_lock:
        if _conn is not None:
            if _is_connection_alive(_conn):
                return _conn
            logger.warning("Conexión libvirt obsoleta, reconectando...")
            try:
                _conn.close()
            except Exception:
                pass
            _conn = None

        logger.info("Conectando a libvirt (%s)", LIBVIRT_URI)
        _conn = libvirt.open(LIBVIRT_URI)
        if _conn is None:
            raise RuntimeError("No se pudo abrir conexión a libvirt")
        return _conn


def close_connection():
    global _conn
    if HAVE_LIBVIRT and _conn:
        try:
            _conn.close()
        except Exception:
            pass
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

    def listAllDomains(self, flags=0):
        return []

    def listDefinedDomains(self):
        return []

    def listDomainsID(self):
        return []

    def lookupByID(self, domain_id):
        return DummyDomain(f"vhost-{domain_id}")

    def lookupByName(self, name):
        return DummyDomain(name)
