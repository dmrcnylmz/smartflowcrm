# SmartFlow CRM - Personaplex Production Deployment

## Mimari Özet

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Cloudflare     │     │   GPU Server    │
│   (Vercel)      │────▶│   Tunnel         │────▶│   (RunPod)      │
│   Next.js       │     │   WAF/SSL        │     │   Personaplex   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌──────────────────┐
        └──────────────▶│      n8n         │
                        │   (CPU VPS)      │
                        │   Workflows      │
                        └──────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │    Firestore     │
                        │    (Database)    │
                        └──────────────────┘
```

## Phase 1: GPU Server Deployment

### Option A: RunPod (Recommended for testing)

1. **Create RunPod Account**
   - Go to https://runpod.io
   - Add credits ($10 minimum)

2. **Deploy GPU Pod**
   ```bash
   cd personaplex_server
   
   # Set environment variables
   export HF_TOKEN="hf_your_token_here"
   export PERSONAPLEX_API_KEY=$(openssl rand -hex 32)
   
   # Run deployment script
   chmod +x deploy-runpod.sh
   ./deploy-runpod.sh
   ```

3. **Or use RunPod Web UI**
   - Select GPU: RTX 4090 (24GB) - ~$0.44/hour
   - Template: RunPod PyTorch 2.1
   - Container Disk: 50GB
   - Volume: 100GB

### Option B: Lambda Labs (Production recommended)

1. **Create Lambda Labs Account**
   - Go to https://cloud.lambdalabs.com
   - Add SSH key

2. **Launch Instance**
   - Select: 1x A100 40GB - $1.29/hour
   - OS: Ubuntu 22.04

3. **Deploy**
   ```bash
   cd personaplex_server
   export HF_TOKEN="hf_your_token_here"
   
   chmod +x deploy-lambda.sh
   ./deploy-lambda.sh <instance-ip>
   ```

### Verify Deployment

```bash
# Test health endpoint
curl http://<GPU_IP>:8998/health

# Expected response:
# {"status":"healthy","model_loaded":true,"cuda_available":true,...}
```

---

## Phase 2: Cloudflare Tunnel Setup

### Prerequisites
- Cloudflare account with domain
- cloudflared CLI installed

### Setup

```bash
cd cloudflare

# Make executable
chmod +x setup-tunnel.sh

# Create tunnel (interactive, will open browser)
./setup-tunnel.sh smartflow-gpu voice.yourdomain.com

# Start tunnel on GPU server
cloudflared tunnel --config ~/.cloudflared/config-smartflow-gpu.yml run
```

### Verify
```bash
curl https://voice.yourdomain.com/health
```

### Run as Service (Linux)
```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## Phase 3: n8n Deployment

### Launch n8n on VPS

```bash
cd n8n

# Copy and edit environment file
cp .env.example .env
nano .env  # Fill in values

# Start n8n
docker compose up -d

# Check logs
docker compose logs -f
```

### Import Workflows

1. Open n8n: `http://<VPS_IP>:5678`
2. Login with credentials from `.env`
3. Import workflows:
   - `workflows/personaplex-intent-routing.json`
   - `workflows/whatsapp-voice-handler.json`

### Cloudflare Tunnel for n8n

Add to your tunnel config:
```yaml
- hostname: n8n.yourdomain.com
  service: http://localhost:5678
```

---

## Phase 4: Frontend Configuration

### Update Environment

`.env.local` (development):
```env
PERSONAPLEX_URL=http://localhost:8998
PERSONAPLEX_API_KEY=
```

`.env.production` (Vercel):
```env
PERSONAPLEX_URL=https://voice.yourdomain.com
PERSONAPLEX_API_KEY=your_api_key_here
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
```

---

## Environment Variables Summary

### Personaplex Server
| Variable | Description | Example |
|----------|-------------|---------|
| HF_TOKEN | HuggingFace token | hf_xxx |
| PERSONAPLEX_API_KEY | API authentication | random-32-hex |
| MAX_SESSIONS | Concurrent sessions | 4 |
| ALLOWED_ORIGINS | CORS origins | https://app.example.com |

### n8n
| Variable | Description | Example |
|----------|-------------|---------|
| PERSONAPLEX_URL | GPU server URL | https://voice.example.com |
| PERSONAPLEX_API_KEY | API key | same-as-above |
| FIREBASE_PROJECT_ID | Firebase project | smartflowcrm |

### Frontend (Vercel)
| Variable | Description | Example |
|----------|-------------|---------|
| PERSONAPLEX_URL | Via Cloudflare | https://voice.example.com |
| PERSONAPLEX_API_KEY | API key | same-as-above |

---

## Monitoring & Costs

### Estimated Monthly Costs

| Component | Option | Cost/Month |
|-----------|--------|------------|
| GPU (RunPod spot) | RTX 4090 8hr/day | ~$105 |
| GPU (Lambda) | A100 8hr/day | ~$310 |
| n8n VPS | 2GB RAM | ~$10-20 |
| Cloudflare | Free tier | $0 |
| Vercel | Pro | $20 |
| Firebase | Blaze | ~$10-50 |
| **Total** | | **$145-400** |

### Cost Optimization Tips

1. Use RunPod spot instances (50-70% cheaper)
2. Schedule GPU shutdown when not in use
3. Implement session limits
4. Monitor usage with Prometheus

---

## Troubleshooting

### GPU Server Issues
```bash
# Check GPU
nvidia-smi

# Check container logs
docker compose logs personaplex

# Restart
docker compose restart
```

### Tunnel Issues
```bash
# Check tunnel status
cloudflared tunnel info smartflow-gpu

# Test local connectivity
curl http://localhost:8998/health
```

### n8n Issues
```bash
# Check logs
docker compose logs n8n

# Restart
docker compose restart n8n
```
