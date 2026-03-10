#!/bin/bash
# Callception - Module Error Fix Script
# Next.js module bulunamama hatasını düzeltir

cd /Users/pc/Desktop/callception

echo "🔧 Next.js Module Hatası Düzeltiliyor..."
echo "========================================"
echo ""

# 1. Eski process'leri durdur
echo "1️⃣  Eski process'ler temizleniyor..."
pkill -9 -f "next dev" 2>/dev/null || true
sleep 2

# 2. Kapsamlı cache temizliği
echo "2️⃣  Cache temizleniyor..."
rm -rf .next 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .turbo 2>/dev/null || true
rm -f .next/dev/lock 2>/dev/null || true

# 3. Next.js cache'ini temizle
echo "3️⃣  Next.js internal cache temizleniyor..."
rm -rf node_modules/next/dist 2>/dev/null || true

# 4. .next dizinini yeniden oluştur
echo "4️⃣  .next dizini oluşturuluyor..."
mkdir -p .next/dev/server
mkdir -p .next/dev/static
mkdir -p .next/dev/cache
chmod -R 755 .next 2>/dev/null || true

echo "✅ Temizlik tamamlandı!"
echo ""
echo "📦 Eğer hata devam ederse, node_modules'i yeniden kurun:"
echo "   npm install"
echo ""
echo "🚀 Server'ı başlatın:"
echo "   npm run dev"
echo ""

