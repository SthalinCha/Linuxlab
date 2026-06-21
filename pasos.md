# LinuxLab — Guía de instalación paso a paso

## Requisitos

| Requisito | Versión mínima | Notas |
|---|---|---|
| Ubuntu Server | 22.04 / 24.04 LTS | x86_64 |
| Docker | 24+ | `apt install docker.io docker-compose-v2` |
| libvirt + KVM | qemu-kvm | Necesario para VMs |
| RAM | 8 GB+ | 4 GB para el host + VMs |
| Disco | 50 GB+ | Para VMs e imágenes |

---

## 1. Preparar el sistema base

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Instalar Docker
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# CERRAR SESIÓN y volver a entrar (o ejecutar: newgrp docker)

# Instalar libvirt + KVM
sudo apt install -y qemu-kvm libvirt-daemon-system libvirt-clients virtinst
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt $USER
# CERRAR SESIÓN y volver a entrar

# Verificar
virsh list --all
```

> Si el usuario no está en `libvirt` group, el backend no podrá gestionar VMs.
> El `group_add: ["982"]` en docker-compose debe coincidir con el GID del grupo `libvirt` en el host.

---

## 2. Clonar el repositorio

```bash
git clone <URL_DEL_REPO> linuxlab
cd linuxlab
```

---

## 3. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

**Campos obligatorios:**

| Variable | Valor recomendado |
|---|---|
| `SECRET_KEY` | `openssl rand -hex 32` |
| `MARIADB_ROOT_PASSWORD` | Cambiar |
| `MARIADB_PASSWORD` | Cambiar |
| `CORS_ORIGINS` | `["http://tu-dominio-o-ip"]` |

**Campos para libvirt (normalmente no requieren cambio):**

```ini
VM_SUBNET=192.168.122
VM_BRIDGE=virbr0
VM_NETWORK=default
STORAGE_PATH=/var/lib/libvirt/images
VM_SSH_USER=estudiante
```

> `HOST_IP` se auto-detecta, pero si el servidor tiene múltiples IPs, defínela manualmente.

---

## 4. Verificar GID de libvirt

El backend corre en `network_mode: host` y necesita acceso al socket de libvirt.
Asegúrate de que el GID `982` en `docker-compose.yml` coincida con el del host:

```bash
getent group libvirt
# libvirt:x:982:tu_usuario    ← el GID (982) debe coincidir con group_add en docker-compose.yml
```

Si el GID es distinto (ej. `108`), edita `docker-compose.yml`:

```yaml
    group_add:
      - "108"   # ← GID real del grupo libvirt en el host
```

---

## 5. Crear plantilla de VM (obligatorio)

El backend clona VMs a partir de un volumen plantilla. Debe existir antes del primer inicio:

```bash
# Ruta de ejemplo: /var/lib/libvirt/images/ubuntu-server-main.qcow2
# Debe ser una imagen qcow2 con Ubuntu Server instalado
sudo cp /ruta/a/tu/ubuntu-server.qcow2 /var/lib/libvirt/images/ubuntu-server-main.qcow2
sudo chown libvirt-qemu:kvm /var/lib/libvirt/images/ubuntu-server-main.qcow2
```

> Sin este volumen, las operaciones de clonación, creación y recreación darán error 500.
> El nombre debe coincidir con `default_template` en la tabla `system_parameters` (por defecto `ubuntu-server-main`).

---

## 6. Construir e iniciar servicios

```bash
# Primera vez (construye todo)
docker compose build
docker compose up -d

# Verificar que todos los servicios están saludables
docker compose ps

# Ver logs del backend
docker compose logs -f backend
```

Espera a que aparezca:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## 7. Seed inicial

Al iniciar por primera vez, el backend automáticamente (vía `main.py` startup):

| Recurso | Detalle |
|---|---|
| Roles | `admin` y `profesor` |
| Usuario admin | `admin` / `linuxlab` |
| Plantilla VM | `ubuntu-server-main` (solo metadatos) |
| `system_parameters` | 23 parámetros con valores por defecto |
| Sincronización libvirt | VMs existentes se registran en DB |

**Para crear un usuario profesor de prueba:**

```bash
docker compose exec backend python3 -c "
import asyncio
from app.database.session import async_session
from app.models import User, Role
from app.core.security import hash_password
from sqlalchemy import select

async def crear_prof1():
    async with async_session() as s:
        role = (await s.execute(select(Role).where(Role.name == 'profesor'))).scalar_one()
        s.add(User(username='prof1', password_hash=hash_password('password123'),
                   full_name='Profesor 1', email='prof1@linuxlab.local', role_id=role.id))
        await s.commit()
        print('prof1 / password123 creado')
asyncio.run(crear_prof1())
"
```

---

## 8. Acceder a la aplicación

| Interfaz | URL |
|---|---|
| Frontend (web) | `http://<IP-DEL-SERVIDOR>` |
| Backend API | `http://<IP-DEL-SERVIDOR>/api/v1/docs` (Swagger) |
| Admin login | `admin` / `linuxlab` |

---

## 9. Operaciones comunes

```bash
# Reconstruir solo el backend tras cambios de código
docker compose build backend && docker compose up -d backend

# Reconstruir frontend
docker compose build frontend && docker compose up -d frontend

# Ver logs en vivo
docker compose logs -f backend

# Ejecutar seed manual
docker compose exec backend python seed.py

# Consola MariaDB
docker compose exec db mariadb -u linuxlab -p linuxlab

# Detener servicios
docker compose down

# Detener y borrar datos (¡cuidado! borra la BD)
docker compose down -v
```

---

## 10. Desarrollo (hot reload)

Para desarrollo con recarga automática:

```bash
# Terminal 1: Backend (SQLite, sin Docker)
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend (HMR en :5173)
cd frontend
npm install
npm run dev

# Opcional: MariaDB + Redis en Docker para desarrollo
docker compose up -d db redis
```

---

## 11. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Error interno del servidor` en dashboard | `health_factors` mezcla `Decimal` y `float` | Verificar `float()` en `dashboard.py` |
| `500` en clone/recreate | Volumen plantilla no existe | Verificar `/var/lib/libvirt/images/ubuntu-server-main.qcow2` |
| `Permission denied` libvirt socket | Usuario/group GID incorrecto | Verificar `group_add` en `docker-compose.yml` |
| Frontend muestra pantalla en blanco | Error de compilación o proxy | Revisar `docker compose logs frontend` |
| `429 Too Many Requests` | Rate limiter bloqueó IP | Esperar 60s; los valores se leen de `system_parameters` |
| Backend no inicia | Error de sintaxis en Python | Verificar con `docker compose logs backend` |

---

## 12. Arquitectura general

```
                    ┌─────────────┐     ┌──────────┐
                    │   MariaDB   │◄────│ Backend  │
                    │   :3306     │     │ :8000    │
                    └─────────────┘     │host net  │
                                        │          │
                    ┌─────────────┐     │          │
                    │   Redis     │◄────│          │
                    │   :6379     │     └────┬─────┘
                    └─────────────┘          │
                                             │ proxy via nginx
                                        ┌────▼─────┐
                                        │ Frontend │
                                        │ :80      │
                                        │ (nginx)  │
                                        └──────────┘
```

- **Backend** usa `network_mode: host` (necesita libvirt + iptables)
- **Frontend** sirve SPA React via nginx, proxy `/api` → backend
- **MariaDB** y **Redis** solo accesibles desde localhost
- **`system_parameters`** es la fuente de verdad para configuración runtime
- **RBAC**: dos roles (`admin`, `profesor`) con ownership scoping en VMs, estudiantes, cursos y asignaciones
