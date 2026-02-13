-- ═══════════════════════════════════════════════════════════
-- SHADOW BILLING LOGGER — Cost Validation Infrastructure
-- 
-- Records every billable event from every provider in real-time.
-- Enables reconciliation against provider invoices.
-- 
-- RULE: All customer-facing fields are in MINUTES.
-- Token fields exist ONLY in internal shadow tables.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Shadow Billing Events ────────────────────────────
-- One row per provider interaction per call.
-- A single call produces 4 events: twilio, stt, tts, llm.

CREATE TABLE IF NOT EXISTS shadow_billing_events (
    id              TEXT PRIMARY KEY,
    call_id         TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    correlation_id  TEXT,                 -- request correlation for tracing

    -- Provider identification
    provider        TEXT NOT NULL,         -- 'twilio', 'deepgram', 'elevenlabs', 'openai'
    service         TEXT NOT NULL,         -- 'voice_inbound', 'stt', 'tts', 'llm_completion'
    provider_request_id TEXT,             -- provider's own request/transaction ID

    -- Usage metrics (raw, provider-native units)
    usage_quantity  REAL NOT NULL,         -- seconds, characters, tokens — depends on provider
    usage_unit      TEXT NOT NULL,         -- 'second', 'character', 'token', 'minute'

    -- Cost (our calculation)
    calculated_cost REAL NOT NULL,         -- our cost calc at event time
    rate_applied    REAL NOT NULL,         -- rate we used for calculation
    rate_source     TEXT DEFAULT 'config', -- 'config', 'api', 'invoice_override'

    -- Provider-reported cost (filled during reconciliation)
    provider_cost   REAL,                  -- from provider invoice/API
    cost_deviation  REAL,                  -- provider_cost - calculated_cost
    deviation_pct   REAL,                  -- abs(deviation) / calculated_cost * 100

    -- Reconciliation status
    reconciled      INTEGER DEFAULT 0,     -- 0=pending, 1=matched, 2=deviation, 3=override
    reconciled_at   TEXT,
    reconciled_by   TEXT,                  -- 'auto', 'manual', 'invoice_import'
    reconciliation_note TEXT,

    -- Timing
    event_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sbe_call ON shadow_billing_events(call_id);
CREATE INDEX IF NOT EXISTS idx_sbe_tenant ON shadow_billing_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sbe_provider ON shadow_billing_events(provider, event_timestamp);
CREATE INDEX IF NOT EXISTS idx_sbe_reconciled ON shadow_billing_events(reconciled);
CREATE INDEX IF NOT EXISTS idx_sbe_timestamp ON shadow_billing_events(event_timestamp);


-- ─── 2. Shadow Billing Summaries ─────────────────────────
-- Per-call rollup: computed from events. What the customer would see.
-- All customer fields in MINUTES. Internal COGS fields hidden.

CREATE TABLE IF NOT EXISTS shadow_billing_call_summary (
    id              TEXT PRIMARY KEY,
    call_id         TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,

    -- Customer-visible metrics (MINUTES only)
    call_duration_min   REAL NOT NULL DEFAULT 0,   -- billed duration in minutes
    plan_name           TEXT,                       -- plan at time of call
    included_remaining  REAL DEFAULT 0,             -- minutes remaining before this call
    is_overage          INTEGER DEFAULT 0,          -- 1 if this call used overage minutes
    overage_minutes     REAL DEFAULT 0,             -- minutes billed at overage rate
    overage_rate        REAL DEFAULT 0,             -- $/min overage rate
    customer_charge     REAL NOT NULL DEFAULT 0,    -- what customer pays (included or overage)

    -- Internal COGS breakdown (NEVER customer-facing)
    cogs_twilio         REAL NOT NULL DEFAULT 0,
    cogs_stt            REAL NOT NULL DEFAULT 0,
    cogs_tts            REAL NOT NULL DEFAULT 0,
    cogs_llm            REAL NOT NULL DEFAULT 0,
    cogs_total          REAL NOT NULL DEFAULT 0,
    cogs_per_minute     REAL NOT NULL DEFAULT 0,

    -- Margin
    margin              REAL NOT NULL DEFAULT 0,    -- customer_charge - cogs_total
    margin_pct          REAL NOT NULL DEFAULT 0,    -- margin / customer_charge * 100

    -- Validation
    validated           INTEGER DEFAULT 0,
    validation_errors   TEXT,                        -- JSON array of issues

    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sbcs_tenant ON shadow_billing_call_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sbcs_created ON shadow_billing_call_summary(created_at);
CREATE INDEX IF NOT EXISTS idx_sbcs_overage ON shadow_billing_call_summary(is_overage);


-- ─── 3. Provider Invoice Imports ─────────────────────────
-- Import actual invoices from providers for reconciliation.

CREATE TABLE IF NOT EXISTS provider_invoice_imports (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,          -- 'twilio', 'deepgram', 'elevenlabs', 'openai'
    invoice_id      TEXT,                   -- provider invoice number
    period_start    TEXT NOT NULL,          -- billing period start
    period_end      TEXT NOT NULL,          -- billing period end
    
    total_amount    REAL NOT NULL,          -- total invoice amount USD
    currency        TEXT DEFAULT 'USD',

    -- Breakdown by service (not all providers give this)
    line_items      TEXT,                   -- JSON array of line items

    -- Reconciliation
    our_calculated_total REAL,             -- sum of our shadow events for same period
    deviation       REAL,                   -- total_amount - our_calculated_total
    deviation_pct   REAL,
    status          TEXT DEFAULT 'pending', -- 'pending', 'matched', 'deviation', 'reviewed'

    imported_at     TEXT DEFAULT (datetime('now')),
    reviewed_at     TEXT,
    reviewed_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_pii_provider ON provider_invoice_imports(provider, period_start);
CREATE INDEX IF NOT EXISTS idx_pii_status ON provider_invoice_imports(status);


-- ─── 4. Validation Experiment Runs ───────────────────────
-- Track each 2-week validation experiment.

CREATE TABLE IF NOT EXISTS validation_experiments (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,          -- 'week1_baseline', 'week2_load_test'
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    status          TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'

    -- Experiment parameters
    total_test_calls    INTEGER DEFAULT 0,
    call_scenarios      TEXT,               -- JSON: scenarios used

    -- Results (filled on completion)
    avg_cogs_per_min    REAL,
    avg_margin_pct      REAL,
    max_deviation_pct   REAL,
    providers_reconciled INTEGER DEFAULT 0,
    pass_fail           TEXT,               -- 'PASS' or 'FAIL' + reason

    report_url          TEXT,               -- link to generated report
    created_at          TEXT DEFAULT (datetime('now'))
);
