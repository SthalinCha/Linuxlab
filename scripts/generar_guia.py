from fpdf import FPDF
import os

class PDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, "LinuxLab - Guia de Despliegue", align="L")
            self.cell(0, 8, f"Pagina {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
            self.line(10, 14, 200, 14)
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Generado el {os.popen('date +%d/%m/%Y').read().strip()}", align="C")

    def chapter_title(self, title, level=1):
        if level == 1:
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(30, 64, 120)
            self.ln(4)
            self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(30, 64, 120)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(6)
        elif level == 2:
            self.set_font("Helvetica", "B", 13)
            self.set_text_color(50, 90, 160)
            self.ln(3)
            self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
            self.ln(3)
        elif level == 3:
            self.set_font("Helvetica", "B", 11)
            self.set_text_color(70, 70, 70)
            self.ln(2)
            self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
            self.ln(2)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def code_block(self, text):
        self.set_fill_color(240, 240, 245)
        self.set_text_color(30, 30, 30)
        self.set_font("Courier", "", 8.5)
        self.set_x(15)
        self.multi_cell(180, 4.5, text, fill=True)
        self.ln(3)

    def bullet(self, text, indent=15):
        self.set_x(indent)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        x = self.get_x()
        self.cell(5, 5.5, "-")
        self.set_x(x + 5)
        self.multi_cell(170 - (indent - 15), 5.5, text)

    def bold_bullet(self, bold_part, rest, indent=15):
        self.set_x(indent)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(40, 40, 40)
        x = self.get_x()
        self.cell(5, 5.5, "-")
        self.set_x(x + 5)
        self.cell(self.get_string_width(bold_part) + 1, 5.5, bold_part)
        self.set_font("Helvetica", "", 10)
        self.multi_cell(170 - (indent - 15) - self.get_string_width(bold_part), 5.5, rest)

    def table_row(self, cells, bold=False, fill=False, widths=None):
        if widths is None:
            widths = [50, 130]
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 9)
        if fill:
            self.set_fill_color(230, 235, 245)
        for i, cell in enumerate(cells):
            align = "L"
            self.cell(widths[i], 6, cell, border=1, align=align, fill=fill)
        self.ln()


pdf = PDF()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# --- Portada ---
pdf.ln(30)
pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(30, 64, 120)
pdf.cell(0, 15, "LinuxLab", align="C", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", "", 18)
pdf.set_text_color(80, 80, 80)
pdf.cell(0, 10, "Guia de Despliegue", align="C", new_x="LMARGIN", new_y="NEXT")
pdf.ln(8)
pdf.set_draw_color(30, 64, 120)
pdf.line(60, pdf.get_y(), 150, pdf.get_y())
pdf.ln(15)
pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(60, 60, 60)
pdf.cell(0, 7, "Plataforma de gestion de maquinas virtuales con libvirt", align="C", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 7, "Backend: FastAPI + MariaDB + Redis | Frontend: React + TypeScript + Tailwind", align="C", new_x="LMARGIN", new_y="NEXT")
pdf.ln(20)
distro = os.popen("lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'").read().strip()
kernel = os.popen("uname -r").read().strip()
pdf.set_font("Helvetica", "", 9)
pdf.set_text_color(120, 120, 120)
pdf.cell(0, 5, f"Sistema: {distro} | Kernel: {kernel}", align="C", new_x="LMARGIN", new_y="NEXT")

# --- 1. Requisitos del Sistema ---
pdf.add_page()
pdf.chapter_title("1. Requisitos del Sistema")

pdf.chapter_title("Hardware Minimo", level=2)
pdf.bold_bullet("CPU: ", "2 nucleos fisicos (x86_64 con virtualizacion VT-x/AMD-V)")
pdf.bold_bullet("RAM: ", "4 GB minimo (8 GB recomendado para multiples VMs)")
pdf.bold_bullet("Disco: ", "20 GB disponibles (depende de las imagenes de VMs)")
pdf.bold_bullet("Red: ", "Interface de red con IP fija")

pdf.chapter_title("Sistema Operativo", level=2)
pdf.body_text("Probado en Ubuntu 24.04 LTS / 26.04 LTS. Compatible con Debian 12+ y derivados.")

# --- 2. Paquetes del Sistema ---
pdf.add_page()
pdf.chapter_title("2. Paquetes del Sistema")

pdf.chapter_title("Repositorios y actualizaciones", level=2)
pdf.code_block("sudo apt update && sudo apt upgrade -y")

pdf.chapter_title("Paquetes esenciales", level=2)
pdf.code_block(
    "sudo apt install -y \\\n"
    "  curl wget git build-essential \\\n"
    "  python3 python3-pip python3-venv \\\n"
    "  nginx \\\n"
    "  mariadb-server mariadb-client \\\n"
    "  redis-server \\\n"
    "  libvirt-daemon libvirt-clients libvirt-dev \\\n"
    "  qemu-kvm qemu-utils \\\n"
    "  dnsmasq bridge-utils \\\n"
    "  iptables iproute2 \\\n"
    "  nodejs npm"
)

pdf.body_text("Explicacion de cada grupo:")
pdf.bold_bullet("python3 / python3-venv: ", "Entorno de ejecucion del backend")
pdf.bold_bullet("nginx: ", "Servidor web para el frontend (produccion)")
pdf.bold_bullet("mariadb-*: ", "Base de datos principal")
pdf.bold_bullet("redis-server: ", "Cache y sesiones")
pdf.bold_bullet("libvirt-* / qemu-kvm: ", "Virtualizacion (KVM/QEMU)")
pdf.bold_bullet("nodejs / npm: ", "Construccion del frontend")

pdf.chapter_title("Instalar libvirt-python en el sistema", level=2)
pdf.code_block(
    "# Opcion A: usando pip (requiere libvirt-dev)\n"
    "pip install libvirt-python\n\n"
    "# Opcion B: paquete sistema (recomendado)\n"
    "sudo apt install python3-libvirt"
)

# --- 3. Configurar Servicios Base ---
pdf.add_page()
pdf.chapter_title("3. Configurar Servicios Base")

pdf.chapter_title("3.1 MariaDB", level=2)
pdf.code_block(
    "sudo systemctl enable --now mariadb\n"
    "sudo mysql_secure_installation"
)
pdf.body_text("Crear base de datos y usuario:")
pdf.code_block(
    "sudo mysql -u root -p <<EOF\n"
    "CREATE DATABASE linuxlab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
    "CREATE USER 'linuxlab'@'localhost' IDENTIFIED BY 'linuxlab_pass';\n"
    "GRANT ALL PRIVILEGES ON linuxlab.* TO 'linuxlab'@'localhost';\n"
    "FLUSH PRIVILEGES;\n"
    "EXIT;\n"
    "EOF"
)

pdf.chapter_title("3.2 Redis", level=2)
pdf.code_block("sudo systemctl enable --now redis-server")

pdf.chapter_title("3.3 libvirtd", level=2)
pdf.code_block(
    "sudo systemctl enable --now libvirtd\n"
    "sudo usermod -aG libvirt $USER\n"
    "# Cerrar sesion y volver a entrar para aplicar grupos"
)
pdf.body_text("Verificar que funciona:")
pdf.code_block("virsh list --all")

pdf.chapter_title("3.4 Red virtual por defecto", level=2)
pdf.code_block(
    "sudo virsh net-define /usr/share/libvirt/networks/default.xml\n"
    "sudo virsh net-start default\n"
    "sudo virsh net-autostart default\n"
    "ip addr show virbr0  # Deberia mostrar 192.168.122.1"
)

# --- 4. Descargar el Proyecto ---
pdf.add_page()
pdf.chapter_title("4. Descargar el Proyecto")

pdf.chapter_title("Clonar repositorio", level=2)
pdf.code_block(
    "cd /opt\n"
    "sudo git clone https://github.com/tu-usuario/linuxlab.git\n"
    "sudo chown -R $USER:$USER linuxlab\n"
    "cd linuxlab"
)

pdf.chapter_title("Estructura del proyecto", level=2)
pdf.code_block(
    "linuxlab/\n"
    "  backend/          # FastAPI (Python)\n"
    "    app/\n"
    "    requirements.txt\n"
    "    seed.py\n"
    "  frontend/         # React + TypeScript\n"
    "    src/\n"
    "    nginx/\n"
    "  docker-compose.yml\n"
    "  .env.example"
)

# --- 5. Configurar Entorno ---
pdf.add_page()
pdf.chapter_title("5. Configurar Entorno")

pdf.chapter_title("Variables de entorno", level=2)
pdf.code_block(
    "cp .env.example .env\n"
    "nano .env"
)

pdf.body_text("Contenido del archivo .env:")
pdf.code_block(
    "# Seguridad (CAMBIAR en produccion)\n"
    "SECRET_KEY=generar-una-clave-segura-aqui\n\n"
    "# Base de datos\n"
    "MARIADB_ROOT_PASSWORD=linuxlab_root\n"
    "MARIADB_DATABASE=linuxlab\n"
    "MARIADB_USER=linuxlab\n"
    "MARIADB_PASSWORD=linuxlab_pass\n\n"
    "# JWT\n"
    "ACCESS_TOKEN_EXPIRE_MINUTES=30\n"
    "REFRESH_TOKEN_EXPIRE_DAYS=7\n\n"
    "# CORS (frontend URL)\n"
    'CORS_ORIGINS=["http://localhost", "http://localhost:3000", "http://localhost:5173"]\n\n'
    "# IP del servidor (auto-detectada si no se define)\n"
    "# HOST_IP=192.168.1.100"
)

pdf.chapter_title("Generar SECRET_KEY", level=2)
pdf.code_block(
    "python3 -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
    "# Copiar el resultado y pegarlo en SECRET_KEY del .env"
)

# --- 6. Backend ---
pdf.add_page()
pdf.chapter_title("6. Backend (FastAPI)")

pdf.chapter_title("6.1 Crear entorno virtual", level=2)
pdf.code_block(
    "cd /opt/linuxlab/backend\n"
    "python3 -m venv venv\n"
    "source venv/bin/activate"
)

pdf.chapter_title("6.2 Instalar dependencias Python", level=2)
pdf.code_block(
    "pip install --upgrade pip\n"
    "pip install -r requirements.txt"
)

pdf.chapter_title("6.3 Enlazar libvirt-python (si es necesario)", level=2)
pdf.body_text("Si usaste python3-libvirt (paquete sistema), crea un enlace simbolico en el venv:")
pdf.code_block(
    "cd venv/lib/python3.*/site-packages\n"
    "ln -sf /usr/lib/python3/dist-packages/libvirt.py .\n"
    "ln -sf /usr/lib/python3/dist-packages/libvirtmod.cpython-*.so ."
)

pdf.chapter_title("6.4 Sembrar base de datos", level=2)
pdf.code_block(
    "cd /opt/linuxlab/backend\n"
    "venv/bin/python seed.py"
)
pdf.body_text("Esto crea las tablas, el admin inicial y sincroniza las VMs desde libvirt.")

pdf.chapter_title("6.5 Probar backend", level=2)
pdf.code_block(
    "venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000\n\n"
    "# Probar desde otra terminal:\n"
    "curl http://localhost:8000/api/v1/dashboard\n"
    "curl -X POST http://localhost:8000/api/v1/auth/login \\\n"
    "  -H 'Content-Type: application/json' \\\n"
    "  -d '{\"username\":\"admin\",\"password\":\"linuxlab\"}'"
)

pdf.chapter_title("6.6 Servicio systemd (produccion)", level=2)
pdf.body_text("Crear archivo /etc/systemd/system/linuxlab-backend.service:")
pdf.code_block(
    "[Unit]\n"
    "Description=LinuxLab Backend\n"
    "After=network.target mariadb.service redis-server.service\n\n"
    "[Service]\n"
    "Type=simple\n"
    "User=ubuntu\n"
    "WorkingDirectory=/opt/linuxlab/backend\n"
    "ExecStart=/opt/linuxlab/backend/venv/bin/uvicorn \\\n"
    "  app.main:app --host 0.0.0.0 --port 8000\n"
    "Restart=always\n"
    "RestartSec=5\n"
    "EnvironmentFile=/opt/linuxlab/.env\n\n"
    "[Install]\n"
    "WantedBy=multi-user.target"
)
pdf.code_block(
    "sudo systemctl daemon-reload\n"
    "sudo systemctl enable --now linuxlab-backend\n"
    "sudo systemctl status linuxlab-backend"
)

# --- 7. Frontend ---
pdf.add_page()
pdf.chapter_title("7. Frontend (React + TypeScript)")

pdf.chapter_title("7.1 Instalar dependencias Node.js", level=2)
pdf.code_block(
    "cd /opt/linuxlab/frontend\n"
    "npm install"
)

pdf.chapter_title("7.2 Construir para produccion", level=2)
pdf.code_block(
    "npm run build\n"
    "# El resultado queda en frontend/dist/"
)

pdf.chapter_title("7.3 Configurar Nginx", level=2)
pdf.body_text("Crear /etc/nginx/sites-available/linuxlab:")
pdf.code_block(
    "server {\n"
    "    listen 80;\n"
    "    server_name _;\n\n"
    "    root /opt/linuxlab/frontend/dist;\n"
    "    index index.html;\n\n"
    "    location /api/ {\n"
    "        proxy_pass http://127.0.0.1:8000;\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "    }\n\n"
    "    location /ws {\n"
    "        proxy_pass http://127.0.0.1:8000;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Upgrade $http_upgrade;\n"
    "        proxy_set_header Connection \"upgrade\";\n"
    "    }\n\n"
    "    location / {\n"
    "        try_files $uri $uri/ /index.html;\n"
    "    }\n"
    "}"
)
pdf.code_block(
    "sudo ln -sf /etc/nginx/sites-available/linuxlab /etc/nginx/sites-enabled/\n"
    "sudo rm -f /etc/nginx/sites-enabled/default\n"
    "sudo nginx -t && sudo systemctl reload nginx"
)

# --- 8. iptables ---
pdf.add_page()
pdf.chapter_title("8. Reglas iptables (Puertos de VMs)")

pdf.body_text("LinuxLab gestiona automaticamente las reglas DNAT para los puertos de cada VM. Sin embargo, asegurate de que el reenvio IP este habilitado en el kernel:")

pdf.code_block(
    "echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf\n"
    "sudo sysctl -p"
)

pdf.body_text("Verifica que no haya reglas de firewall (como UFW) bloqueando el reenvio. Las reglas se crean automaticamente al agregar puertos desde la interfaz web.")

# --- 9. Despliegue con Docker ---
pdf.add_page()
pdf.chapter_title("9. Despliegue con Docker (Alternativa)")

pdf.body_text("LinuxLab incluye docker-compose.yml para despliegue automatizado. Nota: el contenedor backend necesita acceso al socket de libvirt del host.")

pdf.chapter_title("Instalar Docker", level=2)
pdf.code_block(
    "curl -fsSL https://get.docker.com | sh\n"
    "sudo usermod -aG docker $USER"
)

pdf.chapter_title("Ejecutar", level=2)
pdf.code_block(
    "cd /opt/linuxlab\n"
    "docker compose up -d"
)

pdf.chapter_title("Consideraciones", level=2)
pdf.bold_bullet("El contenedor backend ", "monta /var/run/libvirt/libvirt-sock para acceder a libvirtd del host.")
pdf.bold_bullet("El Dockerfile ", "instala libvirt-dev y compila libvirt-python.")
pdf.bold_bullet("La base de datos ", "MariaDB y Redis corren en contenedores separados.")
pdf.bold_bullet("El frontend ", "se sirve via Nginx en el contenedor frontend (puerto 80).")

# --- 10. Verificacion ---
pdf.add_page()
pdf.chapter_title("10. Verificacion Post-Despliegue")

pdf.chapter_title("10.1 Probar el login", level=2)
pdf.code_block(
    'curl -X POST http://localhost:8000/api/v1/auth/login \\\n'
    "  -H 'Content-Type: application/json' \\\n"
    '  -d \'{"username":"admin","password":"linuxlab"}\''
)

pdf.chapter_title("10.2 Verificar libvirt", level=2)
pdf.code_block(
    "TOKEN=$(curl -s -X POST ... | python3 -c \"import sys,json; print(json.load(sys.stdin)['access_token'])\")\n"
    "curl -s http://localhost:8000/api/v1/host \\\n"
    "  -H \"Authorization: Bearer $TOKEN\" | python3 -m json.tool"
)
pdf.body_text("Verifica que 'has_libvirt' sea true y aparezcan las VMs.")

pdf.chapter_title("10.3 Acceder desde el navegador", level=2)
pdf.body_text("Abre http://IP-DEL-SERVIDOR/ en tu navegador. Ingresa con usuario admin y contrasena linuxlab.")

pdf.chapter_title("10.4 Logs del backend", level=2)
pdf.code_block("sudo journalctl -u linuxlab-backend -f")

# --- 11. Solucion de Problemas ---
pdf.add_page()
pdf.chapter_title("11. Solucion de Problemas")

pdf.chapter_title("El backend no arranca", level=2)
pdf.bold_bullet("Puerto ocupado: ", "sudo lsof -i :8000")
pdf.bold_bullet("Error de importacion libvirt: ", "Verifica que python3-libvirt o libvirt-python este instalado.")
pdf.bold_bullet("Error de conexion BD: ", "Verifica que MariaDB este corriendo y las credenciales en .env.")

pdf.chapter_title("libvirt no disponible (DummyConnection)", level=2)
pdf.bold_bullet("Causa: ", "HAVE_LIBVIRT=False porque fallo import libvirt o libvirtd no corre.")
pdf.bold_bullet("Solucion: ", "")
pdf.bullet("sudo systemctl status libvirtd", indent=25)
pdf.bullet("pip install libvirt-python (o enlazar python3-libvirt en el venv)", indent=25)
pdf.bullet("Verificar que el usuario del backend tiene permisos (grupo libvirt)", indent=25)

pdf.chapter_title("Error 401 / 403 en el frontend", level=2)
pdf.bold_bullet("Token expirado: ", "Haz login de nuevo.")
pdf.bold_bullet("CORS: ", "Verifica CORS_ORIGINS en .env incluya la URL del frontend.")
pdf.bold_bullet("Proxy Nginx: ", "Verifica que el location /api/ en la config de Nginx apunte al backend correcto.")

pdf.chapter_title("Las reglas iptables no se crean", level=2)
pdf.bold_bullet("Verifica: ", "")
pdf.bullet("net.ipv4.ip_forward = 1 en /etc/sysctl.conf", indent=25)
pdf.bullet("El backend tiene permisos para ejecutar iptables (sudo sin password o grupo)", indent=25)
pdf.bullet("Los logs del backend no muestran errores de iptables", indent=25)

# --- 12. Referencia Rapida ---
pdf.add_page()
pdf.chapter_title("12. Referencia Rapida")

pdf.chapter_title("Comandos utiles", level=2)
pdf.code_block(
    "# Backend\n"
    "sudo systemctl restart linuxlab-backend\n"
    "sudo journalctl -u linuxlab-backend -n 50 --no-pager\n\n"
    "# Frontend (reconstruir)\n"
    "cd /opt/linuxlab/frontend && npm run build\n\n"
    "# Base de datos\n"
    "sudo mysql -u linuxlab -p linuxlab\n\n"
    "# libvirt\n"
    "virsh list --all\n"
    "virsh dominfo vhost-1\n\n"
    "# Redis\n"
    "redis-cli ping\n\n"
    "# Nginx\n"
    "sudo nginx -t && sudo systemctl reload nginx\n\n"
    "# Logs en tiempo real\n"
    "sudo journalctl -u linuxlab-backend -f"
)

pdf.chapter_title("Credenciales por defecto", level=2)
pdf.table_row(["Servicio", "Usuario / Clave"], bold=True, fill=True)
pdf.table_row(["URL Web", "http://IP-DEL-SERVIDOR/"])
pdf.table_row(["Login Admin", "admin / linuxlab"])
pdf.table_row(["MariaDB Root", "root / linuxlab_root"])
pdf.table_row(["MariaDB App", "linuxlab / linuxlab_pass"])

pdf.ln(8)
pdf.chapter_title("Puertos usados", level=2)
pdf.table_row(["Puerto", "Servicio"], bold=True, fill=True)
pdf.table_row(["80", "Nginx (Frontend)"])
pdf.table_row(["8000", "Backend (FastAPI)"])
pdf.table_row(["3306", "MariaDB"])
pdf.table_row(["6379", "Redis"])

# --- Guardar ---
output_path = "/home/ubuntu/linuxlab/guia_despliegue_linuxlab.pdf"
pdf.output(output_path)
print(f"PDF generado: {output_path}")
print(f"Tamanio: {os.path.getsize(output_path) / 1024:.1f} KB")
print(f"Paginas: {pdf.page_no()}")
