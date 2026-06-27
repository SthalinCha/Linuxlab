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
echo "Esperando a la base de datos... (${DATABASE_URL%%\?*})"
case "$DATABASE_URL" in
  sqlite*)
    DB_PATH="${DATABASE_URL#sqlite+aiosqlite:///}"
    DB_PATH="${DB_PATH%%\?*}"
    for i in $(seq 1 30); do
      [ -f "$DB_PATH" ] && { echo "Base de datos lista después de ${i}s"; break; }
      [ "$i" -eq 30 ] && { echo "FATAL: Base de datos no disponible después de 30 intentos"; exit 1; }
      sleep 1
    done
    ;;
  mysql*|mariadb*)
    DB_HOST="${DATABASE_URL#*@}"
    DB_HOST="${DB_HOST%%/*}"
    DB_PORT="${DB_HOST##*:}"
    case "$DB_PORT" in
      *.*|*[!0-9]*) DB_PORT=3306 ;;
    esac
    DB_HOST="${DB_HOST%:*}"
    for i in $(seq 1 30); do
      python3 -c "
import socket as _s
_s.create_connection(('$DB_HOST', $DB_PORT), timeout=2).close()
" 2>/dev/null && { echo "Base de datos lista después de ${i}s"; break; }
      [ "$i" -eq 30 ] && { echo "FATAL: Base de datos no disponible después de 30 intentos"; exit 1; }
      sleep 1
    done
    ;;
esac

# ── Bootstrap: schema + seed (idempotent) ────────────
echo "Ejecutando init_db.py..."
PYTHONPATH=/app python /app/init_db.py

echo "Ejecutando seed.py..."
PYTHONPATH=/app python /app/migrations/seed.py

# ── Start uvicorn ────────────────────────────────────
echo "Iniciando uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
