#!/bin/bash
# ============================================
# Callception — Hetzner VPS Initial Setup
# ============================================
# Run as root on a fresh Ubuntu 22.04/24.04 server
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
# ============================================
set -euo pipefail

echo "========================================"
echo "  Callception — Cloud Infrastructure"
echo "  Hetzner VPS Initial Setup"
echo "========================================"

# ---- 1. System Updates ----
echo "[1/5] Updating system packages..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban htop

# ---- 2. Install Docker ----
echo "[2/5] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker && systemctl start docker
    echo "Docker installed: $(docker --version)"
else
    echo "Docker already installed: $(docker --version)"
fi

# ---- 3. Firewall ----
echo "[3/5] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP (redirect to HTTPS)'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
ufw status verbose

# ---- 4. Create Project Directory ----
echo "[4/5] Setting up project directory..."
mkdir -p /opt/callception/ssl
cd /opt/callception

# ---- 5. Setup Cron Health Check ----
echo "[5/5] Setting up health check cron..."
if [ -f /opt/callception/healthcheck.sh ]; then
    chmod +x /opt/callception/healthcheck.sh
    (crontab -l 2>/dev/null | grep -v callception; echo "*/5 * * * * /opt/callception/healthcheck.sh >> /var/log/callception-health.log 2>&1") | crontab -
    echo "Health check cron installed (every 5 minutes)"
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Clone repo or copy infrastructure/hetzner/* to /opt/callception/"
echo "  2. Place Cloudflare Origin Certificate:"
echo "     - /opt/callception/ssl/origin.pem"
echo "     - /opt/callception/ssl/origin-key.pem"
echo "  3. Copy .env.example to .env and fill in values:"
echo "     cp .env.example .env && nano .env"
echo "  4. Start all services:"
echo "     docker compose up -d"
echo "  5. Verify:"
echo "     docker compose ps"
echo "     docker compose logs -f"
echo ""
echo "DNS Records needed in Cloudflare (A records → $(curl -s ifconfig.me)):"
echo "  tts.callception.com     → $(curl -s ifconfig.me)"
echo "  n8n.callception.com     → $(curl -s ifconfig.me)"
echo "  context.callception.com → $(curl -s ifconfig.me)"
echo ""
