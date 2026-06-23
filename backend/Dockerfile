FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvirt-dev gcc pkg-config libc6-dev openssh-client iptables sudo \
    libguestfs-tools && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN groupadd -g 1000 linuxlab && useradd -m -u 1000 -g linuxlab -d /app -s /bin/bash linuxlab && \
    chown -R linuxlab:linuxlab /app && \
    echo 'linuxlab ALL=(ALL) NOPASSWD: /usr/sbin/iptables, /usr/sbin/iptables-save, /usr/sbin/iptables-restore' >> /etc/sudoers

USER linuxlab

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
