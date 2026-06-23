"""
Seed script: inicialización completa del sistema LinuxLab.

Crea roles, usuario administrador y plantillas VM.
Único punto de bootstrap — ejecutar después del primer deploy.

Usage:
    docker compose exec backend sh -c "PYTHONPATH=/app python migrations/seed.py"

Idempotent: safe to run multiple times.
"""

import asyncio
import os
from sqlalchemy import select
from app.database.session import async_session
from app.models import Role, User, VMTemplate
from app.core.security import hash_password
from app.core.config import EMAIL_DOMAIN

ROLES = [
    Role(name="admin", description="Administrador del sistema"),
    Role(name="profesor", description="Profesor"),
]

TEMPLATES = [
    VMTemplate(name="ubuntu-server-main",     description="Ubuntu Server 26.04 LTS",  vcpus=2, ram_mb=4096, disk_gb=20),
    VMTemplate(name="debian-server-main",     description="Debian 13",                vcpus=2, ram_mb=4096, disk_gb=20),
    VMTemplate(name="almalinux-server-main",  description="AlmaLinux 10.2",            vcpus=2, ram_mb=4096, disk_gb=20),
    VMTemplate(name="rocky-linux-server-main",description="Rocky Linux 10.2",          vcpus=2, ram_mb=4096, disk_gb=20),
    VMTemplate(name="fedora-server-main",     description="Fedora Server 42",          vcpus=2, ram_mb=4096, disk_gb=20),
]


async def seed():
    admin_user = os.getenv("DEFAULT_ADMIN_USER", "")
    admin_pass = os.getenv("DEFAULT_ADMIN_PASS", "")
    if not admin_user or not admin_pass:
        raise RuntimeError(
            "DEFAULT_ADMIN_USER y DEFAULT_ADMIN_PASS deben estar configurados "
            "en el archivo .env antes de ejecutar el seed."
        )

    async with async_session() as session:
        # ── Roles ──
        existing_role_names = await session.scalars(
            select(Role.name).where(Role.name.in_([r.name for r in ROLES]))
        )
        existing_roles = set(existing_role_names.all())
        role_map = {}

        for r in ROLES:
            if r.name in existing_roles:
                result = await session.execute(select(Role).where(Role.name == r.name))
                role_map[r.name] = result.scalar_one()
            else:
                session.add(r)
                await session.flush()
                role_map[r.name] = r
                print(f"  Rol creado: {r.name}")

        # ── Admin user ──
        existing = await session.scalar(
            select(User).where(User.username == admin_user)
        )
        if not existing:
            session.add(User(
                username=admin_user,
                password_hash=hash_password(admin_pass),
                full_name="Administrador",
                email=f"{admin_user}@{EMAIL_DOMAIN}",
                role_id=role_map["admin"].id,
            ))
            print(f"  Admin creado: {admin_user}")

        # ── VM Templates ──
        existing_template_names = await session.scalars(
            select(VMTemplate.name).where(VMTemplate.name.in_([t.name for t in TEMPLATES]))
        )
        existing_templates = set(existing_template_names.all())

        for t in TEMPLATES:
            if t.name not in existing_templates:
                session.add(t)
                print(f"  Template creado: {t.name}")

        await session.commit()
        print("Seed completado.")


if __name__ == "__main__":
    asyncio.run(seed())
