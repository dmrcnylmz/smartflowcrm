#!/bin/bash

# SmartFlow CRM - Instant Dev Server
# Maksimum hız optimizasyonu + Otomatik UI açma

cd /Users/pc/Desktop/smartflow-crm

echo "⚡ SmartFlow CRM - INSTANT Başlatılıyor..."
echo ""

# Port belirleme (3002 öncelikli)
PORT=3002

# Port kontrolü ve temizlik
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port $PORT kullanımda, temizleniyor..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Hızlı process temizliği
pkill -9 -f "next dev" 2>/dev/null || true
sleep 0.5

# Lock dosyasını temizle
rm -f .next/dev/lock 2>/dev/null

# Cache dizinlerini hazırla
mkdir -p .next/cache 2>/dev/null
mkdir -p .next/types 2>/dev/null

# Font cache'ini kontrol et
if [ ! -d ".next/cache/fonts" ]; then
    echo "   🔄 İlk çalıştırma - fontlar indiriliyor..."
fi

echo "🚀 Server başlatılıyor..."
echo "   📍 http://localhost:$PORT"
echo ""
echo "✨ Optimizasyonlar:"
echo "   ✅ Turbopack aktif"
echo "   ✅ Telemetry kapalı"
echo "   ✅ Memory optimization aktif"
echo "   ✅ Font caching aktif"
echo "   🌐 UI otomatik açılacak"
echo ""

# Server'ı arka planda başlat
NEXT_TELEMETRY_DISABLED=1 \
NODE_ENV=development \
NODE_OPTIONS="--max-old-space-size=4096" \
npx next dev -p $PORT --turbo > /tmp/nextjs-$PORT.log 2>&1 &
SERVER_PID=$!

echo "   🔄 Server başlatılıyor (PID: $SERVER_PID)..."

# Server'ın hazır olmasını bekle (max 30 saniye)
for i in {1..30}; do
    sleep 1
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "   ✅ Server hazır! ($i saniye)"
        sleep 1
        echo ""
        echo "🌐 Tarayıcı açılıyor..."
        open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || echo "   ⚠️  Tarayıcıyı manuel açın: http://localhost:$PORT"
        echo ""
        echo "📋 Loglar: tail -f /tmp/nextjs-$PORT.log"
        echo "🛑 Durdurmak için: kill $SERVER_PID"
        echo ""
        # Server'ı foreground'a al
        wait $SERVER_PID
        exit 0
    fi
    if [ $(($i % 5)) -eq 0 ]; then
        echo "   ⏳ $i saniye..."
    fi
done

echo "   ❌ Server 30 saniye içinde başlamadı!"
tail -20 /tmp/nextjs-$PORT.log
exit 1

