#!/bin/sh
set -e

until getent hosts backend > /dev/null 2>&1; do
  echo "Esperando a que backend sea resoluble..."
  sleep 1
done

echo "backend resuelto — iniciando nginx"
exec nginx -g "daemon off;"
