# Personaplex Production Server
# FastAPI + WebSocket for real-time voice AI

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Optional, List
from dataclasses import dataclass, asdict, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s'
)
logger = logging.getLogger("personaplex")

# ============================================
# CONFIGURATION
# ============================================

class Settings:
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8998"))
    
    # Model
    MODEL_NAME: str = os.getenv("MODEL_NAME", "nvidia/personaplex-7b-v1")
    DEVICE: str = os.getenv("DEVICE", "cuda")
    
    # Security
    API_KEY: str = os.getenv("PERSONAPLEX_API_KEY", "")
    ALLOWED_ORIGINS: List[str] = os.getenv("ALLOWED_ORIGINS", "*").split(",")
    
    # Limits
    MAX_CONCURRENT_SESSIONS: int = int(os.getenv("MAX_SESSIONS", "4"))
    SESSION_TIMEOUT_SEC: int = int(os.getenv("SESSION_TIMEOUT", "300"))
    MAX_AUDIO_CHUNK_SIZE: int = 32000  # ~1 second at 16kHz 16-bit
    
    # HuggingFace
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")

settings = Settings()

# ============================================
# MODELS & SCHEMAS
# ============================================

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    cuda_available: bool
    gpu_name: str | None
    gpu_memory_gb: float | None
    active_sessions: int
    max_sessions: int
    uptime_seconds: float

class InferRequest(BaseModel):
    text: str
    persona: str = "default"
    language: str = "tr"

class InferResponse(BaseModel):
    session_id: str
    intent: str
    confidence: float
    response_text: str
    latency_ms: float

class SessionInfo(BaseModel):
    session_id: str
    persona: str
    created_at: str
    duration_seconds: float
    turn_count: int
    status: str

class TranscriptTurn(BaseModel):
    speaker: str
    text: str
    timestamp: str

# ============================================
# PERSONAS (Turkish CRM)
# ============================================

PERSONAS = {
    "default": {
        "name": "Asistan",
        "system_prompt": """Sen SmartFlow CRM için Türkçe müşteri hizmetleri asistanısın.
Görevlerin:
- Müşterilere nazik ve profesyonel yardım
- Randevu alma/değiştirme/iptal
- Şikayet kayıt ve takip
- Bilgi taleplerine yanıt
Her zaman Türkçe konuş, kısa ve öz cevap ver.""",
        "voice_style": "professional"
    },
    "support": {
        "name": "Teknik Destek",
        "system_prompt": """Sen SmartFlow CRM teknik destek asistanısın.
Teknik sorunları çöz, sabırlı ol, adım adım rehberlik yap.
Karmaşık konuları basit anlat.""",
        "voice_style": "calm"
    },
    "sales": {
        "name": "Satış",
        "system_prompt": """Sen SmartFlow CRM satış asistanısın.
Ürün/hizmet bilgisi ver, ikna edici ol ama baskıcı olma.
Müşterinin ihtiyaçlarını dinle.""",
        "voice_style": "energetic"
    }
}

# ============================================
# SESSION MANAGEMENT
# ============================================

@dataclass
class VoiceSession:
    session_id: str
    persona: str
    created_at: datetime
    transcript: List[Dict] = field(default_factory=list)
    audio_chunks_in: int = 0
    audio_chunks_out: int = 0
    is_active: bool = True
    last_activity: datetime = field(default_factory=datetime.now)

class SessionManager:
    def __init__(self, max_sessions: int):
        self.sessions: Dict[str, VoiceSession] = {}
        self.max_sessions = max_sessions
        self._lock = asyncio.Lock()
    
    async def create(self, persona: str = "default") -> VoiceSession:
        async with self._lock:
            # Check capacity
            active = sum(1 for s in self.sessions.values() if s.is_active)
            if active >= self.max_sessions:
                raise HTTPException(503, "Server at capacity")
            
            session = VoiceSession(
                session_id=str(uuid.uuid4()),
                persona=persona,
                created_at=datetime.now()
            )
            self.sessions[session.session_id] = session
            logger.info(f"Session created: {session.session_id} | persona: {persona}")
            return session
    
    async def get(self, session_id: str) -> Optional[VoiceSession]:
        return self.sessions.get(session_id)
    
    async def end(self, session_id: str) -> Optional[Dict]:
        async with self._lock:
            session = self.sessions.pop(session_id, None)
            if not session:
                return None
            
            session.is_active = False
            duration = (datetime.now() - session.created_at).total_seconds()
            
            summary = {
                "session_id": session_id,
                "persona": session.persona,
                "duration_seconds": duration,
                "turn_count": len(session.transcript),
                "transcript": session.transcript,
                "audio_chunks_in": session.audio_chunks_in,
                "audio_chunks_out": session.audio_chunks_out,
            }
            logger.info(f"Session ended: {session_id} | duration: {duration:.1f}s")
            return summary
    
    async def cleanup_stale(self, timeout_sec: int):
        """Remove sessions inactive for too long"""
        async with self._lock:
            now = datetime.now()
            stale = [
                sid for sid, s in self.sessions.items()
                if (now - s.last_activity).total_seconds() > timeout_sec
            ]
            for sid in stale:
                del self.sessions[sid]
                logger.warning(f"Session timed out: {sid}")
            return len(stale)
    
    @property
    def active_count(self) -> int:
        return sum(1 for s in self.sessions.values() if s.is_active)

# ============================================
# MODEL MANAGER (Placeholder for actual Personaplex)
# ============================================

class ModelManager:
    def __init__(self):
        self.model = None
        self.loaded = False
        self.device = settings.DEVICE
        self.gpu_name = None
        self.gpu_memory_gb = None
    
    async def load(self):
        """Load Personaplex model"""
        logger.info(f"Loading model: {settings.MODEL_NAME}")
        
        try:
            import torch
            if torch.cuda.is_available():
                self.gpu_name = torch.cuda.get_device_name(0)
                self.gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
                logger.info(f"GPU: {self.gpu_name} ({self.gpu_memory_gb:.1f} GB)")
            else:
                logger.warning("CUDA not available!")
                self.device = "cpu"
            
            # TODO: Load actual Personaplex model
            # from personaplex import PersonaplexModel
            # self.model = PersonaplexModel.from_pretrained(
            #     settings.MODEL_NAME,
            #     token=settings.HF_TOKEN,
            #     device=self.device
            # )
            
            self.loaded = True
            logger.info("Model loaded successfully")
            
        except ImportError:
            logger.warning("PyTorch not available - running in mock mode")
            self.loaded = True  # Mock mode
        except Exception as e:
            logger.error(f"Model load failed: {e}")
            raise
    
    async def infer_text(self, text: str, persona: str) -> Dict:
        """Text-based inference for intent detection"""
        start = time.time()
        
        # TODO: Replace with actual model inference
        # For now, simple keyword-based intent detection
        intent = "unknown"
        confidence = 0.5
        response = "Anlıyorum, size nasıl yardımcı olabilirim?"
        
        text_lower = text.lower()
        if any(w in text_lower for w in ["randevu", "görüşme", "tarih", "saat"]):
            intent = "appointment"
            confidence = 0.9
            response = "Randevu talebinizi aldım. Hangi tarih ve saat uygun olur?"
        elif any(w in text_lower for w in ["şikayet", "sorun", "problem", "memnun değil"]):
            intent = "complaint"
            confidence = 0.85
            response = "Yaşadığınız sorunu anlıyorum. Detayları alabilir miyim?"
        elif any(w in text_lower for w in ["bilgi", "fiyat", "nasıl", "nedir"]):
            intent = "info_request"
            confidence = 0.8
            response = "Size bu konuda bilgi verebilirim."
        elif any(w in text_lower for w in ["iptal", "vazgeç", "istemiyorum"]):
            intent = "cancellation"
            confidence = 0.9
            response = "İptal talebinizi not aldım."
        
        latency_ms = (time.time() - start) * 1000
        
        return {
            "intent": intent,
            "confidence": confidence,
            "response_text": response,
            "latency_ms": latency_ms
        }
    
    async def process_audio(self, audio_chunk: bytes, session: VoiceSession) -> Optional[bytes]:
        """Process audio chunk and return response audio"""
        session.audio_chunks_in += 1
        session.last_activity = datetime.now()
        
        # TODO: Implement actual speech-to-speech processing
        # 1. Feed audio to Personaplex
        # 2. Get response audio
        # 3. Update transcript
        
        return None  # No immediate response in full-duplex mode

# ============================================
# FASTAPI APP
# ============================================

session_manager: SessionManager
model_manager: ModelManager
start_time: float

@asynccontextmanager
async def lifespan(app: FastAPI):
    global session_manager, model_manager, start_time
    
    start_time = time.time()
    session_manager = SessionManager(settings.MAX_CONCURRENT_SESSIONS)
    model_manager = ModelManager()
    
    # Load model
    await model_manager.load()
    
    # Start cleanup task
    async def cleanup_loop():
        while True:
            await asyncio.sleep(60)
            await session_manager.cleanup_stale(settings.SESSION_TIMEOUT_SEC)
    
    cleanup_task = asyncio.create_task(cleanup_loop())
    
    logger.info(f"Server ready on {settings.HOST}:{settings.PORT}")
    yield
    
    cleanup_task.cancel()
    logger.info("Server shutdown")

app = FastAPI(
    title="Personaplex Voice AI",
    description="Real-time voice-to-voice AI for SmartFlow CRM",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# AUTH DEPENDENCY
# ============================================

async def verify_api_key(x_api_key: str = Header(None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")
    return True

# ============================================
# ENDPOINTS
# ============================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for load balancers and monitoring"""
    try:
        import torch
        cuda_available = torch.cuda.is_available()
    except ImportError:
        cuda_available = False
    
    return HealthResponse(
        status="healthy" if model_manager.loaded else "loading",
        model_loaded=model_manager.loaded,
        cuda_available=cuda_available,
        gpu_name=model_manager.gpu_name,
        gpu_memory_gb=model_manager.gpu_memory_gb,
        active_sessions=session_manager.active_count,
        max_sessions=settings.MAX_CONCURRENT_SESSIONS,
        uptime_seconds=time.time() - start_time
    )

@app.get("/personas")
async def list_personas():
    """List available voice personas"""
    return {
        "personas": [
            {"id": k, "name": v["name"], "style": v["voice_style"]}
            for k, v in PERSONAS.items()
        ]
    }

@app.post("/infer", response_model=InferResponse, dependencies=[Depends(verify_api_key)])
async def text_inference(request: InferRequest):
    """Text-based inference for intent detection (non-streaming)"""
    if not model_manager.loaded:
        raise HTTPException(503, "Model not ready")
    
    session = await session_manager.create(request.persona)
    
    try:
        result = await model_manager.infer_text(request.text, request.persona)
        
        # Record in transcript
        session.transcript.append({
            "speaker": "user",
            "text": request.text,
            "timestamp": datetime.now().isoformat()
        })
        session.transcript.append({
            "speaker": "assistant",
            "text": result["response_text"],
            "timestamp": datetime.now().isoformat()
        })
        
        return InferResponse(
            session_id=session.session_id,
            intent=result["intent"],
            confidence=result["confidence"],
            response_text=result["response_text"],
            latency_ms=result["latency_ms"]
        )
    finally:
        await session_manager.end(session.session_id)

@app.get("/sessions", dependencies=[Depends(verify_api_key)])
async def list_sessions():
    """List active sessions"""
    sessions = []
    for s in session_manager.sessions.values():
        sessions.append(SessionInfo(
            session_id=s.session_id,
            persona=s.persona,
            created_at=s.created_at.isoformat(),
            duration_seconds=(datetime.now() - s.created_at).total_seconds(),
            turn_count=len(s.transcript),
            status="active" if s.is_active else "ended"
        ))
    return {"sessions": sessions}

@app.delete("/sessions/{session_id}", dependencies=[Depends(verify_api_key)])
async def end_session(session_id: str):
    """End a specific session"""
    summary = await session_manager.end(session_id)
    if not summary:
        raise HTTPException(404, "Session not found")
    return summary

# ============================================
# WEBSOCKET ENDPOINT
# ============================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time voice streaming"""
    await websocket.accept()
    
    session = None
    
    try:
        # Wait for initial config message
        config_data = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        
        # Verify API key if required
        if settings.API_KEY:
            if config_data.get("api_key") != settings.API_KEY:
                await websocket.send_json({"error": "Invalid API key"})
                await websocket.close(code=4001)
                return
        
        # Create session
        persona = config_data.get("persona", "default")
        session = await session_manager.create(persona)
        
        await websocket.send_json({
            "type": "session_started",
            "session_id": session.session_id,
            "persona": session.persona,
            "sample_rate": 24000,
            "encoding": "pcm_s16le"
        })
        
        # Main loop
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=settings.SESSION_TIMEOUT_SEC
                )
                
                if message["type"] == "websocket.receive":
                    if "bytes" in message:
                        # Audio data
                        audio_chunk = message["bytes"]
                        if len(audio_chunk) > settings.MAX_AUDIO_CHUNK_SIZE:
                            continue  # Skip oversized chunks
                        
                        response_audio = await model_manager.process_audio(audio_chunk, session)
                        if response_audio:
                            await websocket.send_bytes(response_audio)
                            session.audio_chunks_out += 1
                    
                    elif "text" in message:
                        # Control message
                        data = json.loads(message["text"])
                        action = data.get("action")
                        
                        if action == "transcript":
                            session.transcript.append({
                                "speaker": data.get("speaker", "user"),
                                "text": data.get("text", ""),
                                "timestamp": datetime.now().isoformat()
                            })
                            await websocket.send_json({"type": "transcript_ack"})
                        
                        elif action == "end":
                            break
                
                elif message["type"] == "websocket.disconnect":
                    break
                    
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "timeout_warning"})
                break
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session.session_id if session else 'unknown'}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        if session:
            summary = await session_manager.end(session.session_id)
            try:
                await websocket.send_json({
                    "type": "session_ended",
                    "summary": summary
                })
            except:
                pass

# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level="info"
    )
