# ============================================
# Personaplex Inference Server — CPU Mode
# ============================================
# Runs personaplex_server/server.py WITHOUT
# GPU dependencies (no CUDA, no PyTorch, no model).
# Handles keyword-based intent detection + WebSocket
# for voice AI sessions.
#
# Build from repo root:
#   docker build -f infrastructure/hetzner/personaplex-server.Dockerfile \
#     -t callception-personaplex personaplex_server/
# ============================================

FROM python:3.11-slim

LABEL maintainer="Callception <dev@callception.com>"
LABEL description="Personaplex inference server (CPU / keyword-based mode)"

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir \
    "fastapi>=0.109.0" \
    "uvicorn[standard]>=0.27.0" \
    "websockets>=12.0" \
    "pydantic>=2.5.0" \
    "httpx>=0.27.0" \
    "python-multipart>=0.0.6"

COPY server.py .

RUN useradd -m -u 1000 personaplex
USER personaplex

EXPOSE 8998

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:8998/health || exit 1

CMD ["python", "server.py"]
