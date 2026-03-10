"""
Callception — RunPod Serverless Handler for Personaplex GPU
============================================================
Wraps the existing FastAPI server for RunPod Serverless execution.
Model is loaded once on cold start, then reused for all requests.

RunPod Serverless workflow:
  1. Cold start → load model → ready
  2. POST /run → handler(event) → return result
  3. Idle timeout → scale to zero

Deploy:
  docker build -f infrastructure/runpod/Dockerfile.serverless -t callception-personaplex .
  docker push YOUR_REGISTRY/callception-personaplex:latest
  # Create RunPod Serverless endpoint with this image
"""

import asyncio
import os
import sys
import time
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s'
)
logger = logging.getLogger("personaplex-serverless")

# Add personaplex_server to path
sys.path.insert(0, '/app')

# Initialize event loop for async operations
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# ============================================
# Model Loading (happens once on cold start)
# ============================================

model_manager = None
settings = None

def init_model():
    """Load the model on cold start. This runs once when the container starts."""
    global model_manager, settings

    logger.info("Cold start: Initializing Personaplex model...")
    start = time.time()

    try:
        from server import Settings, ModelManager
        settings = Settings()

        model_manager = ModelManager(settings)
        loop.run_until_complete(model_manager.load())

        elapsed = time.time() - start
        logger.info(f"Model loaded in {elapsed:.1f}s (device={settings.DEVICE})")
    except Exception as e:
        logger.error(f"Model loading failed: {e}")
        model_manager = None

# Load on import (cold start)
init_model()


# ============================================
# RunPod Handler
# ============================================

def handler(event):
    """
    RunPod Serverless handler.

    Actions:
      - health_check: Return model/GPU status
      - infer: Run text inference (intent detection + response)

    Input format:
      {
        "input": {
          "action": "infer",
          "text": "Randevu almak istiyorum",
          "persona": "default",
          "language": "tr",
          "session_id": "optional-id"
        }
      }
    """
    input_data = event.get("input", {})
    action = input_data.get("action", "infer")

    # ---- Health Check ----
    if action == "health_check":
        if model_manager is None:
            return {
                "status": "error",
                "model_loaded": False,
                "error": "Model failed to load on cold start"
            }

        return {
            "status": "healthy",
            "model_loaded": model_manager.loaded if hasattr(model_manager, 'loaded') else True,
            "gpu_name": model_manager.gpu_name if hasattr(model_manager, 'gpu_name') else "unknown",
            "gpu_memory_gb": model_manager.gpu_memory_gb if hasattr(model_manager, 'gpu_memory_gb') else 0,
            "device": settings.DEVICE if settings else "unknown",
        }

    # ---- Inference ----
    if action == "infer":
        if model_manager is None:
            return {
                "error": "Model not loaded",
                "status": "error"
            }

        text = input_data.get("text", "")
        persona = input_data.get("persona", "default")
        language = input_data.get("language", "tr")
        session_id = input_data.get("session_id")

        if not text:
            return {"error": "Missing 'text' field", "status": "error"}

        try:
            start = time.time()
            result = loop.run_until_complete(
                model_manager.infer(
                    text=text,
                    persona=persona,
                    language=language,
                    session_id=session_id,
                )
            )
            latency_ms = int((time.time() - start) * 1000)

            # Ensure result is a dict
            if hasattr(result, '__dict__'):
                result = result.__dict__
            elif not isinstance(result, dict):
                result = {"response_text": str(result)}

            result["latency_ms"] = latency_ms
            result["source"] = "personaplex-gpu"
            result["status"] = "ok"
            return result

        except Exception as e:
            logger.error(f"Inference error: {e}")
            return {
                "error": str(e),
                "status": "error",
                "source": "personaplex-gpu"
            }

    # ---- Unknown Action ----
    return {
        "error": f"Unknown action: {action}",
        "status": "error",
        "valid_actions": ["health_check", "infer"]
    }


# ============================================
# RunPod Entrypoint
# ============================================

if __name__ == "__main__":
    try:
        import runpod
        logger.info("Starting RunPod Serverless handler...")
        runpod.serverless.start({"handler": handler})
    except ImportError:
        # Fallback: run as standalone for local testing
        logger.info("RunPod SDK not found. Running test mode...")
        test_event = {
            "input": {
                "action": "health_check"
            }
        }
        result = handler(test_event)
        print(f"Test result: {result}")
