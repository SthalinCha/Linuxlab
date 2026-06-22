# LinuxLab — Virtualization Learning Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12+-3776AB)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)

LinuxLab is a self-hosted virtualization management platform designed for educational environments. It provides instructors with a web dashboard to create, manage, and assign virtual machines to students — all powered by KVM/libvirt on the host.

> **Production-ready for labs.** Not intended for public cloud or untrusted multi-tenant use.

---

## Features

| Capability | Description |
|---|---|
| **VM Lifecycle** | Create, clone, start, shutdown, reboot, recreate, delete |
| **Bulk Operations** | Create labs (N VMs at once), bulk start/stop/delete |
| **Student Management** | Import via CSV, assign VMs, track history |
| **Periods** | Academic terms with assignment cycles and auto-release |
| **RBAC** | Admin and Profesor roles with full ownership isolation |
| **Dashboard** | Real-time host metrics (RAM, CPU, disk, health score) |
| **Web Terminal** | Cockpit-based in-browser VM access via vhost proxy |
| **Audit Logging** | Full event trail for security and compliance |
| **Courses** | Multi-course organization for periods and students |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Host (Ubuntu 22.04+)              │
│                                                       │
│  ┌────────────┐    ┌──────────────┐                   │
│  │  Nginx      │◄───│  Browser     │                   │
│  │  (host)     │    │  HTTPS :443  │                   │
│  │  frontend/  │    └──────────────┘                   │
│  │  dist/      │                                       │
│  └─────┬───────┘                                       │
│        │                                                │
│        ├── /api/* ───────────────────┐                  │
│        │                             │                  │
│  ┌─────▼─────────────────────────┐   │                  │
│  │  Docker: backend (FastAPI)    │   │                  │
│  │  network_mode: host           │   │                  │
│  │  :8000                        │   │                  │
│  └─────┬─────────────────────────┘   │                  │
│        │                             │                  │
│  ┌─────▼──────────┐    ┌─────────────▼──────┐          │
│  │  Docker:        │    │  libvirt/KVM        │          │
│  │  MariaDB :3306  │    │  qemu:///system     │          │
│  │  (separate)     │    │  VMs, pools, nets   │          │
│  └────────────────┘    └────────────────────┘          │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12+ · FastAPI · SQLAlchemy 2.0 (async) · aiomysql |
| **Frontend** | React 19 · TypeScript · Vite · React Router · Tailwind CSS |
| **Database** | MariaDB 11 |
| **Virtualization** | KVM/QEMU · libvirt Python API |
| **Web Server** | Nginx (host) — serves static SPA + reverse proxy to API |
| **Containerization** | Docker Compose (backend + db only) |
| **Auth** | JWT (access + refresh tokens) · bcrypt password hashing |

---

## Requirements

- **OS:** Ubuntu 22.04+ (or any Linux with KVM support)
- **KVM:** Hardware virtualization enabled (`kvm-ok`), `libvirtd` running
- **Docker:** Docker Engine 24+ and Docker Compose v2
- **Node.js:** 18+ (only for frontend builds)
- **Python:** 3.12+ (only for development without Docker)

---

## One-Command Install

```bash
git clone https://github.com/yourorg/linuxlab.git
cd linuxlab
chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

The script will:

1. Check prerequisites (Docker, Node.js, libvirt)
2. Create `.env` from template (prompts for `SECRET_KEY`)
3. Build the frontend SPA (`npm ci && npm run build`)
4. Start backend + database via Docker Compose
5. Copy and enable the Nginx site configuration
6. Test and reload Nginx
7. Print access URL and credentials

---

## Manual Setup

### 1. Environment variables

```bash
cp .env.example .env
# Edit SECRET_KEY — generate with: openssl rand -hex 32
nano .env
```

### 2. Build frontend

```bash
cd frontend
npm ci
npm run build
cd ..
```

### 3. Start services

```bash
docker compose up -d
```

### 4. Configure Nginx (host)

```bash
sudo cp nginx/linuxlab.conf /etc/nginx/sites-available/linuxlab
sudo ln -sf /etc/nginx/sites-available/linuxlab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Access

```
https://<server-ip>
User: admin
Pass: (defined in .env → DEFAULT_ADMIN_PASS)
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| **SECRET_KEY** | Yes | — | JWT signing key. Generate: `openssl rand -hex 32` |
| **DEFAULT_ADMIN_USER** | No | `admin` | Default admin username (created on first start) |
| **DEFAULT_ADMIN_PASS** | No | — | Default admin password |
| **MARIADB_ROOT_PASSWORD** | Yes | `linuxlab_root` | MariaDB root password |
| **MARIADB_DATABASE** | Yes | `linuxlab` | Database name |
| **MARIADB_USER** | Yes | `linuxlab` | Database user |
| **MARIADB_PASSWORD** | Yes | `linuxlab_pass` | Database user password |
| **CORS_ORIGINS** | Yes | — | JSON array of allowed origins |
| **EMAIL_DOMAIN** | No | `linuxlab.local` | Domain for auto-generated user emails |
| **ACCESS_TOKEN_EXPIRE_MINUTES** | No | `30` | JWT access token lifetime |
| **REFRESH_TOKEN_EXPIRE_DAYS** | No | `7` | JWT refresh token lifetime |
| **LIBVIRT_URI** | No | `qemu:///system` | libvirt connection URI |
| **VM_SUBNET** | No | `192.168.122` | VM subnet |
| **STORAGE_PATH** | No | `/var/lib/libvirt/images` | VM disk storage path |
| **VM_SSH_USER** | No | `estudiante` | SSH user for web terminal |
| **DB_POOL_SIZE** | No | `10` | SQLAlchemy connection pool size |
| **CONFIG_CACHE_TTL** | No | `60` | System parameters cache TTL (seconds) |

---

## Usage

### First login

1. Open `https://<server-ip>` in your browser
2. Accept the self-signed SSL certificate warning
3. Log in with the credentials from `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASS`

### Creating VMs

1. Go to **VMs → Create Lab**
2. Set the VM count, starting number, and prefix
3. Click **Create** — VMs are cloned from the template and registered in libvirt

### Managing students

1. Go to **Students → Import CSV**
2. Upload a CSV with `full_name` and `email` columns
3. Students are created and can be assigned to VMs

### Assigning VMs

1. Go to **Assignments → New Assignment**
2. Select a period, student, and VM
3. The assignment is recorded and the VM is tied to the student

---

## Project Structure

```
linuxlab/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # REST endpoints
│   │   ├── core/            # Config, security, utilities
│   │   ├── database/        # SQLAlchemy session + migrations
│   │   ├── models/          # ORM models
│   │   ├── schemas/         # Pydantic schemas
│   │   └── services/        # Business logic (libvirt, metrics, etc.)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── seed.py
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Route pages
│   │   └── services/        # API client
│   ├── Dockerfile           # (unused — frontend served by host Nginx)
│   └── entrypoint.sh
├── deploy/
│   ├── deploy.sh            # One-command install script
│   └── linuxlab-backend.service  # systemd unit for production
├── nginx/
│   ├── linuxlab.conf        # Host Nginx configuration (production)
│   └── linuxlab-docker.conf # Docker Nginx config (legacy)
├── docker-compose.yml       # Backend + MariaDB services
├── .env.example             # Environment template
├── .gitignore
├── CHANGELOG.md
└── README.md
```

---

## Security

| Measure | Status |
|---|---|
| **SECRET_KEY** | Rotated, not in git history |
| **.env gitignored** | Enforced via `.gitignore` |
| **CORS** | Restricted to configured origins |
| **SSL** | Self-signed cert included, Let's Encrypt recommended |
| **JWT** | Short-lived access tokens + refresh rotation |
| **RBAC** | Admin/profesor role separation with ownership checks |
| **Audit trail** | All auth events logged |

### Production hardening recommendations

1. **Replace SSL certificate** with Let's Encrypt:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

2. **Disable OpenAPI docs** in production (`backend/app/main.py`):
   ```python
   app = FastAPI(docs_url=None, redoc_url=None)
   ```

3. **Add Nginx rate limiting**:
   ```nginx
   limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
   ```

4. **Automate database backups**:
   ```bash
   0 3 * * * docker compose exec db mariadb-dump -u root -p"$PASS" linuxlab > /backups/linuxlab-$(date +\%F).sql
   ```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **502 Bad Gateway** | Ensure backend is running: `docker compose ps` |
| **CORS error in browser** | Verify `CORS_ORIGINS` includes the frontend URL |
| **libvirt connection failed** | Check `libvirtd` status: `systemctl status libvirtd` |
| **VM clone fails** | Ensure template volume exists in storage pool |
| **Port conflict** | Only `:8000` and `:3306` are used by Docker; `:80/:443` by Nginx |
| **Frontend shows blank page** | Rebuild: `cd frontend && npm ci && npm run build` |

---

## Development

```bash
# Backend (without Docker)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (Vite HMR)
cd frontend
npm install
npm run dev  # → http://localhost:5173
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request
