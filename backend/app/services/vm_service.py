from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import VirtualMachine

# Fuente única de puertos por defecto
DEFAULT_PORT_MAP = [
    ("SSH", 2200, 22),
    ("HTTP", 8000, 80),
    ("WEB", 8080, 8081),
    ("Cockpit", 9000, 9090),
    ("FTP", 2100, 21),
]


def build_ports(num: int) -> list[dict]:
    return [
        {"host": base + num, "vm": vm_port, "service": name}
        for name, base, vm_port in DEFAULT_PORT_MAP
    ]


async def get_vm_by_name(session: AsyncSession, name: str) -> Optional[VirtualMachine]:
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.name == name))
    return result.scalar_one_or_none()


async def get_vm_by_mac(session: AsyncSession, mac: str) -> Optional[VirtualMachine]:
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.mac_address == mac))
    return result.scalar_one_or_none()


async def list_vms(session: AsyncSession, state: Optional[str] = None):
    query = select(VirtualMachine).where(VirtualMachine.is_active == True)
    if state:
        query = query.where(VirtualMachine.current_state == state)
    query = query.order_by(VirtualMachine.name)
    result = await session.execute(query)
    return result.scalars().all()
