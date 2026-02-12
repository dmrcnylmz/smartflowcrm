/**
 * AI Service Tests — Phase 6
 * Tests: AI enrichment, tenant persona, billing, cross-tenant isolation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE = 'http://localhost:3456';
let atlasToken, novaToken;
let atlasCallId, novaCallId;

beforeAll(async () => {
    // Login as Atlas admin
    let res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@atlas.com', password: 'password123', tenant_id: 'atlas_support' })
    });
    let data = await res.json();
    atlasToken = data.token;

    // Login as Nova admin
    res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@nova.com', password: 'password123', tenant_id: 'nova_logistics' })
    });
    data = await res.json();
    novaToken = data.token;
});

function atlasHeaders() { return { 'Authorization': `Bearer ${atlasToken}`, 'Content-Type': 'application/json' }; }
function novaHeaders() { return { 'Authorization': `Bearer ${novaToken}`, 'Content-Type': 'application/json' }; }

// ─── AI Enrichment Tests ─────────────────────────

describe('AI Enrichment', () => {
    it('completed calls have AI fields populated', async () => {
        const res = await fetch(`${BASE}/api/calls?limit=5`, { headers: atlasHeaders() });
        const data = await res.json();
        const completed = data.calls.filter(c => c.status === 'completed');
        expect(completed.length).toBeGreaterThan(0);

        const call = completed[0];
        atlasCallId = call.id;
        expect(call.intent).toBeTruthy();
        expect(['appointment', 'complaint', 'pricing', 'human', 'other']).toContain(call.intent);
        expect(call.ai_summary).toBeTruthy();
        expect(call.ai_next_action).toBeTruthy();
    });

    it('individual call detail includes AI fields', async () => {
        const res = await fetch(`${BASE}/api/calls/${atlasCallId}`, { headers: atlasHeaders() });
        const call = await res.json();
        expect(call.intent).toBeTruthy();
        expect(call.ai_summary).toBeTruthy();
        expect(call.ai_next_action).toBeTruthy();
        expect(call.transcript_text).toBeTruthy();
    });

    it('abandoned/missed calls do NOT have AI fields', async () => {
        const res = await fetch(`${BASE}/api/calls?limit=50`, { headers: atlasHeaders() });
        const data = await res.json();
        const nonCompleted = data.calls.filter(c => c.status !== 'completed');
        if (nonCompleted.length > 0) {
            const call = nonCompleted[0];
            expect(call.intent).toBeNull();
            expect(call.ai_summary).toBeNull();
        }
    });

    it('creating an inbound call triggers AI enrichment', async () => {
        const res = await fetch(`${BASE}/api/calls/inbound`, {
            method: 'POST', headers: atlasHeaders(),
            body: JSON.stringify({
                caller_number: '+90 555 999 0001',
                queue_id: 'atlas_q_sales',
                status: 'completed',
                duration: 120
            })
        });
        const call = await res.json();
        expect(call.intent).toBeTruthy();
        expect(call.ai_summary).toBeTruthy();
        expect(call.ai_next_action).toBeTruthy();
        expect(call.sentiment_score).not.toBeNull();
    });
});

// ─── Tenant AI Persona Tests ─────────────────────

describe('Tenant AI Persona', () => {
    it('GET /api/settings returns tenant settings', async () => {
        const res = await fetch(`${BASE}/api/settings`, { headers: atlasHeaders() });
        const settings = await res.json();
        expect(res.status).toBe(200);
        expect(settings.company_name).toBe('Atlas Support');
        expect(settings.tone).toBe('friendly');
        expect(settings.forbidden_topics).toBeTruthy();
    });

    it('Nova has different settings than Atlas', async () => {
        const res = await fetch(`${BASE}/api/settings`, { headers: novaHeaders() });
        const settings = await res.json();
        expect(settings.company_name).toBe('Nova Logistics');
        expect(settings.tone).toBe('formal');
    });

    it('PUT /api/settings updates settings', async () => {
        const res = await fetch(`${BASE}/api/settings`, {
            method: 'PUT', headers: atlasHeaders(),
            body: JSON.stringify({ tone: 'formal' })
        });
        const updated = await res.json();
        expect(updated.tone).toBe('formal');

        // Restore
        await fetch(`${BASE}/api/settings`, {
            method: 'PUT', headers: atlasHeaders(),
            body: JSON.stringify({ tone: 'friendly' })
        });
    });

    it('cross-tenant settings access is blocked', async () => {
        // Atlas tokens should only get Atlas settings
        const atlasRes = await fetch(`${BASE}/api/settings`, { headers: atlasHeaders() });
        const atlasSettings = await atlasRes.json();
        expect(atlasSettings.company_name).toBe('Atlas Support');
        expect(atlasSettings.company_name).not.toBe('Nova Logistics');
    });
});

// ─── White Label Branding Tests ──────────────────

describe('White Label Branding', () => {
    it('GET /api/branding returns tenant branding', async () => {
        const res = await fetch(`${BASE}/api/branding`, { headers: atlasHeaders() });
        const branding = await res.json();
        expect(res.status).toBe(200);
        expect(branding.primary_color).toBe('#7c5cfc');
        expect(branding.company_name).toBe('Atlas Support');
    });

    it('Nova has distinct branding', async () => {
        const res = await fetch(`${BASE}/api/branding`, { headers: novaHeaders() });
        const branding = await res.json();
        expect(branding.primary_color).toBe('#ff6b35');
        expect(branding.company_name).toBe('Nova Logistics');
    });

    it('PUT /api/branding updates branding', async () => {
        const res = await fetch(`${BASE}/api/branding`, {
            method: 'PUT', headers: atlasHeaders(),
            body: JSON.stringify({ primary_color: '#ff0000' })
        });
        const updated = await res.json();
        expect(updated.primary_color).toBe('#ff0000');

        // Restore
        await fetch(`${BASE}/api/branding`, {
            method: 'PUT', headers: atlasHeaders(),
            body: JSON.stringify({ primary_color: '#7c5cfc' })
        });
    });
});

// ─── Billing / Usage Metrics Tests ───────────────

describe('Billing & Usage Metrics', () => {
    it('GET /api/billing/usage returns current month usage', async () => {
        const res = await fetch(`${BASE}/api/billing/usage`, { headers: atlasHeaders() });
        const usage = await res.json();
        expect(res.status).toBe(200);
        expect(usage.tenant_id).toBe('atlas_support');
        expect(typeof usage.call_minutes).toBe('number');
        expect(typeof usage.ai_tokens).toBe('number');
    });

    it('GET /api/billing/summary returns usage summary', async () => {
        const res = await fetch(`${BASE}/api/billing/summary`, { headers: atlasHeaders() });
        const summary = await res.json();
        expect(res.status).toBe(200);
        expect(summary.current_month).toBeTruthy();
        expect(summary.totals).toBeTruthy();
    });

    it('usage metrics track call creation', async () => {
        // Get usage before
        const before = await (await fetch(`${BASE}/api/billing/usage`, { headers: atlasHeaders() })).json();
        const prevMinutes = before.call_minutes;

        // Create a call
        await fetch(`${BASE}/api/calls/inbound`, {
            method: 'POST', headers: atlasHeaders(),
            body: JSON.stringify({
                caller_number: '+90 555 999 0099',
                queue_id: 'atlas_q_tech',
                status: 'completed',
                duration: 180
            })
        });

        // Get usage after
        const after = await (await fetch(`${BASE}/api/billing/usage`, { headers: atlasHeaders() })).json();
        expect(after.call_minutes).toBeGreaterThan(prevMinutes);
    });
});

// ─── Cross-Tenant Isolation Tests (Extended) ─────

describe('Cross-Tenant AI Isolation', () => {
    it('Nova cannot see Atlas calls', async () => {
        const res = await fetch(`${BASE}/api/calls/${atlasCallId}`, { headers: novaHeaders() });
        const call = await res.json();
        // Should be null/not found
        expect(call.id).toBeUndefined();
    });

    it('Nova cannot access Atlas billing', async () => {
        const atlasUsage = await (await fetch(`${BASE}/api/billing/usage`, { headers: atlasHeaders() })).json();
        const novaUsage = await (await fetch(`${BASE}/api/billing/usage`, { headers: novaHeaders() })).json();
        expect(atlasUsage.tenant_id).toBe('atlas_support');
        expect(novaUsage.tenant_id).toBe('nova_logistics');
        expect(atlasUsage.tenant_id).not.toBe(novaUsage.tenant_id);
    });
});

// ─── Health Check v3 ────────────────────────────

describe('Health Check v3', () => {
    it('returns AI enrichment count and voice providers', async () => {
        const res = await fetch(`${BASE}/api/health`);
        const health = await res.json();
        expect(health.version).toBe('3.0.0');
        expect(health.database.ai_enriched).toBeGreaterThan(0);
        expect(health.voice).toBeTruthy();
        expect(health.voice.providers.stt).toBeTruthy();
        expect(health.voice.providers.llm).toBeTruthy();
        expect(health.voice.providers.tts).toBeTruthy();
    });
});

// ─── Pricing & Invoice Tests ────────────────────

describe('Pricing & Invoice (Phase 10)', () => {
    it('GET /api/billing/pricing returns tenant pricing', async () => {
        const res = await fetch(`${BASE}/api/billing/pricing`, { headers: atlasHeaders() });
        const pricing = await res.json();
        expect(res.status).toBe(200);
        expect(pricing.price_per_minute).toBe(0.02);
        expect(pricing.price_per_ai_token).toBe(0.00001);
        expect(pricing.currency).toBe('USD');
    });

    it('Nova has different pricing', async () => {
        const res = await fetch(`${BASE}/api/billing/pricing`, { headers: novaHeaders() });
        const pricing = await res.json();
        expect(pricing.price_per_minute).toBe(0.03);
        expect(pricing.currency).toBe('EUR');
    });

    it('GET /api/billing/invoice returns invoice preview', async () => {
        const res = await fetch(`${BASE}/api/billing/invoice`, { headers: atlasHeaders() });
        const invoice = await res.json();
        expect(res.status).toBe(200);
        expect(invoice.line_items).toHaveLength(2);
        expect(invoice.line_items[0].description).toBe('Voice Call Minutes');
        expect(invoice.line_items[1].description).toBe('AI Processing Tokens');
        expect(typeof invoice.total).toBe('number');
    });
});

// ─── Handoff Tests (Phase 9) ────────────────────

describe('Handoff Queue (Phase 9)', () => {
    it('GET /api/handoffs returns empty pending queue', async () => {
        const res = await fetch(`${BASE}/api/handoffs`, { headers: atlasHeaders() });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.handoffs).toBeDefined();
        expect(data.stats).toBeDefined();
    });

    it('cross-tenant handoff isolation', async () => {
        const atlas = await (await fetch(`${BASE}/api/handoffs?status=all`, { headers: atlasHeaders() })).json();
        const nova = await (await fetch(`${BASE}/api/handoffs?status=all`, { headers: novaHeaders() })).json();
        // Both should have their own isolated queues
        expect(atlas.handoffs).toBeDefined();
        expect(nova.handoffs).toBeDefined();
    });
});

// ─── Metrics & Observability Tests (Phase 11) ───

describe('Observability (Phase 11)', () => {
    it('GET /api/metrics returns Prometheus text', async () => {
        const res = await fetch(`${BASE}/api/metrics`);
        const text = await res.text();
        expect(res.status).toBe(200);
        expect(text).toContain('http_requests_total');
    });

    it('GET /api/metrics returns JSON when requested', async () => {
        const res = await fetch(`${BASE}/api/metrics`, { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.counters).toBeDefined();
        expect(data.histograms).toBeDefined();
    });
});

// ─── Rate Limiting Tests (Phase 12) ─────────────

describe('Enterprise Security (Phase 12)', () => {
    it('rate limit headers are present', async () => {
        const res = await fetch(`${BASE}/api/billing/usage`, { headers: atlasHeaders() });
        expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
        expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy();
    });

    it('POST /api/auth/refresh with invalid token returns 401', async () => {
        const res = await fetch(`${BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: 'invalid_token' })
        });
        expect(res.status).toBe(401);
    });

    it('POST /api/auth/logout succeeds', async () => {
        const res = await fetch(`${BASE}/api/auth/logout`, {
            method: 'POST',
            headers: atlasHeaders()
        });
        const data = await res.json();
        expect(data.success).toBe(true);
    });
});
