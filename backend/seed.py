"""
Seed script: populate DB with existing libvirt domains and create admin user.

Usage:
    # Development (SQLite)
    python seed.py

    # Production (MariaDB via Docker)
    docker compose exec backend python seed.py

Idempotent: safe to run multiple times.
"""

import asyncio
import sys
import libvirt
from sqlalchemy import select
from app.database.session import async_session, engine
from app.database.models import Base, Admin, VirtualMachine
from app.core.security import hash_password
from app.config import VM_SUBNET
from app.services.vm_service import build_ports

TEMPLATE_NAME = "ubuntu-server-main"
MAC_PREFIX = "52:54:00:35:E0"


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        existing_admin = await session.execute(
            select(Admin).where(Admin.username == "admin")
        )
        if not existing_admin.scalar_one_or_none():
            admin = Admin(
                username="admin",
                password_hash=hash_password("linuxlab"),
                full_name="Administrador",
            )
            session.add(admin)
            print("Admin creado: admin / linuxlab")
        else:
            print("Admin ya existe")

        try:
            conn = libvirt.open("qemu:///system")
        except libvirt.libvirtError as e:
            print(f"Error conectando a libvirt: {e}")
            await session.commit()
            return

        all_names = list(conn.listDefinedDomains())
        for domain_id in conn.listDomainsID():
            dom = conn.lookupByID(domain_id)
            if dom.name() not in all_names:
                all_names.append(dom.name())

        states = {0: "no state", 1: "running", 2: "blocked", 3: "paused",
                  4: "shutdown", 5: "shut off", 6: "crashed", 7: "suspended"}

        created = 0
        for name in sorted(all_names):
            if name == TEMPLATE_NAME:
                continue

            existing = await session.execute(
                select(VirtualMachine).where(VirtualMachine.name == name)
            )
            if existing.scalar_one_or_none():
                continue

            dom = conn.lookupByName(name)
            state, max_mem, mem, vcpus, cpu_time = dom.info()

            try:
                xml = dom.XMLDesc(0)
                import xml.etree.ElementTree as ET
                root = ET.fromstring(xml)
                mac_elem = root.find(".//mac")
                mac = mac_elem.get("address") if mac_elem is not None else ""
            except (libvirt.libvirtError, ET.ParseError):
                mac = ""

            try:
                mac_hex = mac.split(":")[-1]
                num = int(mac_hex, 16)
                ip = f"{VM_SUBNET}.{num}"
                ports = build_ports(num)
            except (ValueError, IndexError):
                ip = ""
                ports = []

            vm = VirtualMachine(
                name=name,
                template_name=TEMPLATE_NAME,
                mac_address=mac,
                ip_address=ip,
                vcpus=vcpus,
                ram_mb=max_mem // 1024,
                disk_gb=10,
                current_state=states.get(state, "unknown"),
                ports=ports,
            )
            session.add(vm)
            created += 1

        conn.close()
        await session.commit()
        print(f"Seed completado. {created} VMs creadas.")


if __name__ == "__main__":
    asyncio.run(seed())
