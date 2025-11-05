#!/bin/bash

# Çalışma dizinine git
cd "$(dirname "$0")"

# Eğer port 3000 doluysa, o süreci öldür
if lsof -i :3000 >/dev/null 2>&1; then
  echo "⚠️ Port 3000 already in use. Killing existing process..."
  kill -9 $(lsof -ti :3000)
  sleep 1
fi

# Mac terminalini aç ve npm run dev komutunu çalıştır
echo "🚀 Starting local server in your system terminal..."
osascript <<SCRIPT
tell application "Terminal"
    activate
    do script "cd $(pwd) && npm run dev"
end tell
SCRIPT

