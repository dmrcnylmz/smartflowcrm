#!/bin/bash
# SmartFlow CRM - Background Dev Server Başlatma
# Bu script dev server'ı background'da başlatır

cd /Users/pc/Desktop/smartflow-crm

echo "🚀 SmartFlow CRM - Background Dev Server Başlatılıyor"
echo "=================================================="

# 1. Eski process'leri durdur
echo "1️⃣  Eski process'ler temizleniyor..."
pkill -9 -f "next dev" 2>/dev/null || true
sleep 2

# 2. Cache temizliği
echo "2️⃣  Cache temizleniyor..."
rm -rf .next 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
rm -f .next/dev/lock 2>/dev/null || true
rm -rf .turbo 2>/dev/null || true

# .next dizinini oluştur
mkdir -p .next/dev/server
mkdir -p .next/dev/static
mkdir -p .next/dev/cache
chmod -R 755 .next 2>/dev/null || true

echo "   ✅ Tüm cache temizlendi"
echo ""

# 3. Port kontrolü
PORT=3000
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "⚠️  Port $PORT kullanımda, 3002'ye geçiliyor..."
    PORT=3002
fi

echo "3️⃣  Port $PORT kullanılıyor"
echo ""

# 4. Server'ı background'da başlat
echo "📝 Server başlatılıyor (background)..."
echo "   🌐 URL: http://localhost:$PORT"
echo "   📋 Log: /tmp/smartflow-dev.log"
echo ""

# Log dosyasına yönlendir ve background'da çalıştır
if [ "$PORT" = "3002" ]; then
    npm run dev:3002 > /tmp/smartflow-dev.log 2>&1 &
else
    npm run dev:3000 > /tmp/smartflow-dev.log 2>&1 &
fi

# PID'yi kaydet
DEV_PID=$!
echo $DEV_PID > /tmp/smartflow-dev.pid

echo "✅ Server başlatıldı! (PID: $DEV_PID)"
echo ""
echo "📊 Kontrol komutları:"
echo "   • Log izle: tail -f /tmp/smartflow-dev.log"
echo "   • Durum kontrol: lsof -ti:$PORT"
echo "   • Durdur: pkill -f 'next dev'"
echo ""
echo "🌐 Tarayıcı açmak için: ./open-ui.sh"
echo ""

