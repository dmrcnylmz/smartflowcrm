#!/bin/bash

# Callception - UI Açma Script'i
# Tek komutla server başlat ve UI'ı aç

cd /Users/pc/Desktop/callception

PORT=3002

# Eğer server zaten çalışıyorsa sadece tarayıcıyı aç
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Server zaten çalışıyor!"
    echo "🌐 Tarayıcı açılıyor..."
    open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null
    echo "📍 http://localhost:$PORT"
    exit 0
fi

# Server yoksa başlat
echo "🚀 Server başlatılıyor..."
./fast-dev.sh

