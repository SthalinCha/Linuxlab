#!/bin/sh
set -e

# Substitute environment variables in nginx template
VM_SUBNET="${VM_SUBNET:-192.168.122}"
export VM_SUBNET

envsubst '${VM_SUBNET}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "nginx config generated with VM_SUBNET=${VM_SUBNET}"

exec nginx -g "daemon off;"
