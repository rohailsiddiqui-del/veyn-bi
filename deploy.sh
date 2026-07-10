#!/bin/bash
# deploy.sh — Pull latest code and restart API
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

echo "[deploy] Installing dependencies..."
cd api && npm install --omit=dev && cd ..

echo "[deploy] Restarting API..."
pm2 restart veyn-bi-api

echo "[deploy] Done. Checking status..."
pm2 status veyn-bi-api
