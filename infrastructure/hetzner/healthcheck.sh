#!/bin/bash
# ============================================
# Callception — Health Check Script
# ============================================
# Run via cron every 5 minutes:
#   */5 * * * * /opt/callception/healthcheck.sh >> /var/log/callception-health.log 2>&1
# ============================================

DOMAIN="${DOMAIN:-callception.com}"
LOG_FILE="/var/log/callception-alerts.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

check_service() {
    local name=$1
    local url=$2
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)

    if [ "$status" != "200" ]; then
        echo "[$TIMESTAMP] ALERT: $name is DOWN (HTTP $status)" >> "$LOG_FILE"
        return 1
    fi
    return 0
}

# ---- Service Health Checks ----
ERRORS=0

check_service "Kokoro TTS"  "http://localhost:8880/health" || ERRORS=$((ERRORS + 1))
check_service "n8n"         "http://localhost:5678/healthz" || ERRORS=$((ERRORS + 1))
check_service "Context API" "http://localhost:8999/health"  || ERRORS=$((ERRORS + 1))

# ---- Docker Container Health ----
for container in callception-kokoro callception-n8n callception-context-api callception-nginx; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
    if [ "$status" != "healthy" ] && [ "$status" != "" ]; then
        echo "[$TIMESTAMP] WARNING: Container $container status=$status" >> "$LOG_FILE"
    fi
done

# ---- Disk Usage Warning (>85%) ----
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "[$TIMESTAMP] WARNING: Disk usage at ${DISK_USAGE}%" >> "$LOG_FILE"
fi

# ---- Memory Usage Warning (>90%) ----
MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo "[$TIMESTAMP] WARNING: Memory usage at ${MEM_USAGE}%" >> "$LOG_FILE"
fi

if [ "$ERRORS" -eq 0 ]; then
    echo "[$TIMESTAMP] OK: All services healthy" >> /dev/null  # Silent success
fi
