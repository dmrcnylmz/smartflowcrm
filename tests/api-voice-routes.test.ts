/**
 * API Voice Routes Tests — Health, Sentiment, Mock, WS-Proxy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Auth mock ──
const mockRequireStrictAuth = vi.fn();
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Sentiment mock ──
const mockAnalyzeSentiment = vi.fn();
const mockAnalyzeConversationSentiment = vi.fn();
const mockCreateConversationContext = vi.fn();
vi.mock('@/lib/voice/sentiment', () => ({
    analyzeSentiment: (...args: unknown[]) => mockAnalyzeSentiment(...args),
    analyzeConversationSentiment: (...args: unknown[]) => mockAnalyzeConversationSentiment(...args),
    createConversationContext: (...args: unknown[]) => mockCreateConversationContext(...args),
}));

// ── Error handler mock ──
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((err: unknown) => {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }),
}));

// ── Circuit breaker mocks ──
const mockGpuCircuitBreaker = {
    isOpen: vi.fn(() => false),
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({ totalRequests: 10, failures: 0 })),
};
const mockOpenaiCircuitBreaker = {
    isOpen: vi.fn(() => false),
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({})),
};
const mockCartesiaCircuitBreaker = {
    isOpen: vi.fn(() => false),
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({})),
};
const mockGroqCircuitBreaker = {
    isOpen: vi.fn(() => false),
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({})),
};
const mockGeminiCircuitBreaker = {
    isOpen: vi.fn(() => false),
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({})),
};

vi.mock('@/lib/voice/circuit-breaker', () => ({
    gpuCircuitBreaker: mockGpuCircuitBreaker,
    openaiCircuitBreaker: mockOpenaiCircuitBreaker,
    cartesiaCircuitBreaker: mockCartesiaCircuitBreaker,
    groqCircuitBreaker: mockGroqCircuitBreaker,
    geminiCircuitBreaker: mockGeminiCircuitBreaker,
}));

// ── GPU Manager mock ──
const mockGpuManager = {
    getMockHealth: vi.fn(() => ({ gpu_name: 'Mock GPU', latency_ms: 0 })),
    checkHealth: vi.fn(),
    getStatus: vi.fn(() => ({ metrics: { requestCount: 5 } })),
};
vi.mock('@/lib/voice/gpu-manager', () => ({ gpuManager: mockGpuManager }));

// ── Logging mock ──
vi.mock('@/lib/voice/logging', () => ({
    voiceLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    metrics: { observe: vi.fn(), set: vi.fn(), increment: vi.fn() },
    METRICS: {
        API_LATENCY: 'api_latency',
        SESSIONS_ACTIVE: 'sessions_active',
        API_ERRORS: 'api_errors',
        API_REQUESTS: 'api_requests',
    },
}));

// ── Cache mock ──
vi.mock('@/lib/voice/response-cache', () => ({
    inferCache: { getStats: vi.fn(() => ({ hits: 10, misses: 5 })) },
    ttsCache: { getStats: vi.fn(() => ({ hits: 8, misses: 3 })) },
}));

// ── LLM config mocks ──
const mockIsGroqConfigured = vi.fn(() => true);
const mockIsGeminiConfigured = vi.fn(() => true);
vi.mock('@/lib/ai/groq-client', () => ({
    isGroqConfigured: () => mockIsGroqConfigured(),
}));
vi.mock('@/lib/ai/gemini-client', () => ({
    isGeminiConfigured: () => mockIsGeminiConfigured(),
}));

// ── Global fetch mock for ws-proxy ──
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ====================================================================
// VOICE HEALTH TESTS
// ====================================================================

describe('voice/health', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        // Default: mock mode enabled, OpenAI available
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.PERSONAPLEX_API_KEY = '';
        process.env.PERSONAPLEX_MOCK_MODE = 'true';

        // Reset circuit breaker defaults
        mockGpuCircuitBreaker.isOpen.mockReturnValue(false);
        mockOpenaiCircuitBreaker.isOpen.mockReturnValue(false);
        mockGroqCircuitBreaker.isOpen.mockReturnValue(false);
        mockGeminiCircuitBreaker.isOpen.mockReturnValue(false);
        mockIsGroqConfigured.mockReturnValue(true);
        mockIsGeminiConfigured.mockReturnValue(true);
    });

    it('mock mode returns healthy with text-only mode when LLM available', async () => {
        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('healthy');
        expect(data.personaplex).toBe(false);
        expect(data.mode).toBe('text-only');
        expect(data.model_loaded).toBe(false);
    });

    it('mock mode returns mock when no LLM provider available', async () => {
        process.env.OPENAI_API_KEY = '';
        mockIsGroqConfigured.mockReturnValue(false);
        mockIsGeminiConfigured.mockReturnValue(false);

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('healthy');
        expect(data.personaplex).toBe(false);
        expect(data.mode).toBe('mock');
    });

    it('GPU healthy returns live mode with personaplex=true', async () => {
        process.env.PERSONAPLEX_API_KEY = 'test-gpu-key';
        process.env.PERSONAPLEX_MOCK_MODE = 'false';

        mockGpuManager.checkHealth.mockResolvedValue({
            status: 'healthy',
            model_loaded: true,
            gpu_name: 'NVIDIA A100',
            gpu_memory_gb: 40,
            active_sessions: 2,
            max_sessions: 4,
            uptime_seconds: 3600,
            latency_ms: 50,
            cached: false,
        });

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('healthy');
        expect(data.personaplex).toBe(true);
        expect(data.mode).toBe('live');
        expect(data.gpu).toBe('NVIDIA A100');
        expect(data.model_loaded).toBe(true);
    });

    it('GPU unhealthy but LLM available returns status healthy', async () => {
        process.env.PERSONAPLEX_API_KEY = 'test-gpu-key';
        process.env.PERSONAPLEX_MOCK_MODE = 'false';

        mockGpuManager.checkHealth.mockResolvedValue({
            status: 'sleeping',
            model_loaded: false,
            gpu_name: null,
            active_sessions: 0,
            max_sessions: 0,
            cached: false,
        });

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('healthy');
        expect(data.personaplex).toBe(false);
        expect(data.mode).toBe('text-only');
    });

    it('GPU unhealthy and no LLM returns degraded', async () => {
        process.env.PERSONAPLEX_API_KEY = 'test-gpu-key';
        process.env.PERSONAPLEX_MOCK_MODE = 'false';
        process.env.OPENAI_API_KEY = '';
        mockIsGroqConfigured.mockReturnValue(false);
        mockIsGeminiConfigured.mockReturnValue(false);

        mockGpuManager.checkHealth.mockResolvedValue({
            status: 'sleeping',
            model_loaded: false,
            gpu_name: null,
            active_sessions: 0,
            max_sessions: 0,
            cached: false,
        });

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('degraded');
        expect(data.personaplex).toBe(false);
        expect(data.mode).toBe('degraded');
    });

    it('includes capabilities in response', async () => {
        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.capabilities).toBeDefined();
        expect(typeof data.capabilities.gpu).toBe('boolean');
        expect(typeof data.capabilities.openai).toBe('boolean');
        expect(typeof data.capabilities.groq).toBe('boolean');
        expect(typeof data.capabilities.gemini).toBe('boolean');
    });

    it('includes circuit breaker states and cache stats for live mode', async () => {
        process.env.PERSONAPLEX_API_KEY = 'test-gpu-key';
        process.env.PERSONAPLEX_MOCK_MODE = 'false';

        mockGpuManager.checkHealth.mockResolvedValue({
            status: 'healthy',
            model_loaded: true,
            gpu_name: 'NVIDIA A100',
            gpu_memory_gb: 40,
            active_sessions: 1,
            max_sessions: 4,
            uptime_seconds: 1000,
            latency_ms: 30,
            cached: false,
        });

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.system).toBeDefined();
        expect(data.system.circuitBreakers).toBeDefined();
        expect(data.system.circuitBreakers.gpu).toBe('CLOSED');
        expect(data.system.circuitBreakers.openai).toBe('CLOSED');
        expect(data.system.circuitBreakers.groq).toBe('CLOSED');
        expect(data.system.circuitBreakers.gemini).toBe('CLOSED');
        expect(data.system.circuitBreakers.cartesia).toBe('CLOSED');
        expect(data.system.cache).toBeDefined();
        expect(data.system.cache.infer).toBeDefined();
        expect(data.system.cache.tts).toBeDefined();
    });

    it('mock mode via ?mock=true query param returns mock response', async () => {
        // Even if ENABLE_MOCK is false, ?mock=true should trigger mock path
        process.env.PERSONAPLEX_API_KEY = 'test-gpu-key';
        process.env.PERSONAPLEX_MOCK_MODE = 'false';

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health?mock=true');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('healthy');
        expect(data.personaplex).toBe(false);
        expect(data.model_loaded).toBe(false);
        expect(data.active_sessions).toBe(0);
    });

    it('GPU check throws returns healthy with LLM fallback', async () => {
        process.env.PERSONAPLEX_API_KEY = 'test-gpu-key';
        process.env.PERSONAPLEX_MOCK_MODE = 'false';

        mockGpuManager.checkHealth.mockRejectedValue(new Error('Connection refused'));

        const { GET } = await import('@/app/api/voice/health/route');
        const req = new NextRequest('http://localhost/api/voice/health');
        const res = await GET(req);
        const data = await res.json();

        expect(data.status).toBe('healthy');
        expect(data.personaplex).toBe(false);
        expect(data.mode).toBe('text-only');
        expect(data.capabilities).toBeDefined();
    });
});

// ====================================================================
// VOICE SENTIMENT TESTS
// ====================================================================

describe('voice/sentiment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    it('single text analysis returns sentiment', async () => {
        mockAnalyzeSentiment.mockReturnValue({
            score: 0.5,
            label: 'positive',
            signals: { keyword: 0.6, punctuation: 0, turnLength: 0.1, repetition: 0 },
            shouldEscalate: false,
        });

        const { POST } = await import('@/app/api/voice/sentiment/route');
        const req = new NextRequest('http://localhost/api/voice/sentiment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token',
            },
            body: JSON.stringify({ text: 'harika bir hizmet' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.sentiment).toBeDefined();
        expect(data.sentiment.score).toBe(0.5);
        expect(data.sentiment.label).toBe('positive');
        expect(data.conversationContext).toBeUndefined();
    });

    it('conversation context analysis returns updated context', async () => {
        mockAnalyzeConversationSentiment.mockReturnValue({
            result: {
                score: -0.3,
                label: 'negative',
                signals: { keyword: -0.5, punctuation: -0.1, turnLength: 0, repetition: 0 },
                shouldEscalate: false,
            },
            updatedContext: {
                turns: ['sorun var'],
                averageSentiment: -0.09,
                negativeStreak: 1,
            },
        });

        const { POST } = await import('@/app/api/voice/sentiment/route');
        const req = new NextRequest('http://localhost/api/voice/sentiment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token',
            },
            body: JSON.stringify({
                text: 'sorun var',
                conversationContext: {
                    turns: [],
                    averageSentiment: 0,
                    negativeStreak: 0,
                },
            }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.sentiment).toBeDefined();
        expect(data.sentiment.label).toBe('negative');
        expect(data.conversationContext).toBeDefined();
        expect(data.conversationContext.negativeStreak).toBe(1);
    });

    it('missing text returns 400', async () => {
        const { POST } = await import('@/app/api/voice/sentiment/route');
        const req = new NextRequest('http://localhost/api/voice/sentiment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token',
            },
            body: JSON.stringify({}),
        });
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('text');
    });

    it('auth failure returns 401', async () => {
        mockRequireStrictAuth.mockResolvedValueOnce({
            error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        });

        const { POST } = await import('@/app/api/voice/sentiment/route');
        const req = new NextRequest('http://localhost/api/voice/sentiment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'hello' }),
        });
        const res = await POST(req);

        expect(res.status).toBe(401);
    });

    it('handles sentiment with turns and averageSentiment in context', async () => {
        mockAnalyzeConversationSentiment.mockReturnValue({
            result: {
                score: -0.6,
                label: 'very_negative',
                signals: { keyword: -0.8, punctuation: -0.2, turnLength: -0.2, repetition: -0.2 },
                shouldEscalate: true,
                suggestedAction: 'Escalate to manager',
            },
            updatedContext: {
                turns: ['sorun', 'hala cevap yok', 'berbat'],
                averageSentiment: -0.45,
                negativeStreak: 3,
            },
        });

        const { POST } = await import('@/app/api/voice/sentiment/route');
        const req = new NextRequest('http://localhost/api/voice/sentiment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token',
            },
            body: JSON.stringify({
                text: 'berbat',
                conversationContext: {
                    turns: ['sorun', 'hala cevap yok'],
                    averageSentiment: -0.3,
                    negativeStreak: 2,
                },
            }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.sentiment.shouldEscalate).toBe(true);
        expect(data.conversationContext.negativeStreak).toBe(3);
        expect(data.conversationContext.averageSentiment).toBe(-0.45);
    });

    it('returns proper structure for single analysis', async () => {
        mockAnalyzeSentiment.mockReturnValue({
            score: 0,
            label: 'neutral',
            signals: { keyword: 0, punctuation: 0, turnLength: 0, repetition: 0 },
            shouldEscalate: false,
        });

        const { POST } = await import('@/app/api/voice/sentiment/route');
        const req = new NextRequest('http://localhost/api/voice/sentiment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token',
            },
            body: JSON.stringify({ text: 'bilgi almak istiyorum' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toHaveProperty('sentiment');
        expect(data.sentiment).toHaveProperty('score');
        expect(data.sentiment).toHaveProperty('label');
        expect(data.sentiment).toHaveProperty('signals');
        expect(data.sentiment).toHaveProperty('shouldEscalate');
    });
});

// ====================================================================
// VOICE MOCK TESTS
// ====================================================================

describe('voice/mock', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET health action returns mock health status', async () => {
        const { GET } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock?action=health');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.status).toBe('healthy');
        expect(data.model_loaded).toBe(true);
        expect(data.mode).toBe('mock');
        expect(data.gpu_name).toContain('Mock');
    });

    it('GET personas action returns persona list', async () => {
        const { GET } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock?action=personas');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.personas).toBeDefined();
        expect(Array.isArray(data.personas)).toBe(true);
        expect(data.personas.length).toBeGreaterThanOrEqual(3);
        expect(data.personas[0]).toHaveProperty('id');
        expect(data.personas[0]).toHaveProperty('name');
        expect(data.personas[0]).toHaveProperty('style');
    });

    it('GET status action returns availability', async () => {
        const { GET } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock?action=status');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.available).toBe(true);
        expect(data.mode).toBe('mock');
    });

    it('GET invalid action returns 400', async () => {
        const { GET } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock?action=invalid_stuff');
        const res = await GET(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBeDefined();
    });

    it('POST infer with complaint keyword returns complaint intent', async () => {
        const { POST } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'bir \u015fikayet iletmek istiyorum', action: 'infer' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.intent).toBe('complaint');
        expect(data.confidence).toBeGreaterThan(0.5);
    });

    it('POST infer with unknown text returns unknown intent', async () => {
        const { POST } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'asdfghjkl', action: 'infer' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.intent).toBe('unknown');
        expect(data.confidence).toBe(0.60);
    });

    it('POST infer action matches Turkish keywords', async () => {
        const { POST } = await import('@/app/api/voice/mock/route');

        // Test "randevu" keyword -> appointment intent
        const req = new NextRequest('http://localhost/api/voice/mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'randevu almak istiyorum', action: 'infer' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.intent).toBe('appointment');
        expect(data.mode).toBe('mock');
        expect(data.session_id).toContain('mock_');
        expect(data.confidence).toBeGreaterThan(0.5);
    });

    it('POST save action returns success with mock call log ID', async () => {
        const { POST } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', text: 'session data' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.callLogId).toContain('mock_call_');
        expect(data.mode).toBe('mock');
    });

    it('POST invalid action returns 400', async () => {
        const { POST } = await import('@/app/api/voice/mock/route');
        const req = new NextRequest('http://localhost/api/voice/mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'nonexistent', text: 'test' }),
        });
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBeDefined();
    });
});

// ====================================================================
// VOICE WS-PROXY TESTS
// ====================================================================

describe('voice/ws-proxy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.PERSONAPLEX_URL = 'http://gpu-server:8998';
        process.env.PERSONAPLEX_API_KEY = 'test-api-key';
    });

    it('JSON content type proxies to command endpoint', async () => {
        mockFetch.mockResolvedValueOnce({
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ session_id: 'sess-1', status: 'ok' }),
        });

        const { POST } = await import('@/app/api/voice/ws-proxy/route');
        const req = new NextRequest('http://localhost/api/voice/ws-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'start_session', persona: 'default' }),
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.session_id).toBe('sess-1');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('/api/voice/command');
    });

    it('binary content type proxies to audio endpoint', async () => {
        const audioResponseBuffer = new ArrayBuffer(16);
        mockFetch.mockResolvedValueOnce({
            headers: new Headers({ 'content-type': 'application/octet-stream' }),
            arrayBuffer: async () => audioResponseBuffer,
        });

        const { POST } = await import('@/app/api/voice/ws-proxy/route');
        const audioData = new Uint8Array([1, 2, 3, 4]);
        const req = new NextRequest('http://localhost/api/voice/ws-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: audioData,
        });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/octet-stream');

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('/api/voice/audio');
    });

    it('includes x-session-id header in upstream request', async () => {
        mockFetch.mockResolvedValueOnce({
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ ok: true }),
        });

        const { POST } = await import('@/app/api/voice/ws-proxy/route');
        const req = new NextRequest('http://localhost/api/voice/ws-proxy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-session-id': 'my-session-123',
            },
            body: JSON.stringify({ command: 'ping' }),
        });
        await POST(req);

        const fetchCall = mockFetch.mock.calls[0];
        const sentHeaders = fetchCall[1].headers;
        expect(sentHeaders['X-Session-Id']).toBe('my-session-123');
    });

    it('includes X-API-Key header when PERSONAPLEX_API_KEY is set', async () => {
        mockFetch.mockResolvedValueOnce({
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ ok: true }),
        });

        const { POST } = await import('@/app/api/voice/ws-proxy/route');
        const req = new NextRequest('http://localhost/api/voice/ws-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'end_session' }),
        });
        await POST(req);

        const fetchCall = mockFetch.mock.calls[0];
        const sentHeaders = fetchCall[1].headers;
        expect(sentHeaders['X-API-Key']).toBe('test-api-key');
    });

    it('audio endpoint returns JSON when upstream responds with JSON', async () => {
        mockFetch.mockResolvedValueOnce({
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ transcription: 'merhaba', confidence: 0.95 }),
        });

        const { POST } = await import('@/app/api/voice/ws-proxy/route');
        const audioData = new Uint8Array([10, 20, 30]);
        const req = new NextRequest('http://localhost/api/voice/ws-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: audioData,
        });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.transcription).toBe('merhaba');
    });

    it('handles upstream error gracefully', async () => {
        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const { POST } = await import('@/app/api/voice/ws-proxy/route');
        const req = new NextRequest('http://localhost/api/voice/ws-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'start_session' }),
        });
        const res = await POST(req);

        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toBeDefined();
    });
});
