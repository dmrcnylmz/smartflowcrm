/**
 * Enterprise Features Test Suite — Phases 13–18
 * 
 * Tests latency tracking, LLM routing, cost control,
 * circuit breaker, PII redaction, and embedding service.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

let latencyTracker, llmRouter, costControl, piiRedactor, embeddingService;
let CircuitBreaker, getBreaker, resetBreaker, STATE;

beforeAll(async () => {
    const { seed } = require('../src/seed/run-seed');
    await seed();

    latencyTracker = require('../src/services/latency-tracker');
    llmRouter = require('../src/services/llm-router');
    costControl = require('../src/services/cost-control');
    piiRedactor = require('../src/services/pii-redactor');

    const cb = require('../src/utils/circuit-breaker');
    CircuitBreaker = cb.CircuitBreaker;
    getBreaker = cb.getBreaker;
    resetBreaker = cb.resetBreaker;
    STATE = cb.STATE;

    try {
        embeddingService = require('../src/services/embedding.service');
    } catch (e) { /* optional */ }
});

// ─── Phase 13: Latency Tracker ───────────────────────────

describe('Latency Tracker', () => {
    beforeEach(() => {
        latencyTracker.reset();
    });

    it('should create a pipeline trace', () => {
        const trace = latencyTracker.createTrace('sess1', 'tenant1');
        expect(trace).toBeDefined();
        expect(trace.sessionId).toBe('sess1');
        expect(trace.tenantId).toBe('tenant1');
    });

    it('should track stage durations', () => {
        const trace = latencyTracker.createTrace('sess2', 'tenant1');
        trace.startStage('llm');
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 100000; i++) sum += i;
        const duration = trace.endStage('llm');
        expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should finalize trace with all metrics', () => {
        const trace = latencyTracker.createTrace('sess3', 'tenant1');
        trace.startStage('stt');
        trace.endStage('stt');
        trace.startStage('llm');
        trace.endStage('llm');
        trace.markFirstByte();
        trace.startStage('tts');
        trace.endStage('tts');

        const result = trace.finalize();
        expect(result).toHaveProperty('stt_ms');
        expect(result).toHaveProperty('llm_ms');
        expect(result).toHaveProperty('tts_ms');
        expect(result).toHaveProperty('total_ms');
        expect(result).toHaveProperty('first_byte_ms');
        expect(result.total_ms).toBeGreaterThanOrEqual(0);
    });

    it('should compute stats from samples', () => {
        // Generate some samples
        for (let i = 0; i < 10; i++) {
            const trace = latencyTracker.createTrace(`sess-${i}`, 'tenant1');
            trace.startStage('llm');
            trace.endStage('llm');
            trace.finalize();
        }

        const stats = latencyTracker.getStats(60000);
        expect(stats.count).toBe(10);
        expect(stats.total).toHaveProperty('avg');
        expect(stats.total).toHaveProperty('p50');
        expect(stats.total).toHaveProperty('p95');
        expect(stats.target_hit_rate).toHaveProperty('e2e_600ms');
    });

    it('should return recent samples', () => {
        for (let i = 0; i < 5; i++) {
            const trace = latencyTracker.createTrace(`s-${i}`, 'tenant1');
            trace.finalize();
        }
        const samples = latencyTracker.getRecentSamples(3);
        expect(samples.length).toBe(3);
    });
});

// ─── Phase 14: LLM Router ───────────────────────────────

describe('LLM Router', () => {
    it('should route simple intents to local engine', async () => {
        const chunks = [];
        const result = await llmRouter.route(
            'Hello, I need help',
            { company_name: 'TestCo', tenant_id: 'atlas_support' },
            '',
            (text) => chunks.push(text),
            'en'
        );

        expect(result).toHaveProperty('response');
        expect(result).toHaveProperty('provider');
        expect(result).toHaveProperty('routeReason');
        expect(chunks.length).toBeGreaterThan(0);
    });

    it('should detect simple intent for appointment', async () => {
        const result = await llmRouter.route(
            'I want to schedule an appointment',
            { company_name: 'TestCo', tenant_id: 'atlas_support' },
            '',
            () => { },
            'en'
        );
        expect(['simple_intent:appointment', 'default_local'].some(r => result.routeReason.includes(r) || r === result.routeReason)).toBe(true);
    });

    it('should provide routing stats', () => {
        const stats = llmRouter.getStats();
        expect(stats).toHaveProperty('local_routes');
        expect(stats).toHaveProperty('openai_routes');
        expect(stats).toHaveProperty('successes');
        expect(stats).toHaveProperty('failures');
    });

    it('should honor forced local provider', async () => {
        const result = await llmRouter.route(
            'Complex technical question about APIs',
            { company_name: 'TestCo', tenant_id: 'atlas_support' },
            '',
            () => { },
            'en',
            { forceProvider: 'local' }
        );
        expect(result.provider).toBe('local');
        expect(result.routeReason).toBe('forced_local');
    });
});

// ─── Phase 16: Cost Control ──────────────────────────────

describe('Cost Control', () => {
    it('should check token budget', () => {
        const result = costControl.checkBudget('atlas_support', 'tokens');
        expect(result).toHaveProperty('allowed');
        expect(result).toHaveProperty('degraded');
        expect(result).toHaveProperty('exceeded');
        expect(result).toHaveProperty('reason');
        expect(result.allowed).toBe(true);
    });

    it('should check minute budget', () => {
        const result = costControl.checkBudget('atlas_support', 'minutes');
        expect(result).toHaveProperty('allowed');
        expect(result.allowed).toBe(true);
    });

    it('should return budget summary', () => {
        const summary = costControl.getBudgetSummary('atlas_support');
        expect(summary).toHaveProperty('tenantId', 'atlas_support');
        expect(summary).toHaveProperty('limits');
        expect(summary).toHaveProperty('usage');
        expect(summary).toHaveProperty('tokens');
        expect(summary).toHaveProperty('minutes');
    });

    it('should return friendly exceeded message in English', () => {
        const msg = costControl.getBudgetExceededMessage('en');
        expect(msg).toContain('usage limit');
    });

    it('should return friendly exceeded message in Turkish', () => {
        const msg = costControl.getBudgetExceededMessage('tr');
        expect(msg).toContain('limitinize');
    });

    it('should allow if no limits set', () => {
        const result = costControl.checkBudget('nonexistent_tenant', 'tokens');
        expect(result.allowed).toBe(true);
    });
});

// ─── Phase 17: Circuit Breaker ───────────────────────────

describe('Circuit Breaker', () => {
    it('should start in CLOSED state', () => {
        const breaker = new CircuitBreaker('test_provider');
        expect(breaker.state).toBe(STATE.CLOSED);
        expect(breaker.isAvailable()).toBe(true);
    });

    it('should open after failure threshold', () => {
        const breaker = new CircuitBreaker('test_open', { failureThreshold: 3 });
        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.state).toBe(STATE.CLOSED);
        breaker.recordFailure();
        expect(breaker.state).toBe(STATE.OPEN);
        expect(breaker.isAvailable()).toBe(false);
    });

    it('should transition to HALF_OPEN after reset timeout', () => {
        const breaker = new CircuitBreaker('test_half_open', {
            failureThreshold: 2,
            resetTimeout: 10 // 10ms for testing
        });
        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.state).toBe(STATE.OPEN);

        // Simulate timeout
        breaker.lastFailureTime = Date.now() - 20;
        expect(breaker.isAvailable()).toBe(true);
        expect(breaker.state).toBe(STATE.HALF_OPEN);
    });

    it('should close after success in HALF_OPEN', () => {
        const breaker = new CircuitBreaker('test_close', {
            failureThreshold: 2,
            resetTimeout: 10,
            successThresholdToClose: 1
        });
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.lastFailureTime = Date.now() - 20;
        breaker.isAvailable(); // transitions to HALF_OPEN
        breaker.recordSuccess();
        expect(breaker.state).toBe(STATE.CLOSED);
    });

    it('should execute with fallback', async () => {
        const breaker = new CircuitBreaker('test_execute', { failureThreshold: 1 });

        // First call fails
        const result = await breaker.execute(
            () => Promise.reject(new Error('fail')),
            () => Promise.resolve('fallback_value')
        );
        expect(result).toBe('fallback_value');
    });

    it('should use registry', () => {
        const b1 = getBreaker('registry_test');
        const b2 = getBreaker('registry_test');
        expect(b1).toBe(b2); // Same instance
    });

    it('should return status', () => {
        const breaker = new CircuitBreaker('status_test');
        const status = breaker.getStatus();
        expect(status).toHaveProperty('name', 'status_test');
        expect(status).toHaveProperty('state', 'closed');
        expect(status).toHaveProperty('failures', 0);
    });
});

// ─── Phase 18: PII Redactor ─────────────────────────────

describe('PII Redactor', () => {
    it('should redact email addresses', () => {
        const result = piiRedactor.redact('Contact me at john@example.com please');
        expect(result.redacted).toContain('[EMAIL_REDACTED]');
        expect(result.redacted).not.toContain('john@example.com');
        expect(result.totalRedactions).toBe(1);
        expect(result.findings[0].type).toBe('email');
    });

    it('should redact credit card numbers', () => {
        const result = piiRedactor.redact('My card is 4111-1111-1111-1111');
        expect(result.redacted).toContain('[CARD_REDACTED]');
        expect(result.redacted).not.toContain('4111');
        expect(result.totalRedactions).toBeGreaterThanOrEqual(1);
    });

    it('should redact multiple PII types', () => {
        const text = 'Email: alice@test.com, Card: 4111 1111 1111 1111';
        const result = piiRedactor.redact(text);
        expect(result.redacted).toContain('[EMAIL_REDACTED]');
        expect(result.redacted).toContain('[CARD_REDACTED]');
        expect(result.totalRedactions).toBeGreaterThanOrEqual(2);
    });

    it('should detect PII without redacting', () => {
        const result = piiRedactor.detect('My email is test@example.com');
        expect(result.hasPii).toBe(true);
        expect(result.types).toContain('email');
    });

    it('should return clean text unchanged', () => {
        const result = piiRedactor.redact('Hello, how can I help you?');
        expect(result.redacted).toBe('Hello, how can I help you?');
        expect(result.totalRedactions).toBe(0);
    });

    it('should handle empty/null input', () => {
        const result = piiRedactor.redact('');
        expect(result.redacted).toBe('');
        expect(result.totalRedactions).toBe(0);

        const result2 = piiRedactor.redact(null);
        expect(result2.totalRedactions).toBe(0);
    });

    it('should exclude specific PII types', () => {
        const text = 'Email: bob@test.com, IP: 192.168.1.1';
        const result = piiRedactor.redact(text, { exclude: ['ip_address'] });
        expect(result.redacted).toContain('[EMAIL_REDACTED]');
        expect(result.redacted).toContain('192.168.1.1');
    });

    it('should redact Turkish phone numbers', () => {
        const result = piiRedactor.redact('Call me at +90 532 123 45 67');
        expect(result.redacted).toContain('[PHONE_REDACTED]');
    });
});

// ─── Phase 15: Embedding Service ─────────────────────────

describe('Embedding Service', () => {
    it('should store and retrieve embeddings', async () => {
        if (!embeddingService) return;

        await embeddingService.storeEmbedding('emb-sess-1', 'atlas_support', 'I need help with an appointment');
        await embeddingService.storeEmbedding('emb-sess-1', 'atlas_support', 'What are your business hours?');

        const similar = await embeddingService.retrieveSimilar('atlas_support', 'schedule an appointment', 3);
        expect(Array.isArray(similar)).toBe(true);
    });

    it('should build RAG context string', async () => {
        if (!embeddingService) return;

        await embeddingService.storeEmbedding('rag-sess-1', 'atlas_support', 'Our pricing starts at $10/month');
        const context = await embeddingService.buildRagContext('atlas_support', 'How much does it cost?');
        expect(typeof context).toBe('string');
    });

    it('should return empty for unknown tenant', async () => {
        if (!embeddingService) return;

        const similar = await embeddingService.retrieveSimilar('unknown_tenant', 'test query');
        expect(similar.length).toBe(0);
    });
});
