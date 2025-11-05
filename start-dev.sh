#!/bin/bash
cd /Users/pc/Desktop/smartflow-crm

echo "🛑 Eski process'leri durduruyorum..."
pkill -9 -f "next" 2>/dev/null
sleep 2

echo "🧹 Cache temizliyorum..."
rm -rf .next

echo "🚀 Dev server'ı başlatıyorum (Port 3002)..."
PORT=3002 npm run dev

