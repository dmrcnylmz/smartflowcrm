# Context Injection Sidecar API
# Runs alongside native Moshi server on port 8999
# Receives webhooks from n8n and provides context to voice sessions

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

# ============================================
# LOGGING
# ============================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s'
)
logger = logging.getLogger("context-api")

# ============================================
# CONFIGURATION
# ============================================

class ContextSettings:
    PORT: int = int(os.getenv("CONTEXT_API_PORT", "8999"))
    HOST: str = os.getenv("CONTEXT_API_HOST", "0.0.0.0")
    API_KEY: str = os.getenv("PERSONAPLEX_API_KEY", "")
    CONTEXT_TTL_SEC: int = int(os.getenv("CONTEXT_TTL_SEC", "1800"))  # 30 min
    N8N_WEBHOOK_URL: str = os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678")
    N8N_CALLBACK_PATH: str = os.getenv("N8N_CALLBACK_PATH", "/webhook/call-ended")
    MOSHI_URL: str = os.getenv("MOSHI_URL", "http://localhost:8998")

settings = ContextSettings()

# ============================================
# SCHEMAS
# ============================================

class ContextPayload(BaseModel):
    """Incoming context from n8n webhooks"""
    session_id: str
    type: str = Field(..., description="Context type: invoice, appointment, customer_history, custom")
    data: Dict[str, Any] = Field(default_factory=dict)
    priority: str = Field(default="normal", description="normal, high, urgent")
    ttl_seconds: Optional[int] = None  # Override default TTL
    source: str = Field(default="n8n", description="Source system identifier")

class EventPayload(BaseModel):
    """Call lifecycle events"""
    session_id: str
    event: str = Field(..., description="call_start, call_end, transfer, hold")
    data: Optional[Dict[str, Any]] = None
    customer_phone: Optional[str] = None
    customer_name: Optional[str] = None
    agent_id: Optional[str] = None

class CallbackPayload(BaseModel):
    """Sent back to n8n when a call ends"""
    session_id: str
    event: str
    duration_seconds: float
    transcript: List[Dict[str, str]]
    intent_summary: str
    context_used: List[str]
    customer_phone: Optional[str] = None
    customer_name: Optional[str] = None
    timestamp: str

class ContextQuery(BaseModel):
    """Query for context lookup"""
    types: Optional[List[str]] = None  # Filter by context type
    include_expired: bool = False

# ============================================
# IN-MEMORY CONTEXT STORE
# ============================================

class ContextEntry:
    def __init__(self, payload: ContextPayload, ttl: int):
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
    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > self.ttl
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "data": self.data,
            "priority": self.priority,
            "source": self.source,
            "created_at": datetime.fromtimestamp(self.created_at).isoformat(),
            "ttl_remaining": max(0, self.ttl - (time.time() - self.created_at)),
            "accessed_count": self.accessed_count,
        }


class ContextStore:
    """Thread-safe in-memory context store with TTL"""
    
    def __init__(self):
        self._store: Dict[str, List[ContextEntry]] = {}
        self._events: Dict[str, List[Dict]] = {}
        self._lock = asyncio.Lock()
    
    async def add_context(self, payload: ContextPayload, default_ttl: int) -> ContextEntry:
        async with self._lock:
            ttl = payload.ttl_seconds or default_ttl
            entry = ContextEntry(payload, ttl)
            
            if payload.session_id not in self._store:
                self._store[payload.session_id] = []
            
            self._store[payload.session_id].append(entry)
            logger.info(
                f"Context added: session={payload.session_id} "
                f"type={payload.type} priority={payload.priority}"
            )
            return entry
    
    async def get_context(
        self, 
        session_id: str, 
        types: Optional[List[str]] = None,
        include_expired: bool = False
    ) -> List[Dict]:
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
            
            # Sort by priority (urgent > high > normal)
            priority_order = {"urgent": 0, "high": 1, "normal": 2}
            result.sort(key=lambda x: priority_order.get(x["priority"], 2))
            
            return result
    
    async def delete_context(self, session_id: str) -> int:
        async with self._lock:
            entries = self._store.pop(session_id, [])
            self._events.pop(session_id, None)
            return len(entries)
    
    async def add_event(self, payload: EventPayload):
        async with self._lock:
            if payload.session_id not in self._events:
                self._events[payload.session_id] = []
            
            self._events[payload.session_id].append({
                "event": payload.event,
                "timestamp": datetime.now().isoformat(),
                "data": payload.data or {},
                "customer_phone": payload.customer_phone,
                "customer_name": payload.customer_name,
                "agent_id": payload.agent_id,
            })
            logger.info(f"Event recorded: session={payload.session_id} event={payload.event}")
    
    async def get_events(self, session_id: str) -> List[Dict]:
        async with self._lock:
            return self._events.get(session_id, [])
    
    async def get_context_types_used(self, session_id: str) -> List[str]:
        """Return list of context types that were accessed at least once"""
        async with self._lock:
            entries = self._store.get(session_id, [])
            return list(set(e.type for e in entries if e.accessed_count > 0))
    
    async def cleanup_expired(self) -> int:
        async with self._lock:
            cleaned = 0
            empty_sessions = []
            
            for session_id, entries in self._store.items():
                before = len(entries)
                self._store[session_id] = [e for e in entries if not e.is_expired]
                cleaned += before - len(self._store[session_id])
                
                if not self._store[session_id]:
                    empty_sessions.append(session_id)
            
            for sid in empty_sessions:
                del self._store[sid]
            
            if cleaned > 0:
                logger.info(f"Cleaned {cleaned} expired context entries")
            return cleaned
    
    @property
    def stats(self) -> Dict:
        total_entries = sum(len(v) for v in self._store.values())
        return {
            "active_sessions": len(self._store),
            "total_entries": total_entries,
            "total_events": sum(len(v) for v in self._events.values()),
        }

# ============================================
# N8N CALLBACK CLIENT
# ============================================

async def send_n8n_callback(callback: CallbackPayload):
    """Send call summary back to n8n"""
    if not settings.N8N_WEBHOOK_URL:
        logger.warning("N8N_WEBHOOK_URL not configured, skipping callback")
        return
    
    callback_url = f"{settings.N8N_WEBHOOK_URL.rstrip('/')}{settings.N8N_CALLBACK_PATH}"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                callback_url,
                json=callback.model_dump(),
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            logger.info(f"n8n callback sent: session={callback.session_id} event={callback.event}")
    except Exception as e:
        logger.error(f"n8n callback failed: {e}")

# ============================================
# FASTAPI APP
# ============================================

store: ContextStore
start_time: float

@asynccontextmanager
async def lifespan(app: FastAPI):
    global store, start_time
    
    store = ContextStore()
    start_time = time.time()
    
    # Background cleanup task
    async def cleanup_loop():
        while True:
            await asyncio.sleep(60)
            await store.cleanup_expired()
    
    cleanup_task = asyncio.create_task(cleanup_loop())
    logger.info(f"Context API ready on {settings.HOST}:{settings.PORT}")
    yield
    cleanup_task.cancel()

app = FastAPI(
    title="Context Injection API",
    description="Sidecar API for injecting n8n context into live Personaplex voice sessions",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# AUTH
# ============================================

async def verify_key(x_api_key: str = Header(None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")
    return True

# ============================================
# ENDPOINTS
# ============================================

@app.get("/health")
async def health():
    """Health check for monitoring"""
    return {
        "status": "healthy",
        "service": "context-api",
        "uptime_seconds": round(time.time() - start_time, 1),
        "n8n_configured": bool(settings.N8N_WEBHOOK_URL),
        "moshi_url": settings.MOSHI_URL,
        **store.stats,
    }


@app.post("/webhook/context")
async def receive_context(payload: ContextPayload):
    """
    Receive context data from n8n.
    
    n8n sends customer data (invoice, appointment, history)
    keyed to an active voice session.
    
    Example n8n payload:
    {
        "session_id": "abc-123",
        "type": "invoice",
        "data": {
            "customer_name": "Ahmet Yılmaz",
            "amount": "1240.00",
            "currency": "TRY",
            "due_date": "2026-02-15",
            "status": "unpaid"
        },
        "priority": "high"
    }
    """
    entry = await store.add_context(payload, settings.CONTEXT_TTL_SEC)
    return {
        "status": "accepted",
        "context_id": entry.id,
        "session_id": payload.session_id,
        "type": payload.type,
        "ttl_remaining": entry.ttl,
    }


@app.post("/webhook/event")
async def receive_event(payload: EventPayload, background_tasks: BackgroundTasks):
    """
    Receive call lifecycle events.
    
    When event is 'call_end', triggers n8n callback with 
    transcript summary and context usage data.
    """
    await store.add_event(payload)
    
    # On call end, send callback to n8n
    if payload.event == "call_end":
        events = await store.get_events(payload.session_id)
        context_types = await store.get_context_types_used(payload.session_id)
        
        # Calculate duration from first event
        start_event = next((e for e in events if e["event"] == "call_start"), None)
        duration = 0.0
        if start_event:
            try:
                start_dt = datetime.fromisoformat(start_event["timestamp"])
                duration = (datetime.now() - start_dt).total_seconds()
            except (ValueError, KeyError):
                pass
        
        callback = CallbackPayload(
            session_id=payload.session_id,
            event="call_ended",
            duration_seconds=duration,
            transcript=payload.data.get("transcript", []) if payload.data else [],
            intent_summary=payload.data.get("intent_summary", "") if payload.data else "",
            context_used=context_types,
            customer_phone=payload.customer_phone,
            customer_name=payload.customer_name,
            timestamp=datetime.now().isoformat(),
        )
        
        background_tasks.add_task(send_n8n_callback, callback)
        
        # Cleanup session context after a delay
        async def delayed_cleanup():
            await asyncio.sleep(30)  # Keep for 30s for any late queries
            await store.delete_context(payload.session_id)
        
        background_tasks.add_task(delayed_cleanup)
    
    return {
        "status": "recorded",
        "session_id": payload.session_id,
        "event": payload.event,
    }


@app.get("/context/{session_id}")
async def get_context(
    session_id: str, 
    types: Optional[str] = None,
    include_expired: bool = False,
):
    """
    Retrieve context for a voice session.
    
    Called by Moshi server or Next.js proxy before/during a call
    to get injected context (invoice data, appointment info, etc.)
    
    Query params:
    - types: comma-separated context types to filter (e.g. "invoice,appointment")
    - include_expired: include expired context entries
    """
    type_list = types.split(",") if types else None
    contexts = await store.get_context(session_id, type_list, include_expired)
    
    # Build a merged context summary for easy consumption
    summary = {}
    for ctx in contexts:
        summary[ctx["type"]] = ctx["data"]
    
    return {
        "session_id": session_id,
        "context_count": len(contexts),
        "contexts": contexts,
        "merged": summary,  # Flat dict: {"invoice": {...}, "appointment": {...}}
    }


@app.delete("/context/{session_id}")
async def delete_context(session_id: str):
    """Clear all context for a session"""
    count = await store.delete_context(session_id)
    return {
        "session_id": session_id,
        "deleted_entries": count,
    }


@app.get("/sessions")
async def list_sessions():
    """List all active context sessions"""
    return {
        "stats": store.stats,
    }


# ============================================
# BULK CONTEXT INJECTION
# ============================================

class BulkContextPayload(BaseModel):
    """Inject multiple context items in one call"""
    session_id: str
    items: List[Dict[str, Any]] = Field(
        ..., 
        description="List of {type, data, priority} objects"
    )

@app.post("/webhook/context/bulk")
async def receive_bulk_context(payload: BulkContextPayload):
    """
    Bulk inject multiple context items for a session.
    
    Useful when n8n has gathered multiple pieces of information
    (e.g. customer profile + open invoices + appointments).
    """
    results = []
    for item in payload.items:
        ctx = ContextPayload(
            session_id=payload.session_id,
            type=item.get("type", "custom"),
            data=item.get("data", {}),
            priority=item.get("priority", "normal"),
            source=item.get("source", "n8n"),
        )
        entry = await store.add_context(ctx, settings.CONTEXT_TTL_SEC)
        results.append({"context_id": entry.id, "type": ctx.type})
    
    return {
        "status": "accepted",
        "session_id": payload.session_id,
        "injected_count": len(results),
        "items": results,
    }


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    uvicorn.run(
        "context_api:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level="info",
    )
