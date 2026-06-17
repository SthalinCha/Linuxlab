# LinuxLab

Plataforma de administración de máquinas virtuales para entornos educativos.
Backend en FastAPI + Frontend en React (Vite) + MariaDB.

## Requisitos

- Docker + Docker Compose
- Node.js 18+ y npm
- libvirt + KVM/QEMU en el host
- Python 3.12+ (solo para desarrollo sin Docker)

## Inicio rápido (Docker)

```bash
# 1. Clonar y entrar
git clone <repo-url> && cd linuxlab

# 2. Configurar variables de entorno
cp .env.example .env
# Editar SECRET_KEY con: openssl rand -hex 32

# 3. Iniciar DB, Redis y backend
docker compose up -d db redis backend

# 4. Iniciar frontend (desarrollo)
cd frontend && npm install && npm run dev

# 5. Abrir en el navegador
# http://localhost:5173  |  Usuario: admin / linuxlab
```

## Inicio rápido (desarrollo sin Docker)

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

## Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `SECRET_KEY` | Sí | — | Clave para firmar JWT |
| `MARIADB_ROOT_PASSWORD` | Sí | `linuxlab_root` | Root password de MariaDB |
| `MARIADB_DATABASE` | Sí | `linuxlab` | Nombre de la base de datos |
| `MARIADB_USER` | Sí | `linuxlab` | Usuario de la base de datos |
| `MARIADB_PASSWORD` | Sí | `linuxlab_pass` | Password del usuario |
| `CORS_ORIGINS` | Sí | — | Orígenes permitidos (JSON array) |
| `VITE_API_URL` | No | `/api/v1` | URL del backend para el frontend |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Expiración del token de acceso |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Expiración del refresh token |
| `VM_SUBNET` | No | `192.168.122` | Subred de las VMs |
| `VM_BRIDGE` | No | `virbr0` | Bridge de red |
| `VM_NETWORK` | No | `default` | Red libvirt |
| `STORAGE_PATH` | No | `/var/lib/libvirt/images` | Ruta de almacenamiento de discos |
| `VM_SSH_USER` | No | `estudiante` | Usuario SSH para terminal web |
| `HOST_IP` | No | auto-detectada | IP pública del servidor |

## Estructura del proyecto

```
linuxlab/
├── backend/               # API FastAPI (Python)
│   └── app/
│       ├── api/v1/        # Endpoints REST
│       ├── core/          # Config, seguridad, utilerías
│       ├── database/      # Sesión SQLAlchemy
│       ├── models/        # Modelos ORM
│       ├── schemas/       # Pydantic schemas
│       └── services/      # Lógica de negocio (libvirt, métricas, etc.)
├── frontend/              # SPA React + Vite + TypeScript
│   └── src/
│       ├── components/    # Componentes reutilizables
│       ├── hooks/         # Custom hooks (useVMs, useToast, etc.)
│       ├── pages/         # Páginas/rutas
│       └── services/      # API client
├── docker-compose.yml     # Servicios Docker
├── nginx/                 # Configuración de nginx
└── .env.example           # Plantilla de variables de entorno
```

## Comandos útiles

```bash
make dev        # Iniciar entorno de desarrollo completo
make logs       # Ver logs de Docker
make seed       # Ejecutar seed de datos
make down       # Detener todos los servicios
```

## Puertos

| Servicio | Puerto |
|---|---|
| Frontend (Vite) | `5173` |
| Backend (API) | `8000` |
| MariaDB | `3306` |
| Redis | `6379` |
