#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────
# LinuxLab — One-Command Install (Optional Helper)
# Usage: sudo ./deploy/deploy.sh
#
# This script is OPTIONAL. The recommended install is:
#   cp .env.example .env
#   # edit .env with your settings
#   docker compose up --build -d
# ─────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

log "${GREEN}LinuxLab Installer${NC}"
log "Repository: $REPO_DIR"
echo ""

# ── Prerequisites ──────────────────────────────────
log "[1/5] Checking prerequisites..."

command -v docker &>/dev/null && ok "Docker: $(docker --version)" || fail "Docker not found. Install: https://docs.docker.com/engine/install/"
docker compose version &>/dev/null && ok "Docker Compose: $(docker compose version --short 2>/dev/null || docker compose version)" || fail "Docker Compose not found"
systemctl is-active --quiet libvirtd && ok "libvirtd: active" || warn "libvirtd not running — VMs won't work"
echo ""

# ── Environment ────────────────────────────────────
log "[2/5] Configuring environment..."

if [ ! -f .env ]; then
    cp .env.example .env
    ok ".env created from .env.example"

    # Generate SECRET_KEY if still placeholder
    if grep -q 'cambiar-por-clave-segura-aqui' .env; then
        NEW_KEY=$(openssl rand -hex 32)
        sed -i "s/SECRET_KEY=cambiar-por-clave-segura-aqui/SECRET_KEY=$NEW_KEY/" .env
        ok "SECRET_KEY generated"
    fi

    # Generate passwords if still placeholders
    for VAR in MARIADB_ROOT_PASSWORD MARIADB_PASSWORD DEFAULT_ADMIN_PASS; do
        if grep -q "$VAR=cambiar-en-produccion" .env; then
            NEW_VAL=$(openssl rand -base64 12)
            sed -i "s/$VAR=cambiar-en-produccion/$VAR=$NEW_VAL/" .env
            ok "$VAR generated"
        fi
    done

    # Prompt for HOST_IP if placeholder
    if grep -q 'HOST_IP=192.168.1.100' .env; then
        echo ""
        SERVER_IP=$(ip -4 route get 1 | sed -n 's/.*src \([0-9.]\+\).*/\1/p' 2>/dev/null || echo "")
        read -r -p "  Enter server IP [${SERVER_IP:-$(hostname -I | awk '{print $1}')}]: " INPUT_IP
        IP_TO_SET="${INPUT_IP:-${SERVER_IP:-$(hostname -I | awk '{print $1}')}}"
        sed -i "s/HOST_IP=192.168.1.100/HOST_IP=$IP_TO_SET/" .env
        # Update CORS_ORIGINS with server IP
        sed -i "s/192.168.1.100/$IP_TO_SET/g" .env
        ok "HOST_IP set to $IP_TO_SET"
    fi
else
    ok ".env already exists — skipping"
fi
echo ""

# ── Docker compose ────────────────────────────────
log "[3/5] Building and starting Docker services..."

docker compose build --no-cache 2>&1 | tail -5 && ok "Images built" || fail "Build failed"
docker compose up -d 2>&1 && ok "Services started (backend + frontend + db)" || fail "Docker compose failed"
echo ""

# ── Wait for backend ──────────────────────────────
log "[4/5] Waiting for backend (up to 60s)..."

for i in $(seq 1 30); do
    if HEALTH=$(curl -sf http://localhost:8000/health 2>/dev/null); then
        if echo "$HEALTH" | grep -q '"status":"ok"'; then
            ok "Backend ready after ${i}s"
            break
        fi
    fi
    if [ "$i" -eq 30 ]; then
        warn "Backend not ready after 60s — check: docker compose logs backend"
    fi
    sleep 2
done
echo ""

# ── Libvirt pool ───────────────────────────────────
log "[5/5] Verifying libvirt pool..."

if command -v virsh &>/dev/null; then
    if sudo virsh pool-info images &>/dev/null; then
        ok "Pool 'images' exists"
    else
        warn "Pool 'images' not found — create: sudo virsh pool-define-as images dir --target /var/lib/libvirt/images && sudo virsh pool-build images && sudo virsh pool-start images && sudo virsh pool-autostart images"
    fi
    sudo virsh pool-refresh images &>/dev/null && ok "Pool refreshed" || warn "Pool refresh failed"
    TEMPLATES=$(sudo virsh vol-list images 2>/dev/null | grep -c '.qcow2' || echo "0")
    if [ "$TEMPLATES" -gt 0 ]; then
        ok "Libvirt pool 'images': $TEMPLATES volumes"
    else
        warn "Libvirt pool 'images' empty — upload .qcow2 files to /var/lib/libvirt/images/"
    fi
else
    warn "virsh not found — install libvirt-client"
fi
echo ""

# ── SSL certificate check ─────────────────────────
if [ ! -f /etc/nginx/ssl/linuxlab.crt ] && [ ! -f /etc/nginx/ssl/linuxlab.key ]; then
    warn "No SSL certificate found. For HTTPS access, create one:"
    warn "  sudo mkdir -p /etc/nginx/ssl"
    warn "  sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    warn "    -keyout /etc/nginx/ssl/linuxlab.key \\"
    warn "    -out /etc/nginx/ssl/linuxlab.crt"
    warn "  sudo chmod 644 /etc/nginx/ssl/linuxlab.key"
fi
echo ""

# ── Summary ───────────────────────────────────────
SERVER_IP=$(grep HOST_IP .env | cut -d= -f2)
HEALTH=$(curl -s http://localhost:8000/health 2>/dev/null || echo "unreachable")
DB_OK="no"
echo "$HEALTH" | grep -q '"database":"ok"' && DB_OK="yes"

echo "╔══════════════════════════════════════════════╗"
echo "║         LinuxLab — Installation Complete     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  API:   http://$SERVER_IP:8000/health → $HEALTH"
echo "  DB:    $DB_OK"
echo ""
echo "  Manage: docker compose ps"
echo "  Logs:   docker compose logs -f backend"
echo "  Shell:  docker compose exec backend sh"
echo ""
