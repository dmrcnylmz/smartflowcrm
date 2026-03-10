#!/bin/bash

# Callception - Ultra Hızlı Dev Server
# Turbopack + Optimizasyonlar + Otomatik Port Yönetimi

cd /Users/pc/Desktop/callception

echo "⚡ Callception - ULTRA HIZLI Başlatılıyor..."
echo ""

# Port belirleme (3002 öncelikli, yoksa boş port bul)
PORT=3002

# Port kontrolü - eğer doluysa temizle
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port $PORT kullanımda, temizleniyor..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Process temizliği (hızlı)
pkill -9 -f "next dev" 2>/dev/null || true
sleep 0.5

# Sadece lock dosyasını temizle (cache'i MUTLAKA koru!)
rm -f .next/dev/lock 2>/dev/null

# .next cache klasörünü oluştur (ilk çalıştırmada hız için)
mkdir -p .next/cache 2>/dev/null

echo "🚀 Server başlatılıyor (Turbopack + Cache modunda)..."
echo "   📍 http://localhost:$PORT"
echo "   ⚡ Google Fonts cache aktif"
echo "   ⚡ TypeScript incremental build aktif"
echo "   🌐 UI otomatik açılacak..."
echo ""

# Server'ı arka planda başlat
NODE_ENV=development \
NODE_OPTIONS="--max-old-space-size=4096" \
NEXT_TELEMETRY_DISABLED=1 \
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
        echo "📋 Logları görmek için: tail -f /tmp/nextjs-$PORT.log"
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
echo "   📋 Loglar:"
tail -20 /tmp/nextjs-$PORT.log
exit 1


