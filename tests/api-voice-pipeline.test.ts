/**
 * API Voice Pipeline Tests — Session Management & Health
 *
 * Tests for:
 *   - POST /api/voice/pipeline  (start, text, validation, error handling)
 *   - GET  /api/voice/pipeline  (health check)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── VoicePipeline mock ──────────────────────────────────────────────────────
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockEndSession = vi.fn().mockResolvedValue(undefined);
const mockGetMetrics = vi.fn().mockReturnValue({
    totalTokens: 0,
    totalLatency: 0,
    requestCount: 0,
});

vi.mock('@/lib/voice/voice-pipeline', () => {
    return {
        VoicePipeline: class MockVoicePipeline {
            initialize = mockInitialize;
            endSession = mockEndSession;
            getMetrics = mockGetMetrics;
        },
    };
});

// ── Intent fast mock (used by action=text) ──────────────────────────────────
vi.mock('@/lib/ai/intent-fast', () => ({
    detectIntentFast: vi.fn().mockReturnValue({ intent: 'greeting', confidence: 0.9 }),
    shouldShortcut: vi.fn().mockReturnValue(false),
    getShortcutResponse: vi.fn().mockReturnValue('Shortcut response'),
}));

// ── Tenant config mock ──────────────────────────────────────────────────────
vi.mock('@/lib/tenant/config', () => ({
    getTenantConfig: vi.fn().mockResolvedValue({
        language: 'tr',
        agent: { name: 'Ayse' },
    }),
}));

// ── Response cache mock (used by action=text) ───────────────────────────────
vi.mock('@/lib/ai/response-cache', () => ({
    getResponseCache: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(null),
        set: vi.fn(),
    }),
    buildCacheKey: vi.fn().mockReturnValue('cache-key'),
}));

// ── Prompt builder mock ─────────────────────────────────────────────────────
vi.mock('@/lib/ai/prompt-builder', () => ({
    buildSystemPrompt: vi.fn().mockReturnValue('System prompt for testing'),
}));

// ── LLM streaming mock ─────────────────────────────────────────────────────
vi.mock('@/lib/ai/llm-streaming', () => {
    return {
        LLMStreaming: class MockLLMStreaming {
            streamCompletion() {
                return (async function* () {
                    yield 'Hello ';
                    yield 'world';
                })();
            }
        },
    };
});

// ── Helper ──────────────────────────────────────────────────────────────────
function buildRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest(new URL('http://localhost:3000/api/voice/pipeline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function buildInvalidJsonRequest(): NextRequest {
    return new NextRequest(new URL('http://localhost:3000/api/voice/pipeline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json {{{',
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/pipeline — Missing API Keys
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/pipeline — Config Validation', () => {
    const savedOpenAI = process.env.OPENAI_API_KEY;
    const savedCartesia = process.env.CARTESIA_API_KEY;
    const savedDeepgram = process.env.DEEPGRAM_API_KEY;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        // Clear API keys to test missing config
        delete process.env.OPENAI_API_KEY;
        delete process.env.CARTESIA_API_KEY;
        delete process.env.DEEPGRAM_API_KEY;
    });

    afterEach(() => {
        // Restore original env
        if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
        else delete process.env.OPENAI_API_KEY;
        if (savedCartesia) process.env.CARTESIA_API_KEY = savedCartesia;
        else delete process.env.CARTESIA_API_KEY;
        if (savedDeepgram) process.env.DEEPGRAM_API_KEY = savedDeepgram;
        else delete process.env.DEEPGRAM_API_KEY;
    });

    it('should return 503 when required API keys are missing', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({ action: 'start' });

        const res = await POST(req);
        expect(res.status).toBe(503);

        const body = await res.json();
        expect(body.error).toContain('not configured');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/voice/pipeline — With Valid Config
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/voice/pipeline — Actions', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.CARTESIA_API_KEY = 'test-cartesia-key';
        process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
        mockInitialize.mockResolvedValue(undefined);
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CARTESIA_API_KEY;
        delete process.env.DEEPGRAM_API_KEY;
    });

    it('should return 400 for invalid JSON body', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildInvalidJsonRequest();

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Invalid JSON');
    });

    it('should start a pipeline session successfully', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({ action: 'start', tenantId: 'tenant-123' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.sessionId).toBeDefined();
        expect(body.tenantId).toBe('tenant-123');
        expect(body.capabilities).toBeDefined();
        expect(body.capabilities.stt).toBe(true);
        expect(body.capabilities.llm).toBe(true);
        expect(body.capabilities.tts).toBe(true);
        expect(mockInitialize).toHaveBeenCalled();
    });

    it('should use default tenantId when not provided', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({ action: 'start' });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.tenantId).toBe('default');
    });

    it('should return 500 when pipeline initialization fails', async () => {
        mockInitialize.mockRejectedValue(new Error('WebSocket connection failed'));

        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({ action: 'start', tenantId: 'tenant-123' });

        const res = await POST(req);
        expect(res.status).toBe(500);

        const body = await res.json();
        expect(body.error).toContain('Failed to initialize');
        expect(body.details).toContain('WebSocket connection failed');
    });

    it('should return 400 for action=text when text is missing', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({ action: 'text', tenantId: 'tenant-123' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Missing text');
    });

    it('should return 400 for unknown action', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({ action: 'invalid_action', tenantId: 'tenant-123' });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Unknown action');
    });

    it('should process text action with full LLM pipeline', async () => {
        const { POST } = await import('@/app/api/voice/pipeline/route');
        const req = buildRequest({
            action: 'text',
            text: 'Merhaba, randevu almak istiyorum',
            tenantId: 'tenant-123',
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.sessionId).toBeDefined();
        expect(body.intent).toBeDefined();
        expect(body.response).toBeDefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/voice/pipeline — Health Check
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/voice/pipeline — Health Check', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('should return health status with provider info when configured', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.CARTESIA_API_KEY = 'test-cartesia-key';
        process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';

        const { GET } = await import('@/app/api/voice/pipeline/route');

        const res = await GET();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(body.pipeline).toBeDefined();
        expect(body.pipeline.configured).toBe(true);
        expect(body.pipeline.providers.stt).toContain('deepgram');
        expect(body.pipeline.providers.llm).toContain('gpt');
        expect(body.pipeline.providers.tts).toContain('cartesia');
        expect(body.timestamp).toBeDefined();

        delete process.env.OPENAI_API_KEY;
        delete process.env.CARTESIA_API_KEY;
        delete process.env.DEEPGRAM_API_KEY;
    });

    it('should report not-configured when API keys are missing', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CARTESIA_API_KEY;
        delete process.env.DEEPGRAM_API_KEY;

        const { GET } = await import('@/app/api/voice/pipeline/route');

        const res = await GET();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(body.pipeline.configured).toBe(false);
        expect(body.pipeline.providers.llm).toBe('not-configured');
        expect(body.pipeline.providers.tts).toBe('not-configured');
    });
});
