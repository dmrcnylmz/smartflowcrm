-- ═══════════════════════════════════════════════════════════
-- REVENUE ACTIVATION LAYER — Dashboard Schema & SQL Views
-- 
-- Tables for revenue event tracking + views for dashboard metrics.
-- All customer-facing metrics in MINUTES. No tokens.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Subscription Event Log ──────────────────────────
-- Immutable audit log of all subscription lifecycle events.

CREATE TABLE IF NOT EXISTS subscription_events (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    -- Event types:
    --   checkout_started, subscription_activated, plan_upgraded,
    --   trial_ending_soon, trial_expired, account_suspended,
    --   payment_failed, subscription_canceled, overage_reported
    event_data      TEXT,               -- JSON payload
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_se_tenant ON subscription_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_se_type ON subscription_events(event_type, created_at);


-- ─── 2. Revenue Events ──────────────────────────────────
-- Every payment, refund, credit recorded here.

CREATE TABLE IF NOT EXISTS revenue_events (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    event_type          TEXT NOT NULL,       -- 'payment', 'refund', 'credit'
    invoice_id          TEXT,
    amount              REAL NOT NULL,       -- total amount USD
    currency            TEXT DEFAULT 'USD',
    subscription_amount REAL DEFAULT 0,      -- portion from base subscription
    overage_amount      REAL DEFAULT 0,      -- portion from overage minutes
    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_re_tenant ON revenue_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_created ON revenue_events(created_at);
CREATE INDEX IF NOT EXISTS idx_re_type ON revenue_events(event_type);


-- ─── 3. Subscription Status Extensions ──────────────────
-- Add columns to existing tenant_subscriptions if not present.

-- Run these as ALTER TABLE (wrapped in try/catch in code):
-- ALTER TABLE tenant_subscriptions ADD COLUMN suspended_at DATETIME;
-- ALTER TABLE tenant_subscriptions ADD COLUMN suspension_reason TEXT;
-- ALTER TABLE tenant_subscriptions ADD COLUMN canceled_at DATETIME;
-- ALTER TABLE tenant_subscriptions ADD COLUMN current_period_start DATETIME;
-- ALTER TABLE tenant_subscriptions ADD COLUMN current_period_end DATETIME;


-- ═══════════════════════════════════════════════════════════
-- REVENUE DASHBOARD SQL VIEWS
-- ═══════════════════════════════════════════════════════════


-- ─── VIEW: Monthly Recurring Revenue (MRR) ──────────────
-- Active subscriptions × their monthly price.
-- Customer sees: plan name + monthly fee. No tokens.

CREATE VIEW IF NOT EXISTS v_mrr AS
SELECT 
    strftime('%Y-%m', ts.updated_at) as month,
    COUNT(*) as active_subscriptions,
    SUM(sp.price_monthly) as mrr,
    AVG(sp.price_monthly) as avg_subscription_value,
    SUM(CASE WHEN sp.name = 'starter' THEN 1 ELSE 0 END) as starter_count,
    SUM(CASE WHEN sp.name = 'pro' THEN 1 ELSE 0 END) as pro_count,
    SUM(CASE WHEN sp.name = 'enterprise' THEN 1 ELSE 0 END) as enterprise_count
FROM tenant_subscriptions ts
JOIN subscription_plans sp ON ts.plan_id = sp.id
WHERE ts.status = 'active'
GROUP BY strftime('%Y-%m', ts.updated_at);


-- ─── VIEW: Revenue Breakdown (Subscription vs Overage) ──

CREATE VIEW IF NOT EXISTS v_revenue_breakdown AS
SELECT
    strftime('%Y-%m', created_at) as month,
    COUNT(*) as total_payments,
    COALESCE(SUM(amount), 0) as total_revenue,
    COALESCE(SUM(subscription_amount), 0) as subscription_revenue,
    COALESCE(SUM(overage_amount), 0) as overage_revenue,
    ROUND(COALESCE(SUM(overage_amount), 0) / NULLIF(COALESCE(SUM(amount), 0), 0) * 100, 1) as overage_pct
FROM revenue_events
WHERE event_type = 'payment'
GROUP BY strftime('%Y-%m', created_at);


-- ─── VIEW: Tenant Revenue Detail ────────────────────────
-- Per-tenant revenue with plan and usage context.
-- Customer-facing: shows minutes used, not tokens.

CREATE VIEW IF NOT EXISTS v_tenant_revenue AS
SELECT
    t.id as tenant_id,
    t.name as tenant_name,
    sp.name as plan_name,
    sp.display_name as plan_display_name,
    sp.price_monthly,
    sp.max_minutes as included_minutes,
    sp.overage_per_minute as overage_rate,
    ts.status as subscription_status,
    ts.created_at as subscribed_since,
    
    -- Usage (current month) — MINUTES only
    COALESCE(um.call_minutes, 0) as minutes_used,
    sp.max_minutes as minutes_included,
    MAX(0, COALESCE(um.call_minutes, 0) - sp.max_minutes) as overage_minutes,
    
    -- Revenue (all time)
    COALESCE(rev.total_paid, 0) as total_revenue,
    COALESCE(rev.payment_count, 0) as total_payments,
    
    -- Lifetime (months since first subscription)
    CAST((julianday('now') - julianday(ts.created_at)) / 30 AS INTEGER) as months_active
    
FROM tenants t
LEFT JOIN tenant_subscriptions ts ON t.id = ts.tenant_id
LEFT JOIN subscription_plans sp ON ts.plan_id = sp.id
LEFT JOIN (
    SELECT tenant_id, COALESCE(SUM(call_minutes), 0) as call_minutes
    FROM usage_metrics WHERE month = strftime('%Y-%m', 'now')
    GROUP BY tenant_id
) um ON t.id = um.tenant_id
LEFT JOIN (
    SELECT tenant_id, SUM(amount) as total_paid, COUNT(*) as payment_count
    FROM revenue_events WHERE event_type = 'payment'
    GROUP BY tenant_id
) rev ON t.id = rev.tenant_id;


-- ─── VIEW: Trial Conversion Funnel ─────────────────────
-- Tracks: signup → trial → converted | expired | suspended

CREATE VIEW IF NOT EXISTS v_trial_funnel AS
SELECT
    strftime('%Y-%m', ts.created_at) as cohort_month,
    COUNT(*) as total_signups,
    SUM(CASE WHEN ts.status = 'trialing' THEN 1 ELSE 0 END) as active_trials,
    SUM(CASE WHEN ts.status = 'active' AND sp.name != 'free_trial' THEN 1 ELSE 0 END) as converted,
    SUM(CASE WHEN ts.status = 'expired' THEN 1 ELSE 0 END) as expired,
    SUM(CASE WHEN ts.status = 'suspended' THEN 1 ELSE 0 END) as suspended,
    SUM(CASE WHEN ts.status = 'canceled' THEN 1 ELSE 0 END) as canceled,
    ROUND(
        CAST(SUM(CASE WHEN ts.status = 'active' AND sp.name != 'free_trial' THEN 1 ELSE 0 END) AS REAL) 
        / NULLIF(COUNT(*), 0) * 100, 1
    ) as conversion_rate
FROM tenant_subscriptions ts
JOIN subscription_plans sp ON ts.plan_id = sp.id
GROUP BY strftime('%Y-%m', ts.created_at);


-- ─── VIEW: Churn Analysis ──────────────────────────────
-- Monthly churn: canceled / (active at month start)

CREATE VIEW IF NOT EXISTS v_churn_analysis AS
SELECT
    strftime('%Y-%m', se.created_at) as month,
    SUM(CASE WHEN se.event_type = 'subscription_canceled' THEN 1 ELSE 0 END) as cancellations,
    SUM(CASE WHEN se.event_type = 'subscription_activated' THEN 1 ELSE 0 END) as new_activations,
    SUM(CASE WHEN se.event_type = 'plan_upgraded' THEN 1 ELSE 0 END) as upgrades,
    SUM(CASE WHEN se.event_type = 'payment_failed' THEN 1 ELSE 0 END) as payment_failures,
    SUM(CASE WHEN se.event_type = 'trial_expired' THEN 1 ELSE 0 END) as trial_expirations
FROM subscription_events se
GROUP BY strftime('%Y-%m', se.created_at);


-- ─── VIEW: ARPU & LTV Estimates ────────────────────────
-- Average Revenue Per User and Lifetime Value projections.

CREATE VIEW IF NOT EXISTS v_arpu_ltv AS
SELECT
    sp.name as plan_name,
    sp.display_name,
    sp.price_monthly,
    sp.max_minutes as included_minutes,
    COUNT(ts.id) as tenant_count,
    
    -- ARPU = avg monthly revenue per tenant
    ROUND(AVG(
        sp.price_monthly + COALESCE(
            MAX(0, um.call_minutes - sp.max_minutes) * sp.overage_per_minute, 0
        )
    ), 2) as arpu,
    
    -- LTV estimate (ARPU × avg lifetime in months)
    ROUND(AVG(
        sp.price_monthly + COALESCE(
            MAX(0, um.call_minutes - sp.max_minutes) * sp.overage_per_minute, 0
        )
    ) * AVG(CAST((julianday('now') - julianday(ts.created_at)) / 30 AS REAL)), 2) as estimated_ltv,
    
    -- Avg monthly overage minutes per tenant
    ROUND(AVG(MAX(0, COALESCE(um.call_minutes, 0) - sp.max_minutes)), 1) as avg_overage_minutes

FROM tenant_subscriptions ts
JOIN subscription_plans sp ON ts.plan_id = sp.id
LEFT JOIN (
    SELECT tenant_id, SUM(call_minutes) as call_minutes
    FROM usage_metrics WHERE month = strftime('%Y-%m', 'now')
    GROUP BY tenant_id
) um ON ts.tenant_id = um.tenant_id
WHERE ts.status IN ('active', 'trialing')
GROUP BY sp.name;


-- ─── VIEW: Overage Revenue Tracking ────────────────────
-- Per-tenant overage minutes and projected charges.
-- Customer-facing: minutes × overage rate.

CREATE VIEW IF NOT EXISTS v_overage_tracking AS
SELECT
    um.tenant_id,
    t.name as tenant_name,
    um.month,
    um.call_minutes as total_minutes_used,
    sp.max_minutes as included_minutes,
    MAX(0, um.call_minutes - sp.max_minutes) as overage_minutes,
    sp.overage_per_minute as overage_rate,
    ROUND(MAX(0, um.call_minutes - sp.max_minutes) * sp.overage_per_minute, 2) as overage_charge,
    sp.price_monthly as subscription_fee,
    ROUND(sp.price_monthly + MAX(0, um.call_minutes - sp.max_minutes) * sp.overage_per_minute, 2) as total_bill
FROM usage_metrics um
JOIN tenants t ON um.tenant_id = t.id
JOIN tenant_subscriptions ts ON um.tenant_id = ts.tenant_id
JOIN subscription_plans sp ON ts.plan_id = sp.id
WHERE um.call_minutes > sp.max_minutes
ORDER BY overage_minutes DESC;


-- ─── VIEW: Executive Dashboard Summary ─────────────────
-- Single-row view for the admin/investor dashboard.

CREATE VIEW IF NOT EXISTS v_executive_summary AS
SELECT
    (SELECT COUNT(*) FROM tenants) as total_tenants,
    (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'active') as active_subscriptions,
    (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'trialing') as active_trials,
    (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'suspended') as suspended_accounts,
    (SELECT COALESCE(SUM(sp.price_monthly), 0) 
     FROM tenant_subscriptions ts JOIN subscription_plans sp ON ts.plan_id = sp.id 
     WHERE ts.status = 'active') as current_mrr,
    (SELECT COALESCE(SUM(sp.price_monthly), 0) * 12
     FROM tenant_subscriptions ts JOIN subscription_plans sp ON ts.plan_id = sp.id 
     WHERE ts.status = 'active') as projected_arr,
    (SELECT COALESCE(SUM(amount), 0) FROM revenue_events 
     WHERE event_type = 'payment' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) as revenue_this_month,
    (SELECT COALESCE(SUM(overage_amount), 0) FROM revenue_events 
     WHERE event_type = 'payment' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) as overage_revenue_this_month,
    (SELECT ROUND(AVG(sp.price_monthly), 2)
     FROM tenant_subscriptions ts JOIN subscription_plans sp ON ts.plan_id = sp.id 
     WHERE ts.status = 'active') as avg_revenue_per_tenant;
