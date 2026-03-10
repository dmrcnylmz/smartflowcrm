# ============================================
# Context API — Lightweight Python Sidecar
# ============================================
# Runs personaplex_server/context_api.py WITHOUT
# GPU dependencies (no CUDA, no PyTorch, no model).
# Handles webhook context storage for voice sessions.
#
# Build from repo root:
#   docker build -f infrastructure/hetzner/context-api.Dockerfile \
#     -t callception-context-api personaplex_server/
# ============================================

FROM python:3.11-slim

LABEL maintainer="Callception <dev@callception.com>"
LABEL description="Context API sidecar for voice session management"

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only the dependencies needed for Context API
RUN pip install --no-cache-dir \
    fastapi>=0.109.0 \
    "uvicorn[standard]>=0.27.0" \
    httpx>=0.27.0 \
    pydantic>=2.5.0

# Copy only the context API file (not the full server)
COPY context_api.py .

# Non-root user
RUN useradd -m -u 1000 contextapi
USER contextapi

EXPOSE 8999

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:8999/health || exit 1

CMD ["python", "context_api.py"]
