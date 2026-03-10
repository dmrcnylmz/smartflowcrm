#!/bin/bash
# ============================================
# Callception — RunPod Full Setup Script v2
# /workspace altına kurulum yapar (kalıcı)
# Web Terminal'e yapıştırıp çalıştırın
# ============================================
set -e

WORK="/workspace/callception"

echo "╔══════════════════════════════════════════╗"
echo "║  Callception — RunPod Setup v2         ║"
echo "║  Kalıcı kurulum: /workspace/callception     ║"
echo "╚══════════════════════════════════════════╝"

# ============================================
# 1. Dizin Yapısı
# ============================================
echo ""
echo "▶ [1/6] Dizin yapısı oluşturuluyor..."
mkdir -p $WORK/{n8n-data,logs}
echo "✅ $WORK dizini hazır"

# ============================================
# 2. Node.js 20+ Kurulumu
# ============================================
echo ""
echo "▶ [2/6] Node.js kontrol ediliyor..."

if ! command -v node &>/dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"
echo "✅ Node.js hazır"

# ============================================
# 3. n8n Kurulumu
# ============================================
echo ""
echo "▶ [3/6] n8n kuruluyor..."

npm install -g n8n 2>/dev/null || true
echo "✅ n8n kuruldu"

# ============================================
# 4. Python Bağımlılıkları
# ============================================
echo ""
echo "▶ [4/6] Python bağımlılıkları kuruluyor..."

pip install fastapi uvicorn httpx pydantic 2>/dev/null || pip3 install fastapi uvicorn httpx pydantic
echo "✅ Python paketleri hazır"

# ============================================
# 5. Context API Dosyası
# ============================================
echo ""
echo "▶ [5/6] Context API oluşturuluyor..."

cat > $WORK/context_api.py << 'CONTEXT_API_EOF'
import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(name)s | %(message)s')
logger = logging.getLogger("context-api")

class ContextSettings:
    PORT: int = int(os.getenv("CONTEXT_API_PORT", "8999"))
    HOST: str = os.getenv("CONTEXT_API_HOST", "0.0.0.0")
    API_KEY: str = os.getenv("PERSONAPLEX_API_KEY", "")
    CONTEXT_TTL_SEC: int = int(os.getenv("CONTEXT_TTL_SEC", "1800"))
    N8N_WEBHOOK_URL: str = os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678")
    N8N_CALLBACK_PATH: str = os.getenv("N8N_CALLBACK_PATH", "/webhook/call-ended")
    MOSHI_URL: str = os.getenv("MOSHI_URL", "http://localhost:8998")

settings = ContextSettings()

class ContextPayload(BaseModel):
    session_id: str
    type: str
    data: Dict[str, Any] = Field(default_factory=dict)
    priority: str = Field(default="normal")
    ttl_seconds: Optional[int] = None
    source: str = Field(default="n8n")

class EventPayload(BaseModel):
    session_id: str
    event: str
    data: Optional[Dict[str, Any]] = None
    customer_phone: Optional[str] = None
    customer_name: Optional[str] = None
    agent_id: Optional[str] = None

class CallbackPayload(BaseModel):
    session_id: str
    event: str
    duration_seconds: float
    transcript: List[Dict[str, str]]
    intent_summary: str
    context_used: List[str]
    customer_phone: Optional[str] = None
    customer_name: Optional[str] = None
    timestamp: str

class ContextEntry:
    def __init__(self, payload, ttl):
        self.id = str(uuid.uuid4())
        self.session_id = payload.session_id
        self.type = payload.type
        self.data = payload.data
        self.priority = payload.priority
        self.source = payload.source
        self.created_at = time.time()
        self.ttl = ttl
        self.accessed_count = 0

    @property
    def is_expired(self):
        return (time.time() - self.created_at) > self.ttl

    def to_dict(self):
        return {
            "id": self.id, "type": self.type, "data": self.data,
            "priority": self.priority, "source": self.source,
            "created_at": datetime.fromtimestamp(self.created_at).isoformat(),
            "ttl_remaining": max(0, self.ttl - (time.time() - self.created_at)),
            "accessed_count": self.accessed_count,
        }

class ContextStore:
    def __init__(self):
        self._store: Dict[str, List[ContextEntry]] = {}
        self._events: Dict[str, List[Dict]] = {}
        self._lock = asyncio.Lock()

    async def add_context(self, payload, default_ttl):
        async with self._lock:
            ttl = payload.ttl_seconds or default_ttl
            entry = ContextEntry(payload, ttl)
            if payload.session_id not in self._store:
                self._store[payload.session_id] = []
            self._store[payload.session_id].append(entry)
            logger.info(f"Context added: session={payload.session_id} type={payload.type}")
            return entry

    async def get_context(self, session_id, types=None, include_expired=False):
        async with self._lock:
            entries = self._store.get(session_id, [])
            result = []
            for entry in entries:
                if not include_expired and entry.is_expired:
                    continue
                if types and entry.type not in types:
                    continue
                entry.accessed_count += 1
                result.append(entry.to_dict())
            priority_order = {"urgent": 0, "high": 1, "normal": 2}
            result.sort(key=lambda x: priority_order.get(x["priority"], 2))
            return result

    async def delete_context(self, session_id):
        async with self._lock:
            entries = self._store.pop(session_id, [])
            self._events.pop(session_id, None)
            return len(entries)

    async def add_event(self, payload):
        async with self._lock:
            if payload.session_id not in self._events:
                self._events[payload.session_id] = []
            self._events[payload.session_id].append({
                "event": payload.event, "timestamp": datetime.now().isoformat(),
                "data": payload.data or {},
                "customer_phone": payload.customer_phone,
                "customer_name": payload.customer_name,
            })
            logger.info(f"Event: session={payload.session_id} event={payload.event}")

    async def get_events(self, session_id):
        async with self._lock:
            return self._events.get(session_id, [])

    async def get_context_types_used(self, session_id):
        async with self._lock:
            entries = self._store.get(session_id, [])
            return list(set(e.type for e in entries if e.accessed_count > 0))

    async def cleanup_expired(self):
        async with self._lock:
            cleaned = 0
            empty = []
            for sid, entries in self._store.items():
                before = len(entries)
                self._store[sid] = [e for e in entries if not e.is_expired]
                cleaned += before - len(self._store[sid])
                if not self._store[sid]:
                    empty.append(sid)
            for sid in empty:
                del self._store[sid]
            if cleaned:
                logger.info(f"Cleaned {cleaned} expired entries")
            return cleaned

    @property
    def stats(self):
        return {
            "active_sessions": len(self._store),
            "total_entries": sum(len(v) for v in self._store.values()),
            "total_events": sum(len(v) for v in self._events.values()),
        }

async def send_n8n_callback(callback):
    if not settings.N8N_WEBHOOK_URL:
        return
    url = f"{settings.N8N_WEBHOOK_URL.rstrip('/')}{settings.N8N_CALLBACK_PATH}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(url, json=callback.model_dump(), headers={"Content-Type": "application/json"})
            logger.info(f"n8n callback sent: session={callback.session_id}")
    except Exception as e:
        logger.error(f"n8n callback failed: {e}")

store: ContextStore
start_time: float

@asynccontextmanager
async def lifespan(app):
    global store, start_time
    store = ContextStore()
    start_time = time.time()
    async def cleanup_loop():
        while True:
            await asyncio.sleep(60)
            await store.cleanup_expired()
    task = asyncio.create_task(cleanup_loop())
    logger.info(f"Context API ready on {settings.HOST}:{settings.PORT}")
    yield
    task.cancel()

app = FastAPI(title="Context Injection API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "context-api", "uptime_seconds": round(time.time() - start_time, 1),
            "n8n_configured": bool(settings.N8N_WEBHOOK_URL), "moshi_url": settings.MOSHI_URL, **store.stats}

@app.post("/webhook/context")
async def receive_context(payload: ContextPayload):
    entry = await store.add_context(payload, settings.CONTEXT_TTL_SEC)
    return {"status": "accepted", "context_id": entry.id, "session_id": payload.session_id, "type": payload.type}

@app.post("/webhook/event")
async def receive_event(payload: EventPayload, bg: BackgroundTasks):
    await store.add_event(payload)
    if payload.event == "call_end":
        events = await store.get_events(payload.session_id)
        types = await store.get_context_types_used(payload.session_id)
        start_ev = next((e for e in events if e["event"] == "call_start"), None)
        dur = 0.0
        if start_ev:
            try:
                dur = (datetime.now() - datetime.fromisoformat(start_ev["timestamp"])).total_seconds()
            except:
                pass
        cb = CallbackPayload(session_id=payload.session_id, event="call_ended", duration_seconds=dur,
            transcript=payload.data.get("transcript", []) if payload.data else [],
            intent_summary=payload.data.get("intent_summary", "") if payload.data else "",
            context_used=types, customer_phone=payload.customer_phone, customer_name=payload.customer_name,
            timestamp=datetime.now().isoformat())
        bg.add_task(send_n8n_callback, cb)
        async def delayed_cleanup():
            await asyncio.sleep(30)
            await store.delete_context(payload.session_id)
        bg.add_task(delayed_cleanup)
    return {"status": "recorded", "session_id": payload.session_id, "event": payload.event}

@app.get("/context/{session_id}")
async def get_context(session_id: str, types: Optional[str] = None, include_expired: bool = False):
    type_list = types.split(",") if types else None
    contexts = await store.get_context(session_id, type_list, include_expired)
    summary = {}
    for ctx in contexts:
        summary[ctx["type"]] = ctx["data"]
    return {"session_id": session_id, "context_count": len(contexts), "contexts": contexts, "merged": summary}

@app.delete("/context/{session_id}")
async def delete_context(session_id: str):
    count = await store.delete_context(session_id)
    return {"session_id": session_id, "deleted_entries": count}

@app.get("/sessions")
async def list_sessions():
    return {"stats": store.stats}

class BulkContextPayload(BaseModel):
    session_id: str
    items: List[Dict[str, Any]]

@app.post("/webhook/context/bulk")
async def receive_bulk(payload: BulkContextPayload):
    results = []
    for item in payload.items:
        ctx = ContextPayload(session_id=payload.session_id, type=item.get("type", "custom"),
            data=item.get("data", {}), priority=item.get("priority", "normal"), source=item.get("source", "n8n"))
        entry = await store.add_context(ctx, settings.CONTEXT_TTL_SEC)
        results.append({"context_id": entry.id, "type": ctx.type})
    return {"status": "accepted", "session_id": payload.session_id, "injected_count": len(results), "items": results}

if __name__ == "__main__":
    uvicorn.run("context_api:app", host=settings.HOST, port=settings.PORT, reload=False, log_level="info")
CONTEXT_API_EOF

echo "✅ Context API dosyası oluşturuldu: $WORK/context_api.py"

# ============================================
# 6. Başlatma Scripti (persist across restarts)
# ============================================
echo ""
echo "▶ [6/6] Başlatma scripti oluşturuluyor..."

cat > $WORK/start-services.sh << 'START_EOF'
#!/bin/bash
# Callception servislerini başlat
# Pod restart sonrası: bash /workspace/callception/start-services.sh

WORK="/workspace/callception"
echo "🚀 Callception servisleri başlatılıyor..."

# n8n
export N8N_HOST=0.0.0.0
export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_USER_FOLDER=$WORK/n8n-data
export WEBHOOK_URL=https://$(hostname)-5678.proxy.runpod.net/
nohup n8n start > $WORK/logs/n8n.log 2>&1 &
echo "  n8n PID: $! (port 5678)"

sleep 3

# Context API
cd $WORK
nohup python context_api.py > $WORK/logs/context_api.log 2>&1 &
echo "  Context API PID: $! (port 8999)"

sleep 2

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SERVİSLER BAŞLATILDI                    ║"
echo "╠══════════════════════════════════════════╣"
echo "║  n8n       → :5678                       ║"
echo "║  Context   → :8999                       ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Loglar:                                  ║"
echo "║  tail -f $WORK/logs/n8n.log              ║"
echo "║  tail -f $WORK/logs/context_api.log      ║"
echo "╚══════════════════════════════════════════╝"

# Health checks
echo ""
echo "Health Checks:"
sleep 2
curl -s http://localhost:5678/ > /dev/null 2>&1 && echo "  n8n      : ✅ OK" || echo "  n8n      : ⏳ Starting..."
curl -s http://localhost:8999/health > /dev/null 2>&1 && echo "  Context  : ✅ OK" || echo "  Context  : ⏳ Starting..."
START_EOF

chmod +x $WORK/start-services.sh

echo "✅ Başlatma scripti hazır: $WORK/start-services.sh"

# ============================================
# Servisleri Başlat
# ============================================
echo ""
echo "▶ Servisler başlatılıyor..."
bash $WORK/start-services.sh

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  KURULUM TAMAMLANDI ✅                           ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Pod restart sonrası tek komut:                  ║"
echo "║  bash /workspace/callception/start-services.sh     ║"
echo "║                                                  ║"
echo "║  Tüm veriler /workspace altında kalıcı!          ║"
echo "╚══════════════════════════════════════════════════╝"
