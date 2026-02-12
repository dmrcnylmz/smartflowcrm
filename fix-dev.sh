#!/bin/bash

# SmartFlow CRM - Dev Server Fix Script
# Bu script dev server sorunlarını çözer ve temiz başlatma yapar

set -e

echo "🔧 SmartFlow CRM - Dev Server Fix"
echo "=================================="
echo ""

# 1. Tüm Next.js/Node process'lerini durdur
echo "1️⃣  Mevcut process'leri durduruluyor..."
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
sleep 2
echo "   ✅ Process'ler temizlendi"
echo ""

# 2. Cache ve lock dosyalarını temizle
echo "2️⃣  Cache temizleniyor..."
rm -rf .next 2>/dev/null || true
rm -f .next/dev/lock 2>/dev/null || true
rm -f .next/dev/server.js 2>/dev/null || true
echo "   ✅ Cache temizlendi"
echo ""

# 3. Port kontrolü ve seçimi
PORT=3000
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 kullanımda, 3002'ye geçiliyor..."
    PORT=3002
fi

if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "⚠️  Port $PORT da kullanımda, temizleniyor..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 2
fi

echo "3️⃣  Port $PORT seçildi"
echo ""

# 4. Dev server'ı başlat
echo "4️⃣  Dev server başlatılıyor..."
echo "   📍 URL: http://localhost:$PORT"
echo ""

# Background'da başlat - port'a göre script seç
if [ "$PORT" = "3002" ]; then
    npm run dev:3002 > /tmp/smartflow-dev.log 2>&1 &
else
    PORT=$PORT npm run dev:3000 > /tmp/smartflow-dev.log 2>&1 &
fi
SERVER_PID=$!

echo "   ⏳ Server başlatılıyor (PID: $SERVER_PID)..."
echo "   📝 Log: /tmp/smartflow-dev.log"
echo ""

# 5. Server'ın hazır olmasını bekle
echo "5️⃣  Server'ın hazır olması bekleniyor..."
for i in {1..30}; do
    if curl -s http://localhost:$PORT >/dev/null 2>&1; then
        echo ""
        echo "   ✅ Server hazır!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "   ⚠️  Server başlatılamadı, log kontrol edin:"
        echo "   tail -50 /tmp/smartflow-dev.log"
        exit 1
    fi
    printf "."
    sleep 1
done

echo ""
echo ""

# 6. Tarayıcıyı aç
echo "6️⃣  Tarayıcı açılıyor..."
sleep 1

# macOS için
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:$PORT"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:$PORT" 2>/dev/null || true
fi

echo ""
echo "✅✅✅ BAŞARILI!"
echo "=================================="
echo ""
echo "🌐 Server: http://localhost:$PORT"
echo "📱 Network: http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}'):$PORT"
echo ""
echo "📋 Sayfalar:"
echo "   - Dashboard: http://localhost:$PORT/"
echo "   - Çağrılar: http://localhost:$PORT/calls"
echo "   - Randevular: http://localhost:$PORT/appointments"
echo "   - Şikayetler: http://localhost:$PORT/complaints"
echo "   - Müşteriler: http://localhost:$PORT/customers"
echo "   - Ticketlar: http://localhost:$PORT/tickets"
echo "   - Raporlar: http://localhost:$PORT/reports"
echo "   - Ayarlar: http://localhost:$PORT/admin"
echo ""
echo "📝 Log takibi:"
echo "   tail -f /tmp/smartflow-dev.log"
echo ""
echo "🛑 Server'ı durdurmak için:"
echo "   kill $SERVER_PID"
echo "   veya: pkill -f 'next dev'"
echo ""

