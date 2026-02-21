#!/bin/bash
# =========================================================
# SmartFlow CRM — RunPod Auto-Start Script
# =========================================================
# This script ensures all services start reliably after pod
# restart. It handles dependency installation, health checks
# with retries, and background process management.
#
# Usage:
#   bash /workspace/smartflow/auto-start.sh
#
# Add to RunPod start command:
#   bash /workspace/smartflow/auto-start.sh &
# =========================================================

set -euo pipefail

WORKSPACE="/workspace/smartflow"
LOG_DIR="${WORKSPACE}/logs"
CONTEXT_API_PORT=8999
PERSONAPLEX_PORT=8998
MAX_RETRIES=10
RETRY_DELAY=3

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️${NC} $1"; }
err() { echo -e "${RED}[$(date '+%H:%M:%S')] ❌${NC} $1"; }

# ─── Step 1: Ensure directories ───
log "📁 Dizinler kontrol ediliyor..."
mkdir -p "$LOG_DIR"

# ─── Step 2: Install Python dependencies (pip packages lost on restart) ───
log "📦 Python bağımlılıkları kontrol ediliyor..."
REQUIRED_PACKAGES="fastapi uvicorn httpx pydantic"
MISSING=false

for pkg in $REQUIRED_PACKAGES; do
    if ! python3 -c "import $pkg" 2>/dev/null; then
        MISSING=true
        break
    fi
done

if [ "$MISSING" = true ]; then
    warn "Eksik paketler tespit edildi. Yükleniyor..."
    pip install --quiet $REQUIRED_PACKAGES 2>&1 | tail -3
    log "✅ Python paketleri yüklendi"
else
    log "✅ Python paketleri mevcut"
fi

# ─── Step 3: Kill existing processes ───
log "🔄 Mevcut işlemler kapatılıyor..."
pkill -f "context_api.py" 2>/dev/null || true
pkill -f "server.py.*8998" 2>/dev/null || true
sleep 1

# ─── Step 4: Start Context API ───
log "🚀 Context API başlatılıyor (port $CONTEXT_API_PORT)..."
cd "$WORKSPACE"
nohup python3 context_api.py > "$LOG_DIR/context_api.log" 2>&1 &
CONTEXT_PID=$!
log "  PID: $CONTEXT_PID"

# ─── Step 5: Start Personaplex Server ───
log "🚀 Personaplex Server başlatılıyor (port $PERSONAPLEX_PORT)..."
export PERSONAPLEX_API_KEY="${PERSONAPLEX_API_KEY:-34abba47d042cf4d3481a2391b7839b980fb24a70abfc2486dda8132274091d5}"
export DEVICE="${DEVICE:-cuda}"
nohup python3 server.py > "$LOG_DIR/personaplex.log" 2>&1 &
PERSONA_PID=$!
log "  PID: $PERSONA_PID"

# ─── Step 6: Health Check with Retries ───
log "🏥 Health check başlatılıyor..."

check_health() {
    local port=$1
    local name=$2
    local attempt=0

    while [ $attempt -lt $MAX_RETRIES ]; do
        attempt=$((attempt + 1))
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null || echo "000")
        
        if [ "$RESPONSE" = "200" ]; then
            log "✅ $name sağlıklı (port $port)"
            return 0
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            warn "  $name henüz hazır değil (attempt $attempt/$MAX_RETRIES, HTTP $RESPONSE). ${RETRY_DELAY}s bekleniliyor..."
            sleep $RETRY_DELAY
        fi
    done

    err "$name başlatılamadı (port $port)!"
    return 1
}

check_health $CONTEXT_API_PORT "Context API"
CONTEXT_OK=$?

check_health $PERSONAPLEX_PORT "Personaplex"
PERSONA_OK=$?

# ─── Step 7: Summary ───
echo ""
echo "========================================="
echo " SmartFlow CRM Servis Durumu"
echo "========================================="

if [ "${CONTEXT_OK:-1}" -eq 0 ]; then
    CONTEXT_HEALTH=$(curl -s "http://localhost:$CONTEXT_API_PORT/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'uptime={d.get(\"uptime_seconds\",0):.0f}s sessions={d.get(\"active_sessions\",0)}')" 2>/dev/null || echo "unknown")
    echo -e " ${GREEN}✅${NC} Context API  :$CONTEXT_API_PORT ($CONTEXT_HEALTH)"
else
    echo -e " ${RED}❌${NC} Context API  :$CONTEXT_API_PORT FAILED"
fi

if [ "${PERSONA_OK:-1}" -eq 0 ]; then
    PERSONA_HEALTH=$(curl -s "http://localhost:$PERSONAPLEX_PORT/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'GPU={d.get(\"gpu_name\",\"?\")} VRAM={d.get(\"gpu_memory_gb\",0):.1f}GB sessions={d.get(\"active_sessions\",0)}/{d.get(\"max_sessions\",0)}')" 2>/dev/null || echo "unknown")
    echo -e " ${GREEN}✅${NC} Personaplex  :$PERSONAPLEX_PORT ($PERSONA_HEALTH)"
else
    echo -e " ${RED}❌${NC} Personaplex  :$PERSONAPLEX_PORT FAILED"
fi

echo "========================================="
echo " Log dosyaları: $LOG_DIR/"
echo "========================================="
echo ""

# Return overall status
if [ "${CONTEXT_OK:-1}" -eq 0 ] && [ "${PERSONA_OK:-1}" -eq 0 ]; then
    log "🎉 Tüm servisler başarıyla başlatıldı!"
    exit 0
else
    err "Bazı servisler başlatılamadı. Logları kontrol edin."
    exit 1
fi
