-- Multi-Tenant Voice Call Center Platform Schema v3.0
-- Every table includes tenant_id for strict data isolation

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  timezone TEXT DEFAULT 'UTC',
  language TEXT DEFAULT 'en',
  business_hours_start TEXT DEFAULT '09:00',
  business_hours_end TEXT DEFAULT '18:00',
  business_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'agent')),
  level INTEGER DEFAULT 1,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'busy', 'offline', 'on_call', 'break')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS queues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,
  max_wait_time INTEGER DEFAULT 300,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  queue_id TEXT,
  label TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (queue_id) REFERENCES queues(id)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  call_type TEXT NOT NULL CHECK(call_type IN ('inbound', 'outbound')),
  caller_number TEXT NOT NULL,
  callee_number TEXT,
  agent_id TEXT,
  queue_id TEXT,
  duration INTEGER DEFAULT 0,
  status TEXT DEFAULT 'initiated' CHECK(status IN ('initiated', 'ringing', 'in_progress', 'on_hold', 'completed', 'abandoned', 'missed', 'failed')),
  recording_url TEXT,
  transcript_text TEXT,
  sentiment_score REAL,
  resolution_status TEXT CHECK(resolution_status IN ('resolved', 'unresolved', 'follow_up', 'escalated')),
  ivr_selection TEXT,
  call_summary TEXT,
  -- AI enrichment columns
  intent TEXT,
  ai_summary TEXT,
  ai_next_action TEXT,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (agent_id) REFERENCES users(id),
  FOREIGN KEY (queue_id) REFERENCES queues(id)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  FOREIGN KEY (call_id) REFERENCES calls(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Tenant AI Persona Settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  tone TEXT DEFAULT 'friendly' CHECK(tone IN ('formal', 'friendly')),
  language TEXT DEFAULT 'en' CHECK(language IN ('en', 'tr')),
  forbidden_topics TEXT DEFAULT '',
  escalation_rules TEXT DEFAULT 'If unsure or customer insists, escalate to supervisor.',
  handoff_threshold REAL DEFAULT 0.3,
  rate_limit INTEGER DEFAULT 100,
  monthly_max_tokens INTEGER DEFAULT 0,
  monthly_max_minutes INTEGER DEFAULT 0,
  data_retention_days INTEGER DEFAULT 365,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- White Label Branding
CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id TEXT PRIMARY KEY,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c5cfc',
  secondary_color TEXT DEFAULT '#00d4aa',
  company_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Billing / Usage Metrics
CREATE TABLE IF NOT EXISTS usage_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  month TEXT NOT NULL,
  call_minutes INTEGER DEFAULT 0,
  ai_tokens INTEGER DEFAULT 0,
  telephony_minutes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, month)
);

-- Conversation Memory (Phase 8)
CREATE TABLE IF NOT EXISTS conversation_memory (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  call_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

-- Human Handoff Queue (Phase 9)
CREATE TABLE IF NOT EXISTS handoff_queue (
  id TEXT PRIMARY KEY,
  call_id TEXT,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  assigned_agent_id TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'active', 'resolved', 'expired')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (call_id) REFERENCES calls(id),
  FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
);

-- Tenant Pricing (Phase 10)
CREATE TABLE IF NOT EXISTS tenant_pricing (
  tenant_id TEXT PRIMARY KEY,
  price_per_minute REAL DEFAULT 0.02,
  price_per_ai_token REAL DEFAULT 0.00001,
  currency TEXT DEFAULT 'USD',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Refresh Tokens (Phase 12)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queues_tenant ON queues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant ON phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant ON calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_queue ON calls(queue_id);
CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_intent ON calls(intent);
CREATE INDEX IF NOT EXISTS idx_call_logs_call ON call_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant ON call_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant ON usage_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_session ON conversation_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_tenant ON conversation_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_handoff_tenant ON handoff_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_handoff_status ON handoff_queue(status);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Conversation Embeddings (Phase 15 — Vector RAG Memory)
CREATE TABLE IF NOT EXISTS conversation_embeddings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  embedding TEXT NOT NULL,
  content TEXT NOT NULL,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_tenant ON conversation_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_session ON conversation_embeddings(session_id);

-- Tenant Telephony Configuration (Phase 19 — Twilio Integration)
CREATE TABLE IF NOT EXISTS tenant_telephony (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT DEFAULT 'twilio' CHECK(provider IN ('twilio', 'sip')),
  account_sid TEXT NOT NULL DEFAULT '',
  auth_token_encrypted TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  twiml_app_sid TEXT,
  enabled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_telephony_tenant ON tenant_telephony(tenant_id);
CREATE INDEX IF NOT EXISTS idx_telephony_phone ON tenant_telephony(phone_number);

-- Audit log for security compliance
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  tenant_id TEXT,
  resource TEXT,
  detail TEXT,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Subscription Plans (Enterprise Onboarding)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_monthly REAL DEFAULT 0,
  price_yearly REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  max_minutes INTEGER DEFAULT 0,
  max_ai_tokens INTEGER DEFAULT 0,
  max_agents INTEGER DEFAULT 1,
  max_concurrent_calls INTEGER DEFAULT 1,
  features TEXT DEFAULT '{}',
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tenant Subscriptions (links tenant → plan → Stripe)
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT DEFAULT 'trialing' CHECK(status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start DATETIME,
  current_period_end DATETIME,
  trial_ends_at DATETIME,
  canceled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

-- Email Verification & Password Reset Tokens
CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('email_verify', 'password_reset')),
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON tenant_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_verification_token ON verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_verification_user ON verification_tokens(user_id);
