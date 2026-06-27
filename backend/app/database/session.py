import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine_kwargs = {"echo": False}
if _is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
    _max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    _pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    engine_kwargs.update(
        pool_size=_pool_size,
        max_overflow=_max_overflow,
        pool_timeout=_pool_timeout,
        # pool_pre_ping omitted — aiomysql's ping() lacks 'reconnect' argument
        pool_recycle=300,
    )

engine = create_async_engine(DATABASE_URL, **engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
