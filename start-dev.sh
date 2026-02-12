#!/bin/bash

# SmartFlow CRM - Development Server Starter
# Bu script Mac Terminal.app'de çalıştırılmalı

cd /Users/pc/Desktop/smartflow-crm

echo "🚀 SmartFlow CRM - Dev Server Başlatılıyor"
echo "=========================================="
echo ""

# Process temizliği
echo "1️⃣  Eski process'ler temizleniyor..."
pkill -9 -f "next dev" 2>/dev/null || true
sleep 1

# Cache temizliği (sadece lock dosyası - cache'i koruyalım - HIZ için önemli!)
echo "2️⃣  Lock dosyası temizleniyor (cache korunuyor)..."
rm -f .next/dev/lock 2>/dev/null || true

# Port kontrolü
PORT=3000
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 kullanımda, 3002'ye geçiliyor..."
    PORT=3002
fi

echo "3️⃣  Port $PORT kullanılıyor"
echo ""
echo "📝 Server başlatılıyor..."
echo "   🌐 URL: http://localhost:$PORT"
echo ""
echo "   ⏳ 'Ready' mesajını bekleyin..."
echo "   📱 Sonra tarayıcıda http://localhost:$PORT açın"
echo ""
echo "   🛑 Durdurmak için: Ctrl+C"
echo ""

# Server'ı başlat (foreground - çıktıyı görmek için)
# PORT environment variable'ı package.json script'ine geçir
if [ "$PORT" = "3002" ]; then
    npm run dev:3002
else
    PORT=$PORT npm run dev:3000
fi
