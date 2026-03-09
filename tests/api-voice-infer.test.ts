/**
 * API Voice Infer Tests — Multi-LLM Intelligent Conversation
 *
 * Tests for:
 *   - POST /api/voice/infer  (validation, mock mode, fallback chain, cache, rate limit)
 *   - GET  /api/voice/infer  (status endpoint)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Error handler mock ──────────────────────────────────────────────────────
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockImplementation(() =>
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
    ),
}));

// ── Circuit breaker mocks ───────────────────────────────────────────────────
const mockGroqExecute = vi.fn();
const mockOpenaiExecute = vi.fn();
const mockGpuExecute = vi.fn();

vi.mock('@/lib/voice/circuit-breaker', () => ({
    openaiCircuitBreaker: {
        execute: (...args: unknown[]) => mockOpenaiExecute(...args),
        isOpen: vi.fn().mockReturnValue(false),
        getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
    },
    groqCircuitBreaker: {
        execute: (...args: unknown[]) => mockGroqExecute(...args),
        isOpen: vi.fn().mockReturnValue(false),
        getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
    },
    geminiCircuitBreaker: {
        isOpen: vi.fn().mockReturnValue(true),
        getStats: vi.fn().mockReturnValue({ state: 'open', failures: 10 }),
    },
    gpuCircuitBreaker: {
        execute: (...args: unknown[]) => mockGpuExecute(...args),
        isOpen: vi.fn().mockReturnValue(true),
        getStats: vi.fn().mockReturnValue({ state: 'open', failures: 5 }),
    },
}));

// ── Response cache mock ─────────────────────────────────────────────────────
const mockCacheGet = vi.fn().mockReturnValue(null);
const mockCacheSet = vi.fn();

vi.mock('@/lib/voice/response-cache', () => ({
    inferCache: {
        get: (...args: unknown[]) => mockCacheGet(...args),
        set: (...args: unknown[]) => mockCacheSet(...args),
        getStats: vi.fn().mockReturnValue({ hits: 10, misses: 50, size: 30 }),
        purgeExpired: vi.fn(),
    },
    buildInferCacheKey: vi.fn().mockReturnValue('test-cache-key'),
}));

// ── GPU manager mock ────────────────────────────────────────────────────────
vi.mock('@/lib/voice/gpu-manager', () => ({
    gpuManager: {
        ensureReady: vi.fn().mockResolvedValue(true),
        getStatus: vi.fn().mockReturnValue({ ready: false, lastCheck: null }),
    },
}));

// ── Groq client mock ────────────────────────────────────────────────────────
const mockGenerateGroqResponse = vi.fn();
const mockIsGroqConfigured = vi.fn().mockReturnValue(true);

vi.mock('@/lib/ai/groq-client', () => ({
    generateGroqResponse: (...args: unknown[]) => mockGenerateGroqResponse(...args),
    isGroqConfigured: () => mockIsGroqConfigured(),
}));

// ── Gemini client mock ──────────────────────────────────────────────────────
vi.mock('@/lib/ai/gemini-client', () => ({
    generateGeminiResponse: vi.fn(),
    isGeminiConfigured: vi.fn().mockReturnValue(false),
}));

// ── Metrics logger mock ─────────────────────────────────────────────────────
vi.mock('@/lib/billing/metrics-logger', () => ({
    metricsLogger: { logLlmMetric: vi.fn() },
}));

// ── Session registry mock ───────────────────────────────────────────────────
vi.mock('@/lib/voice/session-registry', () => ({
    sessionRegistry: { getTenant: vi.fn().mockReturnValue('default') },
}));

// ── Rate limit mock ─────────────────────────────────────────────────────────
const mockCheckRateLimit = vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 });
const mockRateLimitExceeded = vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 })
);

vi.mock('@/lib/voice/rate-limit', () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
    rateLimitExceeded: (...args: unknown[]) => mockRateLimitExceeded(...args),
    RATE_LIMITS: { inference: { maxRequests: 30, windowMs: 60000 } },
}));

// ── Helper ──────────────────────────────────────────────────────────────────
function buildRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest(new URL('http://localhost:3000/api/voice/infer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/infer — Validation
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/infer — Validation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 });
        delete process.env.PERSONAPLEX_MOCK_MODE;
    });

    it('should return 400 when text is missing', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Text is required');
    });

    it('should return 400 when text is empty string', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: '', persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Text is required');
    });

    it('should return 400 when text is whitespace only', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: '   ', persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Text is required');
    });

    it('should return 400 when text exceeds 2000 characters', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const longText = 'a'.repeat(2001);
        const req = buildRequest({ text: longText, persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('maximum length of 2000');
    });

    it('should return 400 for invalid persona', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Merhaba', persona: 'hacker', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Invalid persona');
    });

    it('should return 400 for invalid language', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Merhaba', persona: 'default', language: 'fr' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Invalid language');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/infer — Rate Limiting
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/infer — Rate Limiting', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        delete process.env.PERSONAPLEX_MOCK_MODE;
    });

    it('should return 429 when rate limit is exceeded', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetTime: Date.now() + 30000 });

        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Merhaba', persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(429);
        expect(mockRateLimitExceeded).toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/infer — Mock Mode
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/infer — Mock Mode', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.PERSONAPLEX_MOCK_MODE = 'true';
        mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 });
    });

    afterEach(() => {
        delete process.env.PERSONAPLEX_MOCK_MODE;
    });

    it('should detect greeting intent (Turkish)', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Merhaba', persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.intent).toBe('greeting');
        expect(body.source).toBe('mock-engine');
        expect(body.mode).toBe('mock');
        expect(body.response_text).toContain('Merhaba');
        expect(body.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect greeting intent (English)', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Hello there', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.intent).toBe('greeting');
        expect(body.source).toBe('mock-engine');
        expect(body.response_text).toContain('Hello');
    });

    it('should detect appointment intent', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'I need to schedule an appointment', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.intent).toBe('appointment');
        expect(body.source).toBe('mock-engine');
        expect(body.response_text).toBeDefined();
    });

    it('should detect complaint intent', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'I have a complaint about the service', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.intent).toBe('complaint');
        expect(body.source).toBe('mock-engine');
    });

    it('should return unknown intent for unrecognized input', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Some random text without keywords', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.source).toBe('mock-engine');
        expect(body.confidence).toBeLessThanOrEqual(0.7);
    });

    it('should track turn count in multi-turn session', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');

        const sessionId = `test-session-${Date.now()}`;

        // Turn 1
        const req1 = buildRequest({ text: 'Hello', persona: 'default', language: 'en', session_id: sessionId });
        const res1 = await POST(req1);
        const body1 = await res1.json();
        expect(body1.turn).toBe(1);

        // Turn 2
        const req2 = buildRequest({ text: 'I need an appointment', persona: 'default', language: 'en', session_id: sessionId });
        const res2 = await POST(req2);
        const body2 = await res2.json();
        expect(body2.turn).toBe(2);
    });

    it('should detect Turkish appointment intent', async () => {
        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Randevu almak istiyorum', persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.intent).toBe('appointment');
        expect(body.source).toBe('mock-engine');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/infer — Cache Hit
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/infer — Cache', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        delete process.env.PERSONAPLEX_MOCK_MODE;
        mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 });
    });

    it('should return cached response on cache hit', async () => {
        mockCacheGet.mockReturnValue({
            session_id: 'cached-session',
            intent: 'greeting',
            confidence: 0.95,
            response_text: 'Cached hello response',
            latency_ms: 5,
            source: 'groq-llama',
            cached: true,
        });

        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Hello', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.cached).toBe(true);
        expect(body.source).toBe('cache');
        expect(body.response_text).toBe('Cached hello response');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/infer — Fallback Chain (Groq → OpenAI → Graceful)
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/infer — Fallback Chain', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        delete process.env.PERSONAPLEX_MOCK_MODE;
        mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 });
        mockCacheGet.mockReturnValue(null);
        mockIsGroqConfigured.mockReturnValue(true);
    });

    it('should use Groq when configured and succeeds', async () => {
        mockGroqExecute.mockImplementation(async (fn: Function) => {
            mockGenerateGroqResponse.mockResolvedValue(
                'Hello! How can I help you? [INTENT:greeting CONFIDENCE:0.95]'
            );
            return fn();
        });

        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Hello', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.source).toBe('groq-llama');
        expect(body.intent).toBe('greeting');
        expect(body.confidence).toBe(0.95);
    });

    it('should fall through to OpenAI when Groq fails', async () => {
        // Groq fails
        mockGroqExecute.mockRejectedValue(new Error('Groq API timeout'));

        // OpenAI succeeds via global fetch mock
        const mockFetch = vi.spyOn(global, 'fetch');
        mockOpenaiExecute.mockImplementation(async (fn: Function) => {
            mockFetch.mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        choices: [{
                            message: {
                                content: 'Hi there! What can I do for you? [INTENT:greeting CONFIDENCE:0.9]',
                            },
                        }],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
            );
            return fn();
        });

        // Need OPENAI_API_KEY set
        const originalKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-openai-key';

        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Hello', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.source).toBe('openai-gpt');

        process.env.OPENAI_API_KEY = originalKey;
        mockFetch.mockRestore();
    });

    it('should return graceful fallback when all providers fail', async () => {
        // Groq fails
        mockGroqExecute.mockRejectedValue(new Error('Groq down'));

        // OpenAI circuit breaker is open
        const { openaiCircuitBreaker } = await import('@/lib/voice/circuit-breaker');
        vi.mocked(openaiCircuitBreaker.isOpen).mockReturnValue(true);

        // GPU circuit breaker is already open (from global mock)

        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Hello', persona: 'default', language: 'en' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.source).toBe('graceful-fallback');
        expect(body.intent).toBe('system_error');
        expect(body.confidence).toBe(1.0);
        expect(body.circuit_breaker).toBeDefined();
    });

    it('should return Turkish graceful fallback for language=tr', async () => {
        // All providers fail
        mockGroqExecute.mockRejectedValue(new Error('Groq down'));
        const { openaiCircuitBreaker } = await import('@/lib/voice/circuit-breaker');
        vi.mocked(openaiCircuitBreaker.isOpen).mockReturnValue(true);

        const { POST } = await import('@/app/api/voice/infer/route');
        const req = buildRequest({ text: 'Merhaba', persona: 'default', language: 'tr' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.source).toBe('graceful-fallback');
        // Turkish fallback message contains Turkish content
        expect(body.response_text).toContain('teknik sorun');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/voice/infer — Status Endpoint
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/voice/infer — Status', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('should return cache stats and circuit breaker info', async () => {
        const { GET } = await import('@/app/api/voice/infer/route');

        const res = await GET();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.cache).toBeDefined();
        expect(body.circuitBreakers).toBeDefined();
        expect(body.circuitBreakers.openai).toBeDefined();
        expect(body.circuitBreakers.groq).toBeDefined();
        expect(body.circuitBreakers.gemini).toBeDefined();
        expect(body.circuitBreakers.gpu).toBeDefined();
    });

    it('should return provider configuration status', async () => {
        const { GET } = await import('@/app/api/voice/infer/route');

        const res = await GET();
        const body = await res.json();

        expect(body.providers).toBeDefined();
        expect(body.providers.groq).toBeDefined();
        expect(body.providers.groq.role).toContain('primary');
        expect(body.providers.openai).toBeDefined();
        expect(body.providers.gemini).toBeDefined();
        expect(body.providers.gemini.role).toContain('DISABLED');
    });

    it('should return GPU status', async () => {
        const { GET } = await import('@/app/api/voice/infer/route');

        const res = await GET();
        const body = await res.json();

        expect(body.gpu).toBeDefined();
    });
});

// ── Import afterEach for cleanup ────────────────────────────────────────────
import { afterEach } from 'vitest';
