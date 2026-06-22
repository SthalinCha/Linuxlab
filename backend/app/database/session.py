import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import DATABASE_URL

_pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
_max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "20"))
_pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_timeout=_pool_timeout,
    pool_pre_ping=False,  # aiomysql no soporta ping() con reconnect arg
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
