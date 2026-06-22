import os
import subprocess
import time

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./linuxlab.db")
SECRET_KEY = os.getenv("SECRET_KEY", "cambiar-en-produccion")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", '["http://localhost:5173"]')
ALGORITHM = "HS256"

VM_SUBNET = os.getenv("VM_SUBNET", "192.168.122")
VM_BRIDGE = os.getenv("VM_BRIDGE", "virbr0")
VM_NETWORK = os.getenv("VM_NETWORK", "default")
STORAGE_PATH = os.getenv("STORAGE_PATH", "/var/lib/libvirt/images")
VM_SSH_USER = os.getenv("VM_SSH_USER", "estudiante")
EMAIL_DOMAIN = os.getenv("EMAIL_DOMAIN", "linuxlab.local")

_host_ip_cache: str | None = None
_host_ip_cache_ts: float = 0
_HOST_IP_CACHE_TTL = 60


def get_host_ip() -> str:
    global _host_ip_cache, _host_ip_cache_ts
    now = time.time()
    if _host_ip_cache is not None and now - _host_ip_cache_ts < _HOST_IP_CACHE_TTL:
        return _host_ip_cache
    override = os.getenv("HOST_IP")
    if override:
        _host_ip_cache = override
        _host_ip_cache_ts = now
        return override
    try:
        r = subprocess.run(
            ["hostname", "-I"], capture_output=True, text=True, timeout=5
        )
        ip = r.stdout.strip().split()[0] if r.stdout.strip() else ""
        if ip:
            _host_ip_cache = ip
            _host_ip_cache_ts = now
            return ip
    except Exception:
        pass
    return "127.0.0.1"
