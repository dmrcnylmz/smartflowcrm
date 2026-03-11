#!/bin/bash
# ============================================
# Hetzner — Personaplex Removal Script
# ============================================
# Run on Hetzner server after git pull:
#   ssh root@168.119.165.172 "bash /opt/callception/infrastructure/hetzner/apply-changes.sh"

set -e
cd /opt/callception

echo "=== Pulling latest changes ==="
git pull origin main

echo "=== Stopping personaplex-server ==="
docker compose stop personaplex-server 2>/dev/null || echo "(already stopped or not found)"
docker compose rm -f personaplex-server 2>/dev/null || echo "(nothing to remove)"

echo "=== Reloading nginx config ==="
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload

echo "=== Current service status ==="
docker compose ps

echo ""
echo "=== Done! Personaplex removed from Hetzner. ==="
echo "=== Now running: nginx, kokoro, n8n, context-api ==="
