# ============================================
# Personaplex Production Dockerfile
# Multi-stage build for minimal image size
# ============================================

# Stage 1: Builder
FROM nvidia/cuda:12.1-devel-ubuntu22.04 AS builder

# Avoid prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install Python and build tools
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create venv
RUN python3.11 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python deps
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /tmp/requirements.txt

# ============================================
# Stage 2: Runtime
# ============================================
FROM nvidia/cuda:12.1-runtime-ubuntu22.04

LABEL maintainer="SmartFlow CRM"
LABEL version="1.0.0"
LABEL description="Personaplex Voice AI Server"

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Install runtime deps
RUN apt-get update && apt-get install -y \
    python3.11 \
    libopus0 \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN useradd -m -u 1000 personaplex
WORKDIR /app
RUN chown personaplex:personaplex /app

# Copy app code
COPY --chown=personaplex:personaplex . .

# Switch to non-root
USER personaplex

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8998
ENV DEVICE=cuda
ENV MAX_SESSIONS=4
ENV SESSION_TIMEOUT=300

# Expose port
EXPOSE 8998

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8998/health || exit 1

# Run
CMD ["python", "server.py"]
