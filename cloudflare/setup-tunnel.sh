#!/bin/bash
# ============================================
# Cloudflare Tunnel Setup Script
# ============================================
# Prerequisites:
# - Cloudflare account
# - Domain added to Cloudflare
# - cloudflared installed

set -e

TUNNEL_NAME="${1:-smartflow-gpu}"
DOMAIN="${2:-voice.smartflow.example.com}"

echo "=== Cloudflare Tunnel Setup ==="
echo "Tunnel: $TUNNEL_NAME"
echo "Domain: $DOMAIN"

# Check cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo ""
    echo "Installing cloudflared..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux (Debian/Ubuntu)
        curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared.deb
        rm cloudflared.deb
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install cloudflared
    else
        echo "Please install cloudflared manually:"
        echo "https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
        exit 1
    fi
fi

# Login if needed
if ! cloudflared tunnel list &> /dev/null; then
    echo ""
    echo "Logging in to Cloudflare..."
    cloudflared tunnel login
fi

# Check if tunnel exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo ""
    echo "Tunnel '$TUNNEL_NAME' already exists"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    echo ""
    echo "Creating tunnel '$TUNNEL_NAME'..."
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

echo "Tunnel ID: $TUNNEL_ID"

# Create/update config
CONFIG_DIR="$HOME/.cloudflared"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/config-${TUNNEL_NAME}.yml" << EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  # Personaplex Voice AI
  - hostname: ${DOMAIN}
    service: http://localhost:8998
    originRequest:
      http2Origin: true
      connectTimeout: 30s
  
  # WebSocket endpoint (same service, different hostname optional)
  - hostname: ws.${DOMAIN}
    service: http://localhost:8998
    originRequest:
      http2Origin: true
  
  - service: http_status:404
EOF

echo ""
echo "Config created: $CONFIG_DIR/config-${TUNNEL_NAME}.yml"

# Route DNS
echo ""
echo "Creating DNS route..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" || echo "DNS route may already exist"

# Print instructions
echo ""
echo "==========================================="
echo "SETUP COMPLETE"
echo "==========================================="
echo ""
echo "To run tunnel:"
echo "  cloudflared tunnel --config $CONFIG_DIR/config-${TUNNEL_NAME}.yml run"
echo ""
echo "To run as service (Linux):"
echo "  sudo cloudflared service install"
echo "  sudo systemctl start cloudflared"
echo ""
echo "Your GPU server will be available at:"
echo "  https://${DOMAIN}"
echo ""
echo "Test:"
echo "  curl https://${DOMAIN}/health"
echo ""
