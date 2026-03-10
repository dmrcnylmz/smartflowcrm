#!/bin/bash
set -e

echo "=== Personaplex GPU Pod Boot ==="
echo "Device: ${DEVICE:-cuda}"
echo "HF_HOME: ${HF_HOME:-/workspace/models/huggingface}"

# Ensure model cache directory exists on the persistent volume
MODEL_DIR="${HF_HOME:-/workspace/models/huggingface}"
mkdir -p "$MODEL_DIR"
export HF_HOME="$MODEL_DIR"

# Check if model weights are already cached
MODEL_CACHE="$MODEL_DIR/hub/models--nvidia--personaplex-7b-v1"
if [ -d "$MODEL_CACHE" ]; then
    echo "Model weights found in cache. Skipping download."
else
    echo "First boot: downloading model weights to persistent volume..."
    echo "This may take 5-10 minutes depending on network speed."
    python3.11 -c "
from huggingface_hub import snapshot_download
import os
token = os.environ.get('HF_TOKEN')
snapshot_download(
    'nvidia/personaplex-7b-v1',
    token=token,
    cache_dir=os.environ.get('HF_HOME', '/workspace/models/huggingface')
)
print('Model download complete.')
"
    echo "Model weights cached successfully."
fi

echo "Starting Personaplex server on port ${PORT:-8998}..."
exec python3.11 server.py
