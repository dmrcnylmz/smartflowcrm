#!/bin/bash

# SmartFlow CRM - Dev Server (Cursor İçinde Çalıştırma)
# Bu script output'u terminal'de gösterir

cd /Users/pc/Desktop/smartflow-crm

echo "🚀 SmartFlow CRM Server Başlatılıyor..."
echo "======================================="
echo ""
echo "📍 Port: 3002"
echo "🌐 URL: http://localhost:3002"
echo ""
echo "⏱️  Compile süresi (ilk çalıştırma): 5-15 saniye"
echo "⏱️  Sonraki başlatmalar: 2-3 saniye"
echo ""
echo "🛑 Durdurmak için: Ctrl+C"
echo ""
echo "───────────────────────────────────────"
echo ""

# Process temizliği
pkill -9 -f "next dev" 2>/dev/null
sleep 1

# Lock dosyası temizle
rm -f .next/dev/lock 2>/dev/null

# Server'ı başlat - OUTPUT GÖRÜNÜR
exec npx next dev -p 3002


