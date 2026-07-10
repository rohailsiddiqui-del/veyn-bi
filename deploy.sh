#!/bin/bash
# deploy.sh — Pull latest code and restart API
# Run on GCP: bash ~/veyn-bi/deploy.sh

set -e

cd ~/veyn-bi
echo "[deploy] Pulling latest..."
git pull

echo "[deploy] Installing dependencies..."
cd api && npm install --omit=dev && cd ..

echo "[deploy] Restarting API..."
pm2 restart veyn-bi-api

echo "[deploy] Done. Checking status..."
pm2 status veyn-bi-api
