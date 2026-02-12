#!/bin/bash
# ============================================
# Lambda Labs Deployment Script
# ============================================
# Usage: ./deploy-lambda.sh <instance-id>

set -e

INSTANCE_ID=${1:-""}
SSH_KEY="${LAMBDA_SSH_KEY:-~/.ssh/id_rsa}"

echo "=== Lambda Labs Personaplex Deployment ==="

if [ -z "$INSTANCE_ID" ]; then
    echo ""
    echo "==========================================="
    echo "LAMBDA LABS SETUP INSTRUCTIONS"
    echo "==========================================="
    echo ""
    echo "1. Create account: https://cloud.lambdalabs.com"
    echo ""
    echo "2. Launch GPU instance:"
    echo "   - Recommended: 1x A100 (40GB) or 1x RTX A6000"
    echo "   - OS: Ubuntu 22.04"
    echo "   - Add SSH key"
    echo ""
    echo "3. Get instance IP from dashboard"
    echo ""
    echo "4. Run this script with instance ID:"
    echo "   ./deploy-lambda.sh <instance-ip>"
    echo ""
    echo "==========================================="
    echo "PRICING (as of Jan 2026)"
    echo "==========================================="
    echo "1x A100 40GB:  \$1.29/hour"
    echo "1x A100 80GB:  \$1.99/hour"
    echo "1x H100 80GB:  \$2.49/hour"
    echo "8x A100 40GB:  \$10.32/hour"
    echo ""
    exit 0
fi

echo "Deploying to: $INSTANCE_ID"

# Check required env vars
if [ -z "$HF_TOKEN" ]; then
    echo "ERROR: HF_TOKEN environment variable required"
    exit 1
fi

PERSONAPLEX_API_KEY=${PERSONAPLEX_API_KEY:-$(openssl rand -hex 32)}

# Create deployment package
echo "Creating deployment package..."
DEPLOY_DIR=$(mktemp -d)
cp -r . "$DEPLOY_DIR/"
cat > "$DEPLOY_DIR/.env" << EOF
HF_TOKEN=${HF_TOKEN}
PERSONAPLEX_API_KEY=${PERSONAPLEX_API_KEY}
ALLOWED_ORIGINS=*
MAX_SESSIONS=4
EOF

# Upload to instance
echo "Uploading to Lambda instance..."
rsync -avz -e "ssh -i $SSH_KEY" \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '.env.local' \
    "$DEPLOY_DIR/" ubuntu@${INSTANCE_ID}:~/personaplex/

# Setup and run on remote
echo "Setting up on remote..."
ssh -i "$SSH_KEY" ubuntu@${INSTANCE_ID} << 'REMOTE_SCRIPT'
cd ~/personaplex

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    newgrp docker
fi

# Install nvidia-container-toolkit if needed
if ! command -v nvidia-container-toolkit &> /dev/null; then
    echo "Installing NVIDIA Container Toolkit..."
    distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
    curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
    curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update
    sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
fi

# Build and run
echo "Building Docker image..."
docker compose down 2>/dev/null || true
docker compose up --build -d

# Wait for health
echo "Waiting for server to be ready..."
for i in {1..60}; do
    if curl -s http://localhost:8998/health | grep -q "healthy"; then
        echo "Server is ready!"
        break
    fi
    sleep 5
done

docker compose logs --tail=50
REMOTE_SCRIPT

# Cleanup
rm -rf "$DEPLOY_DIR"

echo ""
echo "==========================================="
echo "DEPLOYMENT COMPLETE"
echo "==========================================="
echo "Server: http://${INSTANCE_ID}:8998"
echo "Health: http://${INSTANCE_ID}:8998/health"
echo "API Key: ${PERSONAPLEX_API_KEY}"
echo ""
echo "Test: curl http://${INSTANCE_ID}:8998/health"
echo ""
