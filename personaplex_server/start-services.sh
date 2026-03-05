#!/bin/bash
# SmartFlow CRM — Pod Restart All-in-One Script
# Tek komut: bash /workspace/smartflow/start-services.sh
set -e
WORK="/workspace/smartflow"
echo "🚀 SmartFlow servisleri başlatılıyor..."

# Eski processler varsa temizle
pkill -f "n8n start" 2>/dev/null || true
pkill -f "context_api.py" 2>/dev/null || true
pkill -f "server.py" 2>/dev/null || true
sleep 2

# n8n
export N8N_HOST=0.0.0.0
export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_USER_FOLDER=$WORK/n8n-data
export WEBHOOK_URL=https://$(cat /etc/hostname 2>/dev/null || echo "pod")-5678.proxy.runpod.net/
nohup n8n start > $WORK/logs/n8n.log 2>&1 &
echo "  ✅ n8n PID: $! (port 5678)"
sleep 3

# Context API
cd $WORK
nohup python3 context_api.py > $WORK/logs/context_api.log 2>&1 &
echo "  ✅ Context API PID: $! (port 8999)"
sleep 3

# Personaplex Server
cd $WORK
export DEVICE=cuda
export PERSONAPLEX_API_KEY=34abba47d042cf4d3481a2391b7839b980fb24a70abfc2486dda8132274091d5
nohup python3 server.py > $WORK/logs/personaplex.log 2>&1 &
echo "  ✅ Personaplex PID: $! (port 8998)"
sleep 5

# Health Checks
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SERVİSLER BAŞLATILDI                    ║"
echo "╠══════════════════════════════════════════╣"
echo "║  n8n         → :5678                     ║"
echo "║  Context API → :8999                     ║"
echo "║  Personaplex → :8998 (CUDA)              ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Health Checks:"
curl -s http://localhost:5678/ > /dev/null 2>&1 && echo "  n8n        : ✅ OK" || echo "  n8n        : ⏳ Starting..."
curl -s http://localhost:8999/health > /dev/null 2>&1 && echo "  Context    : ✅ OK" || echo "  Context    : ⏳ Starting..."
curl -s http://localhost:8998/health > /dev/null 2>&1 && echo "  Personaplex: ✅ OK" || echo "  Personaplex: ⏳ Starting..."
