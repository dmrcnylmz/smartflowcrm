#!/bin/bash
# ============================================
# RunPod Deployment Script
# ============================================
# Usage: ./deploy-runpod.sh

set -e

echo "=== RunPod Personaplex Deployment ==="

# Configuration
IMAGE_NAME="personaplex-server"
IMAGE_TAG="latest"
REGISTRY="${DOCKER_REGISTRY:-docker.io}"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

# Check required env vars
if [ -z "$HF_TOKEN" ]; then
    echo "ERROR: HF_TOKEN environment variable required"
    echo "Get token from: https://huggingface.co/settings/tokens"
    exit 1
fi

if [ -z "$PERSONAPLEX_API_KEY" ]; then
    echo "WARNING: PERSONAPLEX_API_KEY not set - generating random key"
    PERSONAPLEX_API_KEY=$(openssl rand -hex 32)
    echo "Generated API Key: $PERSONAPLEX_API_KEY"
    echo "Save this key securely!"
fi

# Build Docker image
echo ""
echo "=== Building Docker Image ==="
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

# Tag for registry
if [ -n "$DOCKER_REGISTRY" ]; then
    echo ""
    echo "=== Pushing to Registry ==="
    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${FULL_IMAGE}
    docker push ${FULL_IMAGE}
fi

# Generate RunPod template
echo ""
echo "=== RunPod Configuration ==="
cat << EOF

=========================================
RUNPOD SETUP INSTRUCTIONS
=========================================

1. Go to: https://runpod.io/console/pods

2. Create GPU Pod:
   - GPU: RTX 4090 (24GB) or A100 (40GB)
   - Template: RunPod PyTorch 2.1
   - Container Disk: 50GB
   - Volume Disk: 100GB (for model cache)

3. Or use Serverless:
   - Go to: https://runpod.io/console/serverless
   - Create endpoint with Docker image

4. Environment Variables:
   HF_TOKEN=${HF_TOKEN}
   PERSONAPLEX_API_KEY=${PERSONAPLEX_API_KEY}
   ALLOWED_ORIGINS=https://your-domain.com

5. Exposed Ports: 8998 (HTTP/WebSocket)

6. If using custom Docker image:
   Image: ${FULL_IMAGE}

7. After deployment, test:
   curl https://YOUR_POD_URL/health

=========================================
COST ESTIMATES (as of Jan 2026)
=========================================
RTX 4090:  ~\$0.44/hour
A100 40GB: ~\$1.89/hour
H100 80GB: ~\$4.49/hour (best performance)

Spot instances: 50-70% cheaper
Serverless: Pay per request

=========================================
EOF

echo ""
echo "=== Local Test ==="
echo "To test locally with GPU:"
echo "docker compose up --build"
echo ""
echo "To test health endpoint:"
echo "curl http://localhost:8998/health"
