import asyncio
import json
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import HTTPException
from sqlalchemy import text, select
from app.core.config import CORS_ORIGINS, SECRET_KEY
from app.models import Base
from app.database.session import engine, async_session
from app.api.v1 import auth, dashboard, vms, students, assignments, periods, audit, ws, iptables, host
from app.core.security import hash_password
from app.services.metrics_collector import collector
from app.core.libvirt.connection import HAVE_LIBVIRT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="LinuxLab API", version="1.0.0")

if not SECRET_KEY or SECRET_KEY == "cambiar-en-produccion":
    logger.warning(
        "SECRET_KEY no configurada — usando valor inseguro por defecto. "
        "Configure la variable de entorno SECRET_KEY para producción."
    )

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
app.include_router(periods.router, prefix="/api/v1/periods", tags=["Periods"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(ws.router, prefix="/ws", tags=["WebSocket"])
app.include_router(host.router, prefix="/api/v1/host", tags=["Host"])
app.include_router(iptables.router, prefix="/api/v1/host/iptables", tags=["Red"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    logger.exception("Error no manejado en %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
    )


_background_task: asyncio.Task | None = None


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        from app.models import User, Role, Student, VMTemplate

        admin_role = await session.execute(select(Role).where(Role.name == "admin"))
        admin_role = admin_role.scalar_one_or_none()
        if not admin_role:
            admin_role = Role(name="admin", description="Administrador del sistema")
            session.add(admin_role)

        profesor_role = await session.execute(select(Role).where(Role.name == "profesor"))
        profesor_role = profesor_role.scalar_one_or_none()
        if not profesor_role:
            profesor_role = Role(name="profesor", description="Profesor")
            session.add(profesor_role)

        await session.flush()

        existing = await session.execute(select(User).where(User.username == "admin"))
        if not existing.scalar_one_or_none():
            session.add(User(
                username="admin",
                password_hash=hash_password("linuxlab"),
                full_name="Administrador",
                email="admin@linuxlab.local",
                role_id=admin_role.id,
            ))
            await session.commit()

        default_template = await session.execute(
            select(VMTemplate).where(VMTemplate.name == "ubuntu-server-main")
        )
        if not default_template.scalar_one_or_none():
            session.add(VMTemplate(
                name="ubuntu-server-main",
                description="Plantilla principal de Ubuntu Server",
                vcpus=1,
                ram_mb=2048,
                disk_gb=10,
            ))
            await session.commit()

        existing_students = await session.execute(select(Student).limit(1))
        if not existing_students.scalar_one_or_none():
            names = ["Juan Pérez", "Ana López", "Carlos Ruiz", "María García", "Pedro Martínez"]
            for idx, name in enumerate(names):
                session.add(Student(
                    full_name=name,
                    email=f"estudiante{idx+1}@universidad.edu",
                    student_code=f"estudiante{idx+1}",
                ))
            await session.commit()

        from app.services.sync_vms import sync_libvirt_domains
        synced, removed = await sync_libvirt_domains(session, setup_iptables=True)
        if synced:
            logger.info("Sincronizadas %s VMs desde libvirt", synced)

    global _background_task
    _background_task = asyncio.create_task(collector.start_background_collection(interval=300))
    logger.info("Inicio completado")


@app.on_event("shutdown")
async def shutdown():
    global _background_task
    if _background_task:
        _background_task.cancel()
        logger.info("Tarea de métricas cancelada")
    from app.core.libvirt.connection import close_connection
    close_connection()
    await engine.dispose()
    logger.info("Apagado completado")


@app.get("/health")
async def health():
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        logger.warning("Healthcheck — DB error: %s", e)
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "error",
        "libvirt": "ok" if HAVE_LIBVIRT else "unavailable",
    }
