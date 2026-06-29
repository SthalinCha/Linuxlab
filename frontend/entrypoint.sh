#!/bin/sh
set -e

# Generate self-signed SSL cert if missing
if [ ! -f /etc/nginx/ssl/linuxlab.crt ]; then
    mkdir -p /etc/nginx/ssl
    # Install openssl if not present
    command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl 2>/dev/null
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/linuxlab.key \
        -out /etc/nginx/ssl/linuxlab.crt \
        -subj "/CN=linuxlab" 2>/dev/null
    echo "SSL cert generated"
fi

# Substitute environment variables in nginx template
VM_SUBNET="${VM_SUBNET:-192.168.122}"
export VM_SUBNET

envsubst '${VM_SUBNET}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "nginx config generated with VM_SUBNET=${VM_SUBNET}"

exec nginx -g "daemon off;"
