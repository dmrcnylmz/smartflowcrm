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

# ---- 4. Mount Hetzner Cloud Volume ----
echo "[4/6] Setting up Hetzner Cloud Volume..."
VOLUME_MOUNT="/mnt/callception-data"

# Check if volume is already mounted
if mountpoint -q "$VOLUME_MOUNT" 2>/dev/null; then
    echo "Volume already mounted at $VOLUME_MOUNT"
else
    # Detect Hetzner volume device (usually /dev/sdb or /dev/disk/by-id/scsi-0HC_Volume_*)
    VOLUME_DEV=""
    for dev in /dev/disk/by-id/scsi-0HC_Volume_*; do
        if [ -e "$dev" ]; then
            VOLUME_DEV="$dev"
            break
        fi
    done

    if [ -z "$VOLUME_DEV" ]; then
        echo "⚠️  No Hetzner Cloud Volume detected."
        echo "   Create one in Hetzner Cloud Console → Volumes → Create Volume"
        echo "   Attach it to this server, then re-run this script."
        echo ""
        echo "   Or manually mount:"
        echo "     mkfs.ext4 /dev/sdb                    # Only first time!"
        echo "     mkdir -p $VOLUME_MOUNT"
        echo "     mount /dev/sdb $VOLUME_MOUNT"
        echo "     echo '/dev/sdb $VOLUME_MOUNT ext4 defaults 0 2' >> /etc/fstab"
    else
        echo "Found Hetzner Volume: $VOLUME_DEV"

        # Check if already formatted
        if ! blkid "$VOLUME_DEV" | grep -q ext4; then
            echo "Formatting volume as ext4..."
            mkfs.ext4 "$VOLUME_DEV"
        fi

        mkdir -p "$VOLUME_MOUNT"
        mount "$VOLUME_DEV" "$VOLUME_MOUNT"

        # Add to fstab for auto-mount on reboot
        if ! grep -q "callception-data" /etc/fstab; then
            echo "$VOLUME_DEV $VOLUME_MOUNT ext4 discard,nofail,defaults 0 2" >> /etc/fstab
            echo "Added to /etc/fstab for auto-mount"
        fi

        echo "Volume mounted at $VOLUME_MOUNT"
    fi
fi

# Create data directories on the volume
mkdir -p "$VOLUME_MOUNT"/{kokoro-models,n8n-data,backups}
# n8n runs as uid 1000 inside container
chown -R 1000:1000 "$VOLUME_MOUNT/n8n-data"
echo "Data directories created:"
echo "  $VOLUME_MOUNT/kokoro-models/  — TTS model cache"
echo "  $VOLUME_MOUNT/n8n-data/       — Workflows & DB"
echo "  $VOLUME_MOUNT/backups/        — Automated backups"

# ---- 5. Create Project Directory ----
echo "[5/6] Setting up project directory..."
mkdir -p /opt/callception/ssl
cd /opt/callception

# ---- 6. Setup Cron Health Check ----
echo "[6/6] Setting up health check cron..."
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
echo "Storage:"
echo "  Hetzner Volume: /mnt/callception-data"
echo "  ├── kokoro-models/  — TTS model weights (~500MB)"
echo "  ├── n8n-data/       — Workflows + SQLite DB"
echo "  └── backups/        — Automated backups"
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
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "SERVER_IP")
echo "DNS Records needed in Cloudflare (A records → $SERVER_IP):"
echo "  tts.callception.com     → $SERVER_IP"
echo "  n8n.callception.com     → $SERVER_IP"
echo "  context.callception.com → $SERVER_IP"
echo ""
echo "Volume Safety:"
echo "  - Server silinse bile volume ayrı yaşar"
echo "  - Yeni sunucuya attach edip aynı yerden devam edebilirsin"
echo "  - Backup: rsync /mnt/callception-data/backups/ offsite"
echo ""
