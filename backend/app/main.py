import asyncio
import json
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import HTTPException
from sqlalchemy import text
from app.core.config import CORS_ORIGINS
from app.database.session import engine
from app.api.v1 import auth, dashboard, vms, students, assignments, periods, audit, ws, iptables, host, users, courses
from app.services.metrics_collector import collector
from app.services.config_service import get_cached_int
from app.core.libvirt.connection import HAVE_LIBVIRT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="LinuxLab API", version="1.0.0")

app.add_middleware(GZipMiddleware, minimum_size=1000)
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
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(courses.router, prefix="/api/v1/courses", tags=["Courses"])


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
    from app.services.config_service import load_config, start_config_refresh
    await load_config()
    await start_config_refresh()

    global _background_task
    metrics_interval = get_cached_int("metrics_interval", 300)
    _background_task = asyncio.create_task(collector.start_background_collection(interval=metrics_interval))

    from app.services.sync_task import start_background_sync
    await start_background_sync()

    logger.info("Inicio completado")


@app.on_event("shutdown")
async def shutdown():
    global _background_task
    if _background_task:
        _background_task.cancel()
        logger.info("Tarea de métricas cancelada")

    from app.services.sync_task import _sync_task
    if _sync_task:
        _sync_task.cancel()
        logger.info("Tarea de sync cancelada")

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
