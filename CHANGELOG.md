# Changelog

## v1.0.0 (2026-06-22)

### Initial Release — LinuxLab Virtualization Platform

#### Features

- **VM Lifecycle Management** — Create, clone, start, shutdown, reboot, destroy, recreate, and delete virtual machines via web UI or API
- **Bulk Operations** — Create labs (N VMs from template), bulk start/shutdown/delete, recreate ranges
- **Student Management** — Import students via CSV, track assignment history, undo imports
- **Assignment System** — Assign VMs to students per academic period, bulk assign, bulk release
- **Periods** — Academic term management with auto-release on close
- **RBAC** — Admin and Profesor roles with full ownership isolation (students, VMs, courses, assignments)
- **Courses** — Multi-course organization with per-professor scoping
- **Dashboard** — Real-time host metrics: RAM, CPU, disk usage, health score, alerts, top consumers
- **Web Terminal** — In-browser VM access via Cockpit reverse proxy
- **Audit Logging** — Full event trail for login, VM operations, and admin actions
- **HTTPS** — Self-signed SSL with Nginx reverse proxy and SPA fallback routing
- **CORS** — Configurable cross-origin support for multi-network deployments
- **Dynamic Configuration** — 24 system parameters stored in DB with TTL cache

#### Architecture

- `backend/` — FastAPI application with async SQLAlchemy, libvirt integration, JWT auth
- `frontend/` — React 19 SPA with TypeScript, Vite, React Router, Tailwind CSS
- `deploy/` — One-command deploy script + systemd unit for production
- `docker-compose.yml` — Backend (host networking) + MariaDB containers
- Host Nginx serves built SPA and reverse-proxies API calls

#### Infrastructure

- Docker Compose for backend and database isolation
- Nginx on host as single web server (no Docker frontend)
- SSL certificate with automatic HTTP→HTTPS redirect
- Connection pooling (SQLAlchemy + MariaDB)
- Rate limiting on login endpoint
- Environment-based configuration via `.env`

#### Security

- JWT access/refresh token authentication
- bcrypt password hashing
- RBAC with explicit ownership validation on every CRUD operation
- CORS restricted to configured origins
- `.env` gitignored, SECRET_KEY rotated
- Admin seed via environment variables (no hardcoded credentials)
