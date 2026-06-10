.PHONY: dev build up down logs db shell seed clean deploy

# ── Desarrollo ──────────────────────────────────────────────

dev:
	docker compose up -d db redis
	sleep 3
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	cd frontend && npm run dev

dev-down:
	pkill -f uvicorn 2>/dev/null; exit 0
	docker compose down

# ── Producción ──────────────────────────────────────────────

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

# ── Utilidades ──────────────────────────────────────────────

db:
	docker compose exec db mariadb -u linuxlab -plinuxlab_pass linuxlab

shell:
	docker compose exec backend bash

seed:
	docker compose exec backend python seed.py

deploy: build up
	@echo "LinuxLab desplegado en http://localhost"

# ── Limpieza ────────────────────────────────────────────────

clean:
	docker compose down -v
	rm -rf frontend/node_modules frontend/dist backend/linuxlab.db

# ── Ayuda ───────────────────────────────────────────────────

help:
	@echo "LinuxLab — Makefile"
	@echo "  make dev       Iniciar entorno de desarrollo"
	@echo "  make build     Construir imágenes producción"
	@echo "  make up        Iniciar servicios producción"
	@echo "  make down      Detener servicios"
	@echo "  make logs      Ver logs"
	@echo "  make seed      Ejecutar seed en backend"
	@echo "  make deploy    Build + up"
	@echo "  make clean     Limpiar todo"
