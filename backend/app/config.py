import os
import subprocess

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./linuxlab.db")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
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


def get_host_ip() -> str:
    override = os.getenv("HOST_IP")
    if override:
        return override
    try:
        r = subprocess.run(
            ["hostname", "-I"], capture_output=True, text=True, timeout=5
        )
        ip = r.stdout.strip().split()[0] if r.stdout.strip() else ""
        if ip:
            return ip
    except Exception:
        pass
    return "127.0.0.1"
