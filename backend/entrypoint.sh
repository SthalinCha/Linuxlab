#!/bin/sh
set -e

# ── Fail-fast: validate critical config ──────────────
if [ -z "$SECRET_KEY" ] || [ "$SECRET_KEY" = "cambiar-por-clave-segura-aqui" ]; then
  echo "FATAL: SECRET_KEY no configurada o es un placeholder."
  echo "       Genera una clave: openssl rand -hex 32"
  echo "       Luego agregala a .env: SECRET_KEY=<tu-clave>"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL no configurada."
  echo "       Agregala a .env, ej:"
  echo "       DATABASE_URL=mysql+aiomysql://user:pass@127.0.0.1:3306/linuxlab"
  exit 1
fi

if [ -z "$HOST_IP" ]; then
  echo "FATAL: HOST_IP no configurada."
  echo "       Agregala a .env con la IP real del servidor, ej:"
  echo "       HOST_IP=192.168.1.100"
  exit 1
fi

# ── Wait for database ────────────────────────────────
echo "Esperando a la base de datos..."
for i in $(seq 1 30); do
  if python -c "
import asyncio
from app.database.session import engine
from sqlalchemy import text
async def check():
    async with engine.connect() as conn:
        await conn.execute(text('SELECT 1'))
asyncio.run(check())
" 2>/dev/null; then
    echo "Base de datos lista después de ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "FATAL: Base de datos no disponible después de 30 intentos"
    exit 1
  fi
  sleep 1
done

# ── Bootstrap: schema + seed (idempotent) ────────────
echo "Ejecutando init_db.py..."
PYTHONPATH=/app python /app/init_db.py

echo "Ejecutando seed.py..."
PYTHONPATH=/app python /app/migrations/seed.py

# ── Start uvicorn ────────────────────────────────────
echo "Iniciando uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
