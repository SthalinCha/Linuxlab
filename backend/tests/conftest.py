import os
import pytest
import pytest_asyncio
from unittest.mock import patch
from typing import AsyncGenerator

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-jwt")

# Force HAVE_LIBVIRT = False before any dependent imports
import app.core.libvirt.connection as _libvirt_conn
_libvirt_conn.HAVE_LIBVIRT = False

# Import models first to register all tables in Base.metadata
from app.models.base import Base as _Base
from app.models import User, Role, VMTemplate, Student, Period, VirtualMachine, VMAssignment, AuditLog, VMStateHistory

# SQLite doesn't support MySQL's ON UPDATE CURRENT_TIMESTAMP syntax
from sqlalchemy import text
from sqlalchemy.sql.schema import DefaultClause
for _tbl in _Base.metadata.tables.values():
    for _col in _tbl.columns:
        sd = _col.server_default
        if isinstance(sd, DefaultClause) and hasattr(sd.arg, "text"):
            if "ON UPDATE" in str(sd.arg.text).upper():
                _col.__dict__["server_default"] = DefaultClause(text("CURRENT_TIMESTAMP"))

# Now import the rest of the app
from app.main import app
from app.database.session import engine, async_session, get_session
from app.core.security import hash_password, create_access_token


@pytest_asyncio.fixture(scope="session")
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(_Base.metadata.create_all)
    async with async_session() as session:
        admin_role = Role(name="admin", description="Administrador del sistema")
        profesor_role = Role(name="profesor", description="Profesor")
        session.add_all([admin_role, profesor_role])
        await session.flush()

        admin = User(
            username="admin",
            password_hash=hash_password("linuxlab"),
            full_name="Administrador",
            email="admin@linuxlab.local",
            role_id=admin_role.id,
        )
        session.add(admin)
        await session.commit()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(_Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session(setup_db):
    from sqlalchemy.ext.asyncio import AsyncSession

    connection = await engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override

    yield session

    await transaction.rollback()
    await connection.close()
    app.dependency_overrides.pop(get_session, None)


@pytest_asyncio.fixture
async def db_session_no_override(setup_db):
    from sqlalchemy.ext.asyncio import AsyncSession

    connection = await engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)

    yield session

    await transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def client(setup_db, mock_iptables):
    import httpx

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_client(client, db_session):
    token = create_access_token({"sub": "admin"})
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture
def mock_iptables():
    with patch("app.services.iptables_service.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = ""
        yield mock_run
