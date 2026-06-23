import logging
import os
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT

logger = logging.getLogger(__name__)

POOL_NAME = os.getenv("LIBVIRT_POOL", "images")


class PoolError(Exception):
    pass


def ensure_pool() -> None:
    if not HAVE_LIBVIRT:
        raise PoolError("libvirt no está disponible en este servidor")

    import libvirt
    conn = get_connection()
    try:
        conn.storagePoolLookupByName(POOL_NAME)
    except libvirt.libvirtError:
        raise PoolError(
            f"Storage pool '{POOL_NAME}' no existe. "
            f"Crealo con: virsh pool-define-as {POOL_NAME} dir --target /var/lib/libvirt/images && "
            f"virsh pool-build {POOL_NAME} && virsh pool-start {POOL_NAME}"
        )


def ensure_template_volume(template_name: str) -> str:
    if not HAVE_LIBVIRT:
        raise PoolError("libvirt no está disponible en este servidor")

    import libvirt
    conn = get_connection()
    pool = conn.storagePoolLookupByName(POOL_NAME)
    vol_name = f"{template_name}.qcow2"
    try:
        vol = pool.storageVolLookupByName(vol_name)
        return vol.path()
    except libvirt.libvirtError:
        raise PoolError(
            f"Volumen '{vol_name}' no encontrado en pool '{POOL_NAME}'. "
            f"Descarga la imagen a /var/lib/libvirt/images/{vol_name} "
            f"y ejecuta: virsh pool-refresh {POOL_NAME}"
        )


def get_pool_volume_names() -> set[str]:
    if not HAVE_LIBVIRT:
        return set()
    import libvirt
    conn = get_connection()
    try:
        pool = conn.storagePoolLookupByName(POOL_NAME)
        return {vol.name() for vol in pool.listAllVolumes()}
    except libvirt.libvirtError:
        return set()
