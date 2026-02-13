-- ═══════════════════════════════════════════════════════════
-- COST TRACKING SCHEMA — Revenue-Ready SaaS
-- Tracks per-call COGS at provider level for margin analysis
-- ═══════════════════════════════════════════════════════════

-- ─── Provider Rate Cards ─────────────────────────────────
-- Stores pricing from each provider (Twilio, Deepgram, ElevenLabs, OpenAI)
-- Updated when provider pricing changes

CREATE TABLE IF NOT EXISTS provider_rates (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,           -- 'twilio', 'deepgram', 'elevenlabs', 'openai'
    service     TEXT NOT NULL,           -- 'voice_inbound', 'voice_outbound', 'stt', 'tts', 'llm_input', 'llm_output'
    unit        TEXT NOT NULL,           -- 'minute', 'second', 'character', 'token'
    rate        REAL NOT NULL,           -- cost per unit in USD
    tier        TEXT DEFAULT 'default',  -- 'default', 'enterprise', 'paygo'
    effective_from TEXT NOT NULL,        -- ISO date
    effective_to   TEXT,                 -- NULL = current
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_provider_rates_lookup
    ON provider_rates(provider, service, effective_from);

-- ─── Per-Call Cost Breakdown ─────────────────────────────
-- Every completed call gets a cost record with provider-level breakdown

CREATE TABLE IF NOT EXISTS call_costs (
    id              TEXT PRIMARY KEY,
    call_id         TEXT NOT NULL,        -- FK → calls.id
    tenant_id       TEXT NOT NULL,        -- FK → tenants.id

    -- Duration metrics
    call_duration_s INTEGER NOT NULL DEFAULT 0,   -- total call seconds
    stt_duration_s  INTEGER NOT NULL DEFAULT 0,   -- speech-to-text seconds
    tts_duration_s  INTEGER NOT NULL DEFAULT 0,   -- text-to-speech seconds (or chars)
    tts_characters  INTEGER NOT NULL DEFAULT 0,   -- TTS characters generated
    llm_input_tokens  INTEGER NOT NULL DEFAULT 0, -- LLM prompt tokens
    llm_output_tokens INTEGER NOT NULL DEFAULT 0, -- LLM completion tokens

    -- Cost breakdown (USD)
    twilio_cost     REAL NOT NULL DEFAULT 0,   -- telephony cost
    stt_cost        REAL NOT NULL DEFAULT 0,   -- speech-to-text cost
    tts_cost        REAL NOT NULL DEFAULT 0,   -- text-to-speech cost
    llm_cost        REAL NOT NULL DEFAULT 0,   -- LLM inference cost
    total_cogs      REAL NOT NULL DEFAULT 0,   -- sum of all provider costs

    -- Revenue side
    tenant_charge   REAL NOT NULL DEFAULT 0,   -- what we charge the tenant
    margin          REAL NOT NULL DEFAULT 0,   -- tenant_charge - total_cogs
    margin_pct      REAL NOT NULL DEFAULT 0,   -- margin / tenant_charge * 100

    -- Metadata
    provider_snapshot TEXT,    -- JSON of rates used at time of calculation
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_costs_tenant ON call_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_costs_call ON call_costs(call_id);
CREATE INDEX IF NOT EXISTS idx_call_costs_date ON call_costs(created_at);

-- ─── Monthly Cost Aggregates ─────────────────────────────
-- Pre-computed monthly rollups for dashboard & billing

CREATE TABLE IF NOT EXISTS monthly_cost_summary (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    month           TEXT NOT NULL,         -- 'YYYY-MM'

    total_calls     INTEGER NOT NULL DEFAULT 0,
    total_minutes   REAL NOT NULL DEFAULT 0,
    total_stt_min   REAL NOT NULL DEFAULT 0,
    total_tts_chars INTEGER NOT NULL DEFAULT 0,
    total_llm_in    INTEGER NOT NULL DEFAULT 0,
    total_llm_out   INTEGER NOT NULL DEFAULT 0,

    -- Aggregated costs
    total_twilio    REAL NOT NULL DEFAULT 0,
    total_stt       REAL NOT NULL DEFAULT 0,
    total_tts       REAL NOT NULL DEFAULT 0,
    total_llm       REAL NOT NULL DEFAULT 0,
    total_cogs      REAL NOT NULL DEFAULT 0,

    -- Revenue
    total_revenue   REAL NOT NULL DEFAULT 0,
    total_margin    REAL NOT NULL DEFAULT 0,
    avg_margin_pct  REAL NOT NULL DEFAULT 0,
    avg_cost_per_call REAL NOT NULL DEFAULT 0,

    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),

    UNIQUE(tenant_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_cost_tenant_month
    ON monthly_cost_summary(tenant_id, month);


-- ═══════════════════════════════════════════════════════════
-- EXAMPLE DATA — Seed provider rates (Feb 2026 pricing)
-- ═══════════════════════════════════════════════════════════

INSERT OR IGNORE INTO provider_rates (id, provider, service, unit, rate, effective_from) VALUES
-- Twilio Voice
('rate_tw_in',   'twilio',      'voice_inbound',  'minute',    0.0085, '2026-01-01'),
('rate_tw_out',  'twilio',      'voice_outbound', 'minute',    0.014,  '2026-01-01'),

-- Deepgram STT (Nova-2)
('rate_dg_stt',  'deepgram',    'stt',            'second',    0.0002, '2026-01-01'),

-- ElevenLabs TTS (Turbo v2.5)
('rate_el_tts',  'elevenlabs',  'tts',            'character', 0.00003,'2026-01-01'),

-- OpenAI GPT-4o-mini
('rate_oa_in',   'openai',      'llm_input',      'token',     0.00000015, '2026-01-01'),
('rate_oa_out',  'openai',      'llm_output',     'token',     0.0000006,  '2026-01-01');


-- Example call_costs row (3-minute inbound call)
INSERT OR IGNORE INTO call_costs (
    id, call_id, tenant_id,
    call_duration_s, stt_duration_s, tts_duration_s, tts_characters,
    llm_input_tokens, llm_output_tokens,
    twilio_cost, stt_cost, tts_cost, llm_cost, total_cogs,
    tenant_charge, margin, margin_pct
) VALUES (
    'cc_example_001', 'call_example_001', 'tenant_example_001',
    180, 90, 60, 800,
    1200, 400,
    0.0255, 0.018, 0.024, 0.00042, 0.06792,
    0.18, 0.11208, 62.3
);
