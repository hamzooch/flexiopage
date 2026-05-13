#!/usr/bin/env bash
# BoutShop — one-shot deploy script for the VPS.
# Pulls the latest code, rebuilds the containers, applies migrations
# (if any), and restarts the stack with zero secrets in CLI history.
#
# Usage on the VPS (after first-time setup — see DEPLOY.md):
#   cd /opt/boutshop && ./deploy.sh

set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "❌ .env file missing. Copy .env.production.example to .env and fill it in."
  exit 1
fi

echo "▶ Pulling latest code from GitHub…"
git pull --ff-only

echo "▶ Building and starting containers…"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "▶ Pruning dangling images…"
docker image prune -f

echo "▶ Health check (waiting 10s for boot)…"
sleep 10
docker compose -f docker-compose.prod.yml ps

echo "✅ Deploy complete."
echo "   Frontend → https://$(grep ^DOMAIN= .env | cut -d= -f2)"
echo "   API      → https://$(grep ^API_DOMAIN= .env | cut -d= -f2)"
