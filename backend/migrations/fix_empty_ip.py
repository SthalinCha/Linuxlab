"""
Migration: corrige ip_address='' → NULL para evitar violación UNIQUE.

Ejecutar en servidores existentes con datos corruptos:
    docker compose exec backend sh -c "PYTHONPATH=/app python migrations/fix_empty_ip.py"
"""

import asyncio
from sqlalchemy import text
from app.database.session import engine


async def fix():
    async with engine.begin() as conn:
        result = await conn.execute(
            text("UPDATE virtual_machines SET ip_address = NULL WHERE ip_address = ''")
        )
        print(f"Filas corregidas: {result.rowcount}")


if __name__ == "__main__":
    asyncio.run(fix())
