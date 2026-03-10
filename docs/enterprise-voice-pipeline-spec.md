# Callception — Voice AI Pipeline Technical Specification

**Version:** 1.0 | **Date:** March 2026 | **Classification:** Enterprise Sales

---

## Executive Summary

Callception's Voice AI Pipeline is a production-grade, real-time voice processing system that handles inbound customer calls autonomously. The pipeline combines Speech-to-Text (STT), Large Language Model (LLM) reasoning, and Text-to-Speech (TTS) synthesis to deliver sub-2.5 second end-to-end response times — comparable to human conversation latency.

---

## Architecture Overview

```
Inbound Call (Twilio)
        │
        ▼
┌─── STT Layer ─────┐     ┌─── LLM Layer ─────┐     ┌─── TTS Layer ─────┐
│  Deepgram Nova-2   │────▶│  Groq (Llama 3)   │────▶│  ElevenLabs v2    │
│  ~1000ms latency   │     │  ~430ms latency    │     │  ~630ms latency   │
│  streaming mode    │     │  OpenAI fallback   │     │  OpenAI fallback  │
└────────────────────┘     └────────────────────┘     └────────────────────┘
                                                              │
                                                              ▼
                                                     Audio Response
                                                     (to Twilio → Caller)
```

**Total Pipeline Latency:** ~2,077ms (measured P50)

---

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| End-to-end response time | ~2.1 seconds | STT + LLM + TTS combined |
| STT latency (Deepgram) | ~1,012ms | Nova-2 model, streaming |
| LLM latency (Groq) | ~433ms | Llama 3, with Groq hardware acceleration |
| TTS latency (ElevenLabs) | ~632ms | Turbo v2, streaming audio |
| Uptime target | 99.9% | Multi-provider fallback ensures continuity |
| Concurrent calls | No hard limit | Stateless design, scales horizontally |

---

## Provider Stack

### Speech-to-Text (STT)
- **Primary:** Deepgram Nova-2 — Best-in-class accuracy for Turkish language
- **Streaming mode** for lowest latency

### Large Language Model (LLM)
- **Primary:** Groq (Llama 3) — Sub-500ms inference via dedicated hardware
- **Fallback:** OpenAI GPT-4o-mini — Automatic failover on Groq unavailability
- **Context:** Tenant-specific knowledge base (RAG) + conversation history

### Text-to-Speech (TTS)
- **Primary:** ElevenLabs Turbo v2 — Natural, human-like voice quality
- **Emergency Fallback:** OpenAI TTS — Lower cost, activated automatically when budget thresholds are exceeded
- **Greeting audio** always uses ElevenLabs (first impression quality preserved)

---

## Cost Management & Emergency Mode

### Automated Budget Protection
The system includes a built-in cost monitoring engine that tracks TTS character usage in real-time:

| Threshold | Action |
|-----------|--------|
| 80% of monthly budget | Warning alert dispatched (Slack/Telegram/Console) |
| 95% of monthly budget | Critical alert + automatic Emergency Mode activation |
| Manual override | Admin can toggle Emergency Mode via dashboard |

### Emergency Mode Behavior
When activated, the system intelligently degrades TTS quality to control costs:
- **Greeting TTS** → Stays on ElevenLabs (quality preserved for first impression)
- **Body/Response TTS** → Switches to OpenAI TTS (60-70% cost reduction)
- **Fully reversible** — Admin can deactivate via billing dashboard

### Multi-Channel Alerting
Emergency mode state changes trigger instant notifications:
- Slack webhook (configurable channel)
- Telegram bot (configurable chat)
- Structured console logging (always active)
- Rate-limited: max 1 alert per type per 5 minutes

---

## Observability & Analytics

### Real-Time Metrics
Every voice call logs granular telemetry:
- Per-stage latency (STT, LLM, TTS individually)
- Provider used per stage
- TTS character count
- Session context (language, intent, cache hit)

### Dashboard Features
| Feature | Description |
|---------|-------------|
| Pipeline Latency Trend | Daily STT/LLM/TTS breakdown (line chart) |
| Provider Distribution | Usage split across providers (pie chart) |
| Monthly Cost Trend | TTS + LLM infrastructure costs (bar chart) |
| Emergency Mode Panel | Live status, manual toggle, recent alerts |
| Pipeline Stats Card | Total calls, avg response time, cost summary |

### Data Architecture
- **Per-call metrics** stored in Firestore (tenant-scoped)
- **Daily aggregates** pre-computed for fast dashboard queries
- **Non-blocking writes** — 0ms added latency to voice pipeline
- **In-memory buffering** with auto-flush (batch efficiency)

---

## Resilience & Failover

| Scenario | Behavior |
|----------|----------|
| Groq unavailable | Automatic fallback to OpenAI GPT-4o-mini |
| ElevenLabs unavailable | Automatic fallback to OpenAI TTS |
| Budget exceeded | Emergency Mode: body TTS → OpenAI, greeting preserved |
| Firestore write fails | Silently skipped — pipeline never blocks on analytics |
| Network timeout | 5-second abort signals on all external calls |

**Design principle:** The voice pipeline never fails due to monitoring, logging, or alerting subsystems. All non-critical operations are fire-and-forget.

---

## Security & Multi-Tenancy

- **Tenant isolation:** All data scoped under `tenants/{tenantId}/` in Firestore
- **Session-based auth:** Voice routes use session-to-tenant registry (no exposed credentials)
- **API authentication:** Dashboard/billing APIs require tenant context headers
- **No PII in logs:** Call metrics contain latency and provider data only
- **Environment-based secrets:** Webhook URLs, API keys stored as environment variables

---

## Infrastructure Requirements

| Component | Specification |
|-----------|--------------|
| Runtime | Node.js 24+ (Next.js 15) |
| Database | Firebase Firestore (NoSQL, auto-scaling) |
| Telephony | Twilio Programmable Voice |
| Hosting | Vercel / Any Node.js compatible platform |
| External APIs | Deepgram, Groq, OpenAI, ElevenLabs |

---

## Pricing Model Impact

| Provider | Unit Cost | Monthly Estimate (500 calls/day) |
|----------|-----------|----------------------------------|
| Deepgram STT | ~$0.0043/min | ~$65/month |
| Groq LLM | ~$0.05/1M tokens | ~$8/month |
| ElevenLabs TTS | ~$0.15/1K chars | ~$225/month |
| OpenAI TTS (emergency) | ~$0.015/1K chars | 90% savings vs ElevenLabs |
| **Total (normal mode)** | | **~$298/month** |
| **Total (emergency mode)** | | **~$96/month** |

*Estimates based on average 2-minute calls, 150 words per response.*

---

## Deployment Checklist

- [ ] Environment variables configured (API keys for all providers)
- [ ] Firestore indexes deployed for cost_alerts and metrics_daily collections
- [ ] Slack/Telegram webhook URLs set for alerting
- [ ] TTS monthly character budget configured per tenant
- [ ] Emergency mode thresholds reviewed (default: 80% warn, 95% critical)
- [ ] Shadow mode period completed (24h monitoring without billing)
- [ ] Dashboard access verified for tenant admins
- [ ] Failover tested (disable primary providers to verify fallback)

---

*Callception — Enterprise Voice AI for Call Centers*
