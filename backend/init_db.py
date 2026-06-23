"""
Init DB: crea el esquema de base de datos.

Ejecutar antes del seed en un deploy nuevo:
    docker compose exec backend sh -c "cd /app && PYTHONPATH=/app python init_db.py"

Idempotent: CREATE TABLE IF NOT EXISTS.
"""

import asyncio
from app.database.session import engine
from app.models import Base


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Esquema de base de datos creado.")


if __name__ == "__main__":
    asyncio.run(init_db())
