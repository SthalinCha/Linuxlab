import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import CORS_ORIGINS
from app.database.models import Base
from app.database.session import engine, async_session
from app.api.v1 import auth, dashboard, vms, students, assignments, audit, ws, iptables, host
from app.core.security import hash_password
from app.services.metrics_collector import collector

import json

app = FastAPI(title="LinuxLab API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=json.loads(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["Dashboard"])
app.include_router(vms.router, prefix="/api/v1/vms", tags=["VMs"])
app.include_router(students.router, prefix="/api/v1/students", tags=["Students"])
app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["Assignments"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(ws.router, prefix="/ws", tags=["WebSocket"])
app.include_router(host.router, prefix="/api/v1/host", tags=["Host"])
app.include_router(iptables.router, prefix="/api/v1/host/iptables", tags=["Red"])


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        from app.database.models import Admin, Student
        from sqlalchemy import select

        existing = await session.execute(select(Admin).where(Admin.username == "admin"))
        if not existing.scalar_one_or_none():
            session.add(Admin(username="admin", password_hash=hash_password("linuxlab"), full_name="Administrador"))
            await session.commit()

        existing_students = await session.execute(select(Student).limit(1))
        if not existing_students.scalar_one_or_none():
            names = ["Juan Pérez", "Ana López", "Carlos Ruiz", "María García", "Pedro Martínez"]
            for idx, name in enumerate(names):
                session.add(Student(full_name=name, email=f"estudiante{idx+1}@universidad.edu", student_code=f"2024{idx+1:04d}"))
            await session.commit()

        from app.services.sync_vms import sync_libvirt_domains
        synced, removed = await sync_libvirt_domains(session, setup_iptables=True)
        if synced:
            print(f"Sincronizadas {synced} VMs desde libvirt")

    asyncio.create_task(collector.start_background_collection(interval=300))


@app.get("/health")
async def health():
    return {"status": "ok"}
