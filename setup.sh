#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== LinuxLab Setup ==="

# 1. Backend dependencies
echo "[1/5] Instalando dependencias del backend..."
cd "$DIR/backend"
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -q pip --upgrade
pip install -q -r requirements.txt
# Symlink libvirt-python (no pip-installable)
PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
SITE_PACKAGES="venv/lib/python$PYTHON_VER/site-packages"
[ -f "$SITE_PACKAGES/libvirt.py" ] || ln -sf /usr/lib/python3/dist-packages/libvirt.py "$SITE_PACKAGES/"
[ -f "$SITE_PACKAGES/libvirtmod.cpython-*-x86_64-linux-gnu.so" ] || ln -sf /usr/lib/python3/dist-packages/libvirtmod.*.so "$SITE_PACKAGES/" 2>/dev/null || true
echo "  OK"

# 2. Frontend build
echo "[2/5] Construyendo frontend..."
cd "$DIR/frontend"
npm install --silent 2>/dev/null
npm run build
echo "  OK"

# 3. Nginx config
echo "[3/5] Configurando nginx..."
sudo cp "$DIR/nginx/linuxlab.conf" /etc/nginx/sites-available/linuxlab
sudo ln -sf /etc/nginx/sites-available/linuxlab /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx || sudo systemctl restart nginx
echo "  OK"

# 4. Systemd service
echo "[4/5] Instalando servicio systemd..."
sudo cp "$DIR/linuxlab.service" /etc/systemd/system/
sudo systemctl daemon-reload
echo "  OK"

# 5. Start
echo "[5/5] Iniciando backend..."
sudo systemctl enable linuxlab.service
sudo systemctl restart linuxlab.service
sudo systemctl status linuxlab.service --no-pager | head -10

echo ""
echo "=== Listo ==="
echo "Accede a: https://$(hostname -I | cut -d' ' -f1)"
echo "Usuario: admin / linuxlab"
