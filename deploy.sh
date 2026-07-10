#!/bin/bash
# deploy.sh — Pull latest code, restart API, build and restart web frontend
# Run on GCP: bash ~/veyn-bi/deploy.sh

set -e

cd ~/veyn-bi

# Preserve .env across git operations
if [ -f api/.env ]; then
  cp api/.env /tmp/veyn-bi-api.env.bak
  echo "[deploy] .env backed up"
fi

echo "[deploy] Pulling latest..."
git pull

# Restore .env if git wiped it
if [ ! -f api/.env ] && [ -f /tmp/veyn-bi-api.env.bak ]; then
  cp /tmp/veyn-bi-api.env.bak api/.env
  echo "[deploy] .env restored from backup"
fi

echo "[deploy] Installing API dependencies..."
cd api && npm install --omit=dev && cd ..

echo "[deploy] Restarting API..."
pm2 restart veyn-bi-api

echo "[deploy] Installing web dependencies..."
cd web && npm install && cd ..

echo "[deploy] Building web frontend..."
cd web && npm run build && cd ..

echo "[deploy] Restarting web frontend..."
pm2 restart veyn-bi-web 2>/dev/null || pm2 start "npm" --name "veyn-bi-web" --cwd ~/veyn-bi/web -- run start -- -p 5001

echo "[deploy] Done."
pm2 status
