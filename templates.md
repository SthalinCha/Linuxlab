# Plantillas de VM — CLI-only (sin GUI)

Creación de 5 plantillas qcow2 para clonación via libvirt.
Mismo comportamiento que Ubuntu Server: `--graphics none`, consola serie, `estudiante` user, Cockpit.

## Requisitos del host

```bash
sudo apt install virt-install qemu-kvm libvirt-daemon-system     # Debian/Ubuntu
sudo dnf install virt-install qemu-kvm libvirtd                   # RHEL-family
sudo adduser $(whoami) libvirt
sudo systemctl restart libvirtd
mkdir -p ~/vm_images /var/lib/libvirt/images
```

---

## 1. AlmaLinux 10.2 (MINIMAL — SIN GUI)

### Descargar ISO

```bash
cd ~/vm_images
wget https://repo.almalinux.org/almalinux/10/isos/x86_64/AlmaLinux-10.2-x86_64-boot.iso
chmod o+x /home/ubuntu /home/ubuntu/vm_images
chmod o+r /home/ubuntu/vm_images/AlmaLinux-10.2-x86_64-boot.iso
```

### Crear VM template

```bash
virt-install \
  --name almalinux-server \
  --memory 2048 \
  --vcpus 2 \
  --disk path=/var/lib/libvirt/images/almalinux-server.qcow2,size=10,format=qcow2,bus=virtio \
  --location /home/ubuntu/vm_images/AlmaLinux-10.2-x86_64-boot.iso \
  --network network=default \
  --graphics none \
  --extra-args='console=tty0 console=ttyS0,115200n8 serial'
```

### Post-install (dentro de la VM via consola serie)

```bash
# ── Usuario estudiante ──
useradd -m -s /bin/bash estudiante
echo "estudiante ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/estudiante
mkdir -p ~estudiante/.ssh
cp /root/.ssh/authorized_keys ~estudiante/.ssh/
chown -R estudiante:estudiante ~estudiante/.ssh

# ── Cockpit ──
dnf install -y cockpit openssh-server
systemctl enable --now cockpit.socket sshd

# ── Script de configuración por clon ──
cat > /usr/local/bin/configure-vm.sh << 'SCRIPT'
#!/bin/bash
set -e
FILE="/etc/cockpit/cockpit.conf"
IP=$(hostname -I | awk '{print $1}')
echo "[OK] Configuración de Cockpit verificada en la dirección IP: $IP"
NUM=$(echo "$IP" | awk -F. '{print $4}')
echo "[OK] Número de máquina virtual: $NUM"
echo "[OK] Archivo de configuración de Cockpit: $FILE"
cat > "$FILE" <<EOF
[WebService]
Origins = https://linuxlab.csuioups.org wss://192.168.18.21:90$NUM https://192.168.18.21 wss://192.168.18.21
ForwardedHeader = X-Forwarded-For
AllowUnencrypted = true
UrlRoot = /mv$NUM
EOF
CURRENT_HOSTNAME=$(hostname)
NEW_HOSTNAME="vhost-$NUM"
if [ "$CURRENT_HOSTNAME" != "$NEW_HOSTNAME" ]; then
    hostnamectl set-hostname "$NEW_HOSTNAME"
    echo "[OK] Hostname cambiado a: $NEW_HOSTNAME"
fi
systemctl restart cockpit.socket cockpit.service
echo "[OK] Configuración completada."
SCRIPT
chmod +x /usr/local/bin/configure-vm.sh

# ── Systemd oneshot (corre UNA vez al primer arranque del clon) ──
cat > /etc/systemd/system/vm-firstboot.service << 'UNIT'
[Unit]
Description=VM First Boot Configuration
ConditionPathExists=!/etc/vm-configured

[Service]
Type=oneshot
ExecStart=/usr/local/bin/configure-vm.sh
ExecStartPost=touch /etc/vm-configured
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
UNIT

systemctl enable vm-firstboot.service

# ── Sellar plantilla ──
rm -f /etc/machine-id /var/lib/dbus/machine-id
truncate -s 0 /etc/hostname
poweroff
```

---

## 2. Rocky Linux 10 (MINIMAL — SIN GUI)

### Descargar ISO

```bash
cd ~/vm_images
wget https://download.rockylinux.org/pub/rocky/10/isos/x86_64/Rocky-10.2-x86_64-boot.iso
chmod o+r /home/ubuntu/vm_images/Rocky-10.2-x86_64-boot.iso
```

### Crear VM template

```bash
virt-install \
  --name rocky-server \
  --memory 2048 \
  --vcpus 2 \
  --disk path=/var/lib/libvirt/images/rocky-server.qcow2,size=10,format=qcow2,bus=virtio \
  --location /home/ubuntu/vm_images/Rocky-10.2-x86_64-boot.iso \
  --network network=default \
  --graphics none \
  --extra-args='console=tty0 console=ttyS0,115200n8 serial'
```

### Post-install

```bash
# ── Usuario estudiante ──
useradd -m -s /bin/bash estudiante
echo "estudiante ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/estudiante
mkdir -p ~estudiante/.ssh
cp /root/.ssh/authorized_keys ~estudiante/.ssh/
chown -R estudiante:estudiante ~estudiante/.ssh

# ── Cockpit ──
dnf install -y cockpit openssh-server
systemctl enable --now cockpit.socket sshd

# ── Script + service ──
cat > /usr/local/bin/configure-vm.sh << 'SCRIPT'
#!/bin/bash
set -e
FILE="/etc/cockpit/cockpit.conf"
IP=$(hostname -I | awk '{print $1}')
NUM=$(echo "$IP" | awk -F. '{print $4}')
cat > "$FILE" <<EOF
[WebService]
Origins = https://linuxlab.csuioups.org wss://192.168.18.21:90$NUM https://192.168.18.21 wss://192.168.18.21
ForwardedHeader = X-Forwarded-For
AllowUnencrypted = true
UrlRoot = /mv$NUM
EOF
CURRENT_HOSTNAME=$(hostname)
NEW_HOSTNAME="vhost-$NUM"
if [ "$CURRENT_HOSTNAME" != "$NEW_HOSTNAME" ]; then
    hostnamectl set-hostname "$NEW_HOSTNAME"
fi
systemctl restart cockpit.socket cockpit.service
SCRIPT
chmod +x /usr/local/bin/configure-vm.sh

cat > /etc/systemd/system/vm-firstboot.service << 'UNIT'
[Unit]
Description=VM First Boot Configuration
ConditionPathExists=!/etc/vm-configured

[Service]
Type=oneshot
ExecStart=/usr/local/bin/configure-vm.sh
ExecStartPost=touch /etc/vm-configured
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
UNIT

systemctl enable vm-firstboot.service

# ── Sellar ──
rm -f /etc/machine-id /var/lib/dbus/machine-id
truncate -s 0 /etc/hostname
poweroff
```

---

## 3. Fedora Server 42 (MINIMAL — SIN GUI)

### Descargar ISO

```bash
cd ~/vm_images
wget https://download.fedoraproject.org/pub/fedora/linux/releases/42/Server/x86_64/iso/Fedora-Server-dvd-x86_64-42-1.1.iso
chmod o+r /home/ubuntu/vm_images/Fedora-Server-dvd-x86_64-42-1.1.iso
```

O via `--location` URL directa (sin ISO):

```bash
virt-install \
  --name fedora-server \
  --memory 2048 \
  --vcpus 2 \
  --disk path=/var/lib/libvirt/images/fedora-server.qcow2,size=10,format=qcow2,bus=virtio \
  --location https://dl.fedoraproject.org/pub/fedora/linux/releases/42/Server/x86_64/os/ \
  --network network=default \
  --graphics none \
  --extra-args='console=tty0 console=ttyS0,115200n8 serial'
```

Con ISO local:

```bash
virt-install \
  --name fedora-server \
  --memory 2048 \
  --vcpus 2 \
  --disk path=/var/lib/libvirt/images/fedora-server.qcow2,size=10,format=qcow2,bus=virtio \
  --location /home/ubuntu/vm_images/Fedora-Server-dvd-x86_64-42-1.1.iso \
  --network network=default \
  --graphics none \
  --extra-args='console=tty0 console=ttyS0,115200n8 serial'
```

### Post-install

```bash
useradd -m -s /bin/bash estudiante
echo "estudiante ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/estudiante
mkdir -p ~estudiante/.ssh
cp /root/.ssh/authorized_keys ~estudiante/.ssh/
chown -R estudiante:estudiante ~estudiante/.ssh

dnf install -y cockpit openssh-server
systemctl enable --now cockpit.socket sshd

cat > /usr/local/bin/configure-vm.sh << 'SCRIPT'
#!/bin/bash
set -e
FILE="/etc/cockpit/cockpit.conf"
IP=$(hostname -I | awk '{print $1}')
NUM=$(echo "$IP" | awk -F. '{print $4}')
cat > "$FILE" <<EOF
[WebService]
Origins = https://linuxlab.csuioups.org wss://192.168.18.21:90$NUM https://192.168.18.21 wss://192.168.18.21
ForwardedHeader = X-Forwarded-For
AllowUnencrypted = true
UrlRoot = /mv$NUM
EOF
CURRENT_HOSTNAME=$(hostname)
NEW_HOSTNAME="vhost-$NUM"
if [ "$CURRENT_HOSTNAME" != "$NEW_HOSTNAME" ]; then
    hostnamectl set-hostname "$NEW_HOSTNAME"
fi
systemctl restart cockpit.socket cockpit.service
SCRIPT
chmod +x /usr/local/bin/configure-vm.sh

cat > /etc/systemd/system/vm-firstboot.service << 'UNIT'
[Unit]
Description=VM First Boot Configuration
ConditionPathExists=!/etc/vm-configured

[Service]
Type=oneshot
ExecStart=/usr/local/bin/configure-vm.sh
ExecStartPost=touch /etc/vm-configured
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
UNIT

systemctl enable vm-firstboot.service

rm -f /etc/machine-id /var/lib/dbus/machine-id
truncate -s 0 /etc/hostname
poweroff
```

---

## 4. Debian 13 Trixie (NETINST — SIN GUI)

### Descargar ISO

```bash
cd ~/vm_images
wget https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.5.0-amd64-netinst.iso
chmod o+r /home/ubuntu/vm_images/debian-13.5.0-amd64-netinst.iso
```

### Crear VM template

```bash
virt-install \
  --name debian-server \
  --memory 2048 \
  --vcpus 2 \
  --disk path=/var/lib/libvirt/images/debian-server.qcow2,size=10,format=qcow2,bus=virtio \
  --location /home/ubuntu/vm_images/debian-13.5.0-amd64-netinst.iso \
  --network network=default \
  --graphics none \
  --extra-args='console=tty0 console=ttyS0,115200n8 serial'
```

### Post-install

```bash
useradd -m -s /bin/bash estudiante
echo "estudiante ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/estudiante
mkdir -p ~estudiante/.ssh
cp /root/.ssh/authorized_keys ~estudiante/.ssh/
chown -R estudiante:estudiante ~estudiante/.ssh

apt update && apt install -y cockpit openssh-server
systemctl enable --now cockpit.socket sshd

cat > /usr/local/bin/configure-vm.sh << 'SCRIPT'
#!/bin/bash
set -e
FILE="/etc/cockpit/cockpit.conf"
IP=$(hostname -I | awk '{print $1}')
NUM=$(echo "$IP" | awk -F. '{print $4}')
cat > "$FILE" <<EOF
[WebService]
Origins = https://linuxlab.csuioups.org wss://192.168.18.21:90$NUM https://192.168.18.21 wss://192.168.18.21
ForwardedHeader = X-Forwarded-For
AllowUnencrypted = true
UrlRoot = /mv$NUM
EOF
CURRENT_HOSTNAME=$(hostname)
NEW_HOSTNAME="vhost-$NUM"
if [ "$CURRENT_HOSTNAME" != "$NEW_HOSTNAME" ]; then
    hostnamectl set-hostname "$NEW_HOSTNAME"
fi
systemctl restart cockpit.socket cockpit.service
SCRIPT
chmod +x /usr/local/bin/configure-vm.sh

cat > /etc/systemd/system/vm-firstboot.service << 'UNIT'
[Unit]
Description=VM First Boot Configuration
ConditionPathExists=!/etc/vm-configured

[Service]
Type=oneshot
ExecStart=/usr/local/bin/configure-vm.sh
ExecStartPost=touch /etc/vm-configured
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
UNIT

systemctl enable vm-firstboot.service

rm -f /etc/machine-id /var/lib/dbus/machine-id
truncate -s 0 /etc/hostname
poweroff
```

---

## 5. Alpine Linux 3.24 (SIN GUI POR DEFECTO)

> **Nota:** Alpine usa OpenRC, NO systemd. El oneshot service se implementa via `/etc/local.d/`.

### Descargar ISO

```bash
cd ~/vm_images
wget https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86_64/alpine-virt-3.24.1-x86_64.iso
chmod o+r /home/ubuntu/vm_images/alpine-virt-3.24.1-x86_64.iso
```

### Crear VM template

```bash
virt-install \
  --name alpine-server \
  --memory 512 \
  --vcpus 1 \
  --disk path=/var/lib/libvirt/images/alpine-server.qcow2,size=4,format=qcow2,bus=virtio \
  --cdrom /home/ubuntu/vm_images/alpine-virt-3.24.1-x86_64.iso \
  --network network=default \
  --graphics none \
  --console pty,target_type=serial \
  --extra-args='console=ttyS0,115200n8'
```

> Alpine NO funciona con `--location` ISO. Usar `--cdrom`.

### Post-install

```bash
# ── Usuario estudiante ──
adduser -D -s /bin/bash estudiante
echo "estudiante ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
mkdir -p ~estudiante/.ssh
cp /root/.ssh/authorized_keys ~estudiante/.ssh/
chown -R estudiante:estudiante ~estudiante/.ssh

# ── Cockpit ──
apk add cockpit openssh
rc-update add cockpit
rc-update add sshd
rc-service cockpit start
rc-service sshd start

# ── Script de configuración ──
cat > /usr/local/bin/configure-vm.sh << 'SCRIPT'
#!/bin/sh
set -e
FILE="/etc/cockpit/cockpit.conf"
IP=$(hostname -I | awk '{print $1}')
NUM=$(echo "$IP" | awk -F. '{print $4}')
cat > "$FILE" <<EOF
[WebService]
Origins = https://linuxlab.csuioups.org wss://192.168.18.21:90$NUM https://192.168.18.21 wss://192.168.18.21
ForwardedHeader = X-Forwarded-For
AllowUnencrypted = true
UrlRoot = /mv$NUM
EOF
CURRENT_HOSTNAME=$(hostname)
NEW_HOSTNAME="vhost-$NUM"
if [ "$CURRENT_HOSTNAME" != "$NEW_HOSTNAME" ]; then
    hostname "$NEW_HOSTNAME"
    echo "$NEW_HOSTNAME" > /etc/hostname
fi
rc-service cockpit restart
SCRIPT
chmod +x /usr/local/bin/configure-vm.sh

# ── OpenRC local.d (corre UNA vez al primer arranque) ──
cat > /etc/local.d/vm-firstboot.start << 'START'
#!/bin/sh
if [ ! -f /etc/vm-configured ]; then
    /usr/local/bin/configure-vm.sh
    touch /etc/vm-configured
fi
START
chmod +x /etc/local.d/vm-firstboot.start
rc-update add local

# ── Sellar ──
rm -f /etc/machine-id
truncate -s 0 /etc/hostname
poweroff
```

---

## Sellado final de plantillas

Después de que cada VM template se apaga (`poweroff`), renombrar el qcow2 para usarlo como plantilla:

```bash
for img in almalinux rocky fedora debian alpine; do
  mv /var/lib/libvirt/images/${img}-server.qcow2 \
     /var/lib/libvirt/images/${img}-main.qcow2
done
```

Para usar una plantilla distinta, en el backend cambiar `default_template` en `system_parameters`:

```sql
UPDATE system_parameters SET value = 'debian-main' WHERE key = 'default_template';
```

O extender el modelo `VirtualMachine` con un campo `distro` para seleccionar template por VM.

---

## Resumen

| Distro | Init system | --location | Package manager | Cockpit package |
|--------|-------------|-----------|-----------------|-----------------|
| AlmaLinux 10.2 | systemd | ✅ ISO boot | `dnf` | `cockpit` |
| Rocky Linux 10 | systemd | ✅ ISO boot | `dnf` | `cockpit` |
| Fedora 42 | systemd | ✅ URL o ISO | `dnf` | `cockpit` |
| Debian 13 | systemd | ✅ ISO netinst | `apt` | `cockpit` |
| Alpine 3.24 | OpenRC | ❌ usar `--cdrom` | `apk` | `cockpit` |
