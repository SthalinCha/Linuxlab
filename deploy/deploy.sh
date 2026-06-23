#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────
# LinuxLab — One-Command Install
# Usage: sudo ./deploy/deploy.sh
# ─────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# ── Helpers ────────────────────────────────────────

# Poll /health until status=ok or timeout
wait_for_backend() {
    local host="${1:-localhost}"
    local port="${2:-8000}"
    local retries="${3:-30}"
    local interval="${4:-2}"
    log "Waiting for backend at $host:$port (up to $((retries * interval))s)..."
    for i in $(seq 1 "$retries"); do
        if HEALTH=$(curl -sf "http://$host:$port/health" 2>/dev/null); then
            if echo "$HEALTH" | grep -q '"status":"ok"'; then
                ok "Backend ready after ${i}s"
                return 0
            fi
        fi
        sleep "$interval"
    done
    warn "Backend not ready after $((retries * interval))s — continuing anyway"
    return 1
}

# Run a Python script inside the backend container with correct env
exec_backend() {
    docker compose exec backend sh -c "cd /app && PYTHONPATH=/app python \"$1\""
}

log "${GREEN}LinuxLab Installer${NC}"
log "Repository: $REPO_DIR"
echo ""

# ── Prerequisites ──────────────────────────────────
log "[1/8] Checking prerequisites..."

command -v docker &>/dev/null && ok "Docker: $(docker --version)" || fail "Docker not found. Install: https://docs.docker.com/engine/install/"
docker compose version &>/dev/null && ok "Docker Compose: $(docker compose version --short 2>/dev/null || docker compose version)" || fail "Docker Compose not found"

command -v node &>/dev/null && ok "Node.js: $(node --version)" || warn "Node.js not found — will skip frontend build"
command -v nginx &>/dev/null && ok "Nginx: $(nginx -v 2>&1 | awk '{print $NF}')" || warn "Nginx not found — install: sudo apt install nginx"
systemctl is-active --quiet libvirtd && ok "libvirtd: active" || warn "libvirtd not running — VMs won't work"
echo ""

# ── Environment ────────────────────────────────────
log "[2/8] Configuring environment..."

if [ ! -f .env ]; then
    cp .env.example .env
    ok ".env created from .env.example"

    # Generate SECRET_KEY if still placeholder
    if grep -q 'cambiar-por-clave-segura-aqui' .env; then
        NEW_KEY=$(openssl rand -hex 32)
        sed -i "s/SECRET_KEY=cambiar-por-clave-segura-aqui/SECRET_KEY=$NEW_KEY/" .env
        ok "SECRET_KEY generated"
    fi

    # Generate MARIADB passwords if still placeholders
    if grep -q 'MARIADB_ROOT_PASSWORD=cambiar-en-produccion' .env; then
        NEW_MARIA_ROOT=$(openssl rand -base64 12)
        sed -i "s/MARIADB_ROOT_PASSWORD=cambiar-en-produccion/MARIADB_ROOT_PASSWORD=$NEW_MARIA_ROOT/" .env
        ok "MARIADB_ROOT_PASSWORD generated"
    fi
    if grep -q 'MARIADB_PASSWORD=cambiar-en-produccion' .env; then
        NEW_MARIA_USER=$(openssl rand -base64 12)
        sed -i "s/MARIADB_PASSWORD=cambiar-en-produccion/MARIADB_PASSWORD=$NEW_MARIA_USER/" .env
        ok "MARIADB_PASSWORD generated"
    fi

    # Prompt for admin password
    echo ""
    read -rsp "  Set DEFAULT_ADMIN_PASS (leave blank for auto-generate): " ADMIN_PASS
    echo ""
    if [ -z "$ADMIN_PASS" ]; then
        ADMIN_PASS=$(openssl rand -base64 12)
        echo "  Auto-generated admin password: $ADMIN_PASS"
    fi
    sed -i "s/DEFAULT_ADMIN_PASS=cambiar-en-produccion/DEFAULT_ADMIN_PASS=$ADMIN_PASS/" .env
    ok "Admin password configured"
else
    ok ".env already exists — skipping"
fi
echo ""

# ── Frontend build ─────────────────────────────────
log "[3/8] Building frontend..."

if command -v node &>/dev/null; then
    cd frontend
    npm ci --silent 2>/dev/null && ok "npm dependencies installed" || warn "npm ci failed — trying npm install"
    npm install --silent 2>/dev/null || true
    npm run build &>/dev/null && ok "Frontend built (dist/)" || warn "Frontend build failed — check Node.js version"
    cd "$REPO_DIR"
else
    warn "Node.js not available — frontend build skipped. Build manually: cd frontend && npm install && npm run build"
fi
echo ""

# ── Docker services ────────────────────────────────
log "[4/8] Starting Docker services..."

docker compose build backend &>/dev/null && ok "Backend image built" || warn "Backend build had warnings"
docker compose up -d &>/dev/null && ok "Docker services started (backend + db)" || fail "Docker compose failed"
echo ""

# ── Libvirt pool ────────────────────────────────────
log "[4b/8] Configuring libvirt pool..."

if command -v virsh &>/dev/null; then
    if sudo virsh pool-info images &>/dev/null; then
        ok "Pool 'images' already exists"
    else
        sudo virsh pool-define-as images dir --target /var/lib/libvirt/images &>/dev/null && \
        sudo virsh pool-build images &>/dev/null && \
        sudo virsh pool-start images &>/dev/null && \
        sudo virsh pool-autostart images &>/dev/null && \
        ok "Pool 'images' created" || warn "Could not create pool 'images' — run: sudo virsh pool-define-as images dir --target /var/lib/libvirt/images"
    fi
    sudo virsh pool-refresh images &>/dev/null && ok "Pool refreshed" || warn "Pool refresh failed"
else
    warn "virsh not found — install libvirt-client"
fi
echo ""

# ── Wait for backend ──────────────────────────────
wait_for_backend || fail "Backend failed to start — check: docker compose logs backend"

# ── Database schema ────────────────────────────────
log "[5/8] Creating database schema..."

if exec_backend init_db.py; then
    ok "Database schema created"
else
    fail "Schema creation failed — cannot continue without database schema"
fi
echo ""

# ── Database seed ──────────────────────────────────
log "[6/8] Running database seed..."

if exec_backend migrations/seed.py; then
    ok "Database seeded (roles, admin, templates)"
else
    warn "Seed failed — run: docker compose exec backend sh -c \"cd /app && PYTHONPATH=/app python migrations/seed.py\""
fi
echo ""

# ── Nginx configuration ───────────────────────────
log "[7/8] Configuring Nginx..."

NGINX_CONF_SRC="$REPO_DIR/nginx/linuxlab.conf"
NGINX_CONF_DST="/etc/nginx/sites-available/linuxlab"

if [ -f "$NGINX_CONF_SRC" ]; then
    # Update root path in config to match repo location
    sed "s|root /home/ubuntu/linuxlab/frontend/dist|root $REPO_DIR/frontend/dist|" "$NGINX_CONF_SRC" > /tmp/linuxlab-nginx.conf
    cp /tmp/linuxlab-nginx.conf "$NGINX_CONF_DST" 2>/dev/null && ok "Nginx config copied to $NGINX_CONF_DST" || warn "Could not write to $NGINX_CONF_DST (try: sudo cp nginx/linuxlab.conf /etc/nginx/sites-available/)"

    # Enable site
    ln -sf "$NGINX_CONF_DST" /etc/nginx/sites-enabled/ 2>/dev/null || true

    # Test and reload
    nginx -t 2>/dev/null && ok "Nginx config valid" || warn "Nginx config has errors — run: sudo nginx -t"
    systemctl reload nginx 2>/dev/null && ok "Nginx reloaded" || warn "Nginx reload failed — run: sudo systemctl reload nginx"
else
    warn "nginx/linuxlab.conf not found — configure manually"
fi
echo ""

# ── SSL certificate ────────────────────────────────
log "[8/8] SSL certificate..."

if [ -f /etc/nginx/ssl/linuxlab.key ]; then
    # Ensure readable by nginx
    chmod 644 /etc/nginx/ssl/linuxlab.key 2>/dev/null && ok "SSL key permissions: 644" || warn "Could not fix SSL permissions — run: sudo chmod 644 /etc/nginx/ssl/linuxlab.key"
else
    warn "No SSL certificate found. Create one: sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/linuxlab.key -out /etc/nginx/ssl/linuxlab.crt"
fi
echo ""

# ── Summary ────────────────────────────────────────
log "Final check..."

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(ip -4 route get 1 | sed -n 's/.*src \([0-9.]\+\).*/\1/p')
fi

HEALTH=$(curl -s http://localhost:8000/health 2>/dev/null || echo "unreachable")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    ok "Backend API: http://localhost:8000/health → $HEALTH"
else
    warn "Backend API not healthy: $HEALTH"
fi

# Validate libvirt pool has template volumes
TEMPLATES=$(sudo virsh vol-list images 2>/dev/null | grep -c '.qcow2' || echo "0")
if [ "$TEMPLATES" -gt 0 ]; then
    ok "Libvirt pool 'images': $TEMPLATES volúmenes"
else
    warn "Libvirt pool 'images' vacío — sube imágenes .qcow2 a /var/lib/libvirt/images/"
fi

ADMIN_PASS=$(grep DEFAULT_ADMIN_PASS .env | cut -d= -f2)
SSL_OK="no"
[ -f /etc/nginx/ssl/linuxlab.crt ] && SSL_OK="yes"
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         LinuxLab — Installation Complete     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Access:   https://$SERVER_IP"
echo "  Username: $(grep DEFAULT_ADMIN_USER .env | cut -d= -f2)"
echo "  Password: $ADMIN_PASS"
echo "  SSL:      $SSL_OK"
echo ""
echo "  Manage:   docker compose ps"
echo "  Logs:     docker compose logs -f backend"
echo ""
