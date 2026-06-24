FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvirt-dev gcc pkg-config libc6-dev openssh-client iptables sudo \
    libguestfs-tools && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/entrypoint.sh

# Allow root to run iptables without password (already root)
# SSH key dir for VM access — mount via docker-compose volumes
RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
