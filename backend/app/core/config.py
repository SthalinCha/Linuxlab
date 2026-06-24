import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY or SECRET_KEY == "cambiar-por-clave-segura-aqui":
    raise RuntimeError(
        "SECRET_KEY no configurada o es un placeholder. "
        "Genera una clave con: openssl rand -hex 32 "
        "y agregala al archivo .env como SECRET_KEY=<tu-clave>"
    )

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no configurada. "
        "Agregala al archivo .env, ej: "
        "DATABASE_URL=mysql+aiomysql://user:pass@127.0.0.1:3306/linuxlab"
    )

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

HOST_IP = os.getenv("HOST_IP")
if not HOST_IP:
    raise RuntimeError(
        "HOST_IP no configurada. "
        "Agregala al archivo .env con la IP real del servidor, ej: "
        "HOST_IP=192.168.1.100"
    )


def get_host_ip() -> str:
    return HOST_IP
