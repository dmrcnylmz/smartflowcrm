#!/bin/bash
# SmartFlow CRM - UI Otomatik Açma Script
# Bu script dev server'ı kontrol eder, çalışmıyorsa başlatır ve tarayıcıyı açar

cd /Users/pc/Desktop/smartflow-crm

# Port kontrolü fonksiyonu
check_port() {
    if lsof -ti:3000 >/dev/null 2>&1; then
        echo 3000
    elif lsof -ti:3002 >/dev/null 2>&1; then
        echo 3002
    else
        echo ""
    fi
}

# Server hazır mı kontrolü
check_server_ready() {
    local port=$1
    curl -s -I "http://localhost:$port" >/dev/null 2>&1
    return $?
}

echo "🔍 Server durumu kontrol ediliyor..."

# Port kontrolü
PORT=$(check_port)

if [ -z "$PORT" ]; then
    echo "🚀 Dev server başlatılıyor..."
    # Background'da başlat
    ./start-dev-background.sh > /tmp/smartflow-dev-start.log 2>&1
    
    # Port'un aktif olmasını bekle (max 30 saniye)
    echo "⏳ Server başlatılıyor (30 saniye max)..."
    for i in {1..30}; do
        sleep 1
        PORT=$(check_port)
        if [ -n "$PORT" ]; then
            echo "✅ Port $PORT aktif!"
            break
        fi
        if [ $((i % 5)) -eq 0 ]; then
            echo "   ⏳ Bekleniyor... ($i/30)"
        fi
    done
    
    if [ -z "$PORT" ]; then
        echo "❌ Server başlatılamadı. Manuel kontrol:"
        echo "   ./start-dev.sh"
        echo "   Log: tail -f /tmp/smartflow-dev.log"
        exit 1
    fi
else
    echo "✅ Port $PORT kullanımda"
fi

# Server'ın hazır olmasını bekle (max 60 saniye)
echo "⏳ Server hazır olması bekleniyor..."
for i in {1..60}; do
    if check_server_ready $PORT; then
        echo "✅ Server hazır!"
        break
    fi
    sleep 1
    if [ $((i % 10)) -eq 0 ]; then
        echo "   ⏳ Bekleniyor... ($i/60)"
    fi
done

# Son kontrol
if ! check_server_ready $PORT; then
    echo "⚠️  Server henüz tam hazır değil, ama tarayıcı açılıyor..."
    echo "   Sayfa yüklenmezse birkaç saniye bekleyin."
fi

URL="http://localhost:$PORT"
echo ""
echo "🌐 Tarayıcı açılıyor: $URL"
echo ""

# macOS'ta tarayıcıyı aç
open "$URL"

echo "✅ Tarayıcı açıldı!"
echo ""
echo "📊 Kontrol komutları:"
echo "   • Log izle: tail -f /tmp/smartflow-dev.log"
echo "   • Durum kontrol: lsof -ti:$PORT"
echo "   • Durdur: pkill -f 'next dev'"
echo ""
