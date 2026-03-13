/**
 * API Voice Services Tests — Session, STT, TTS
 *
 * Tests for:
 *   - /api/voice/session (GET/POST)
 *   - /api/voice/stt (GET/POST)
 *   - /api/voice/tts (GET/POST)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnThis(),
        doc: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
}));

// ── Rate limiter mock ────────────────────────────────────────────────────────
vi.mock('@/lib/voice/rate-limit', () => ({
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 50, resetTime: Date.now() + 60000 }),
    RATE_LIMITS: {
        general: { maxRequests: 100, windowMs: 60000 },
        session: { maxRequests: 30, windowMs: 60000 },
        inference: { maxRequests: 30, windowMs: 60000 },
    },
    rateLimitExceeded: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
        })
    ),
}));

// ── Voice logging mock ───────────────────────────────────────────────────────
vi.mock('@/lib/voice/logging', () => ({
    voiceLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    metrics: { increment: vi.fn(), timing: vi.fn() },
    METRICS: {},
    withTiming: vi.fn((fn: Function) => fn()),
}));

// ── Circuit breaker mock ─────────────────────────────────────────────────────
const mockDeepgramCircuitBreaker = {
    isOpen: vi.fn().mockReturnValue(false),
    execute: vi.fn().mockImplementation((fn: Function) => fn()),
    getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
};

const mockCartesiaCircuitBreaker = {
    isOpen: vi.fn().mockReturnValue(false),
    execute: vi.fn().mockImplementation((fn: Function) => fn()),
    getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
};

const mockMurfCircuitBreaker = {
    isOpen: vi.fn().mockReturnValue(false),
    execute: vi.fn().mockImplementation((fn: Function) => fn()),
    getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
};

const mockKokoroCircuitBreaker = {
    isOpen: vi.fn().mockReturnValue(false),
    execute: vi.fn().mockImplementation((fn: Function) => fn()),
    getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
};

const mockOpenaiCircuitBreaker = {
    isOpen: vi.fn().mockReturnValue(false),
    execute: vi.fn().mockImplementation((fn: Function) => fn()),
    getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
};

const mockGoogleTtsCircuitBreaker = {
    isOpen: vi.fn().mockReturnValue(false),
    execute: vi.fn().mockImplementation((fn: Function) => fn()),
    getStats: vi.fn().mockReturnValue({ state: 'closed', failures: 0 }),
};

class MockCircuitOpenError extends Error {
    constructor() {
        super('Circuit breaker is open');
        this.name = 'CircuitOpenError';
    }
}

vi.mock('@/lib/voice/circuit-breaker', () => ({
    deepgramCircuitBreaker: mockDeepgramCircuitBreaker,
    cartesiaCircuitBreaker: mockCartesiaCircuitBreaker,
    murfCircuitBreaker: mockMurfCircuitBreaker,
    kokoroCircuitBreaker: mockKokoroCircuitBreaker,
    openaiCircuitBreaker: mockOpenaiCircuitBreaker,
    googleTtsCircuitBreaker: mockGoogleTtsCircuitBreaker,
    CircuitOpenError: MockCircuitOpenError,
}));

// ── Google Cloud TTS mock ───────────────────────────────────────────────────
vi.mock('@/lib/voice/tts-google', () => ({
    synthesizeGoogleTTS: vi.fn().mockResolvedValue(null), // Returns null by default (no credentials)
    getServiceAccountKey: vi.fn().mockReturnValue(null),   // No service account configured
}));

// ── Cartesia TTS mock ──────────────────────────────────────────────────────
const mockSynthesizeCartesiaTTS = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/voice/tts-cartesia', () => ({
    synthesizeCartesiaTTS: (...args: unknown[]) => mockSynthesizeCartesiaTTS(...args),
    isCartesiaConfigured: vi.fn().mockReturnValue(true),
}));

// ── Murf TTS mock ──────────────────────────────────────────────────────────
vi.mock('@/lib/voice/tts-murf', () => ({
    synthesizeMurfTTS: vi.fn().mockResolvedValue(null),
    isMurfConfigured: vi.fn().mockReturnValue(false),
}));

// ── Kokoro TTS mock ─────────────────────────────────────────────────────────
vi.mock('@/lib/voice/tts-kokoro', () => ({
    synthesizeKokoroTTS: vi.fn().mockResolvedValue(null),
    isKokoroConfigured: vi.fn().mockReturnValue(false),
}));

// ── Subscription guard mock ─────────────────────────────────────────────────
vi.mock('@/lib/billing/subscription-guard', () => ({
    checkSubscriptionActive: vi.fn().mockResolvedValue({ active: true, planId: 'standard' }),
}));

// ── Metrics logger mock ──────────────────────────────────────────────────────
vi.mock('@/lib/billing/metrics-logger', () => ({
    metricsLogger: { logSttMetric: vi.fn(), logTtsMetric: vi.fn() },
}));

// ── Session registry mock ────────────────────────────────────────────────────
vi.mock('@/lib/voice/session-registry', () => ({
    sessionRegistry: { getTenant: vi.fn().mockReturnValue('tenant-123') },
}));

// ── Error handler mock ───────────────────────────────────────────────────────
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    ),
}));

// ── Cost monitor mock ────────────────────────────────────────────────────────
const mockShouldUseEmergencyTts = vi.fn().mockResolvedValue(false);
vi.mock('@/lib/billing/cost-monitor', () => ({
    shouldUseEmergencyTts: (...args: unknown[]) => mockShouldUseEmergencyTts(...args),
    checkCostThresholds: vi.fn().mockResolvedValue(undefined),
}));

// ── Metering mock ────────────────────────────────────────────────────────────
vi.mock('@/lib/billing/metering', () => ({
    meterTtsUsage: vi.fn().mockResolvedValue(undefined),
}));

// ── Firebase DB mock (for session save — admin SDK) ──────────────────────────
const mockAddCallLog = vi.fn().mockResolvedValue({ id: 'call-log-123' });
const mockCreateAppointment = vi.fn().mockResolvedValue({ id: 'appt-123' });
vi.mock('@/lib/firebase/admin-db', () => ({
    addCallLog: (...args: unknown[]) => mockAddCallLog(...args),
    createAppointment: (...args: unknown[]) => mockCreateAppointment(...args),
}));
// Keep legacy mock for backward compat with other tests that import from db
vi.mock('@/lib/firebase/db', () => ({
    addCallLog: (...args: unknown[]) => mockAddCallLog(...args),
}));

// ── Voice feedback mock ──────────────────────────────────────────────────────
vi.mock('@/lib/voice/feedback', () => ({
    createAutoFeedback: vi.fn().mockResolvedValue(undefined),
}));

// ── Global fetch spy ─────────────────────────────────────────────────────────
let mockFetch: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.spyOn(global, 'fetch');
});

afterEach(() => {
    mockFetch.mockRestore();
});

// ══════════════════════════════════════════════════════════════════════════════
// Session GET Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('/api/voice/session GET', () => {
    async function getHandler() {
        const mod = await import('@/app/api/voice/session/route');
        return mod.GET;
    }

    it('should return 401 when x-user-tenant header is missing', async () => {
        const GET = await getHandler();
        const req = createMockRequest('http://localhost:3000/api/voice/session?action=status');

        const res = await GET(req);
        expect(res.status).toBe(401);

        const body = await res.json();
        expect(body.error).toBe('Authentication required');
    });

    it('should return Personaplex status on action=status', async () => {
        const GET = await getHandler();

        mockFetch.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    status: 'healthy',
                    model_loaded: true,
                    active_sessions: 2,
                    max_sessions: 10,
                    gpu_name: 'NVIDIA A100',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        const req = createMockRequest('http://localhost:3000/api/voice/session?action=status', {
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await GET(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.available).toBe(true);
        expect(body.model_loaded).toBe(true);
        expect(body.active_sessions).toBe(2);
        expect(body.max_sessions).toBe(10);
        expect(body.gpu_name).toBe('NVIDIA A100');
    });

    it('should return personas list on action=personas', async () => {
        const GET = await getHandler();

        const personasResponse = {
            personas: [
                { id: 'default', name: 'Default Assistant' },
                { id: 'sales', name: 'Sales Agent' },
            ],
        };

        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify(personasResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const req = createMockRequest('http://localhost:3000/api/voice/session?action=personas', {
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await GET(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.personas).toHaveLength(2);
        expect(body.personas[0].id).toBe('default');
    });

    it('should return 400 on invalid action', async () => {
        const GET = await getHandler();

        const req = createMockRequest('http://localhost:3000/api/voice/session?action=invalid_action', {
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await GET(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBe('Invalid action');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// Session POST Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('/api/voice/session POST', () => {
    async function getHandler() {
        const mod = await import('@/app/api/voice/session/route');
        return mod.POST;
    }

    it('should return 401 when x-user-tenant header is missing', async () => {
        const POST = await getHandler();
        const req = createMockRequest('http://localhost:3000/api/voice/session', {
            method: 'POST',
            body: { action: 'infer', text: 'hello' },
        });

        const res = await POST(req);
        expect(res.status).toBe(401);

        const body = await res.json();
        expect(body.error).toBe('Authentication required');
    });

    it('should proxy infer request to Personaplex', async () => {
        const POST = await getHandler();

        // Mock context fetch (returns null / not found)
        mockFetch.mockResolvedValueOnce(
            new Response(null, { status: 404 })
        );

        // Mock Personaplex /infer response
        mockFetch.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    response: 'Merhaba! Size nasil yardimci olabilirim?',
                    persona: 'default',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        const req = createMockRequest('http://localhost:3000/api/voice/session', {
            method: 'POST',
            body: {
                action: 'infer',
                text: 'Merhaba',
                persona: 'default',
                language: 'tr',
                session_id: 'session-abc',
            },
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.response).toBe('Merhaba! Size nasil yardimci olabilirim?');
        expect(body.context_available).toBe(false);
    });

    it('should save session and return callLogId on action=save', async () => {
        const POST = await getHandler();

        const req = createMockRequest('http://localhost:3000/api/voice/session', {
            method: 'POST',
            body: {
                action: 'save',
                sessionId: 'session-abc',
                customerId: 'cust-1',
                customerPhone: '+905551234567',
                customerName: 'Test Customer',
                transcript: [
                    { speaker: 'agent', text: 'Merhaba' },
                    { speaker: 'customer', text: 'Merhaba, randevu almak istiyorum' },
                ],
                duration: 120,
                persona: 'default',
                metrics: { averageSentiment: 0.8 },
            },
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.callLogId).toBe('call-log-123');
        expect(mockAddCallLog).toHaveBeenCalledTimes(1);

        // Verify the call log payload: addCallLog(tenantId, data)
        const tenantArg = mockAddCallLog.mock.calls[0][0];
        const callLogArg = mockAddCallLog.mock.calls[0][1];
        expect(tenantArg).toBe('tenant-123');
        expect(callLogArg.customerId).toBe('cust-1');
        expect(callLogArg.customerPhone).toBe('+905551234567');
        expect(callLogArg.customerName).toBe('Test Customer');
        expect(callLogArg.duration).toBe(120);
        expect(callLogArg.voiceSessionId).toBe('session-abc');
        expect(callLogArg.aiPersona).toBe('default');
    });

    it('should return 500 on error', async () => {
        const POST = await getHandler();

        // Make addCallLog throw to trigger the catch block
        mockAddCallLog.mockRejectedValueOnce(new Error('Firestore write failed'));

        const req = createMockRequest('http://localhost:3000/api/voice/session', {
            method: 'POST',
            body: {
                action: 'save',
                sessionId: 'session-err',
                transcript: [],
                duration: 0,
            },
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await POST(req);
        expect(res.status).toBe(500);

        const body = await res.json();
        expect(body.error).toBe('Failed to process request');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// STT GET Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('/api/voice/stt GET', () => {
    async function getHandler() {
        const mod = await import('@/app/api/voice/stt/route');
        return mod.GET;
    }

    it('should return provider info with model and features', async () => {
        const GET = await getHandler();

        const res = await GET();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.provider).toBe('deepgram');
        expect(body.model).toBe('nova-2');
        expect(body.languages).toEqual(['tr', 'en']);
        expect(body.features).toBeDefined();
        expect(body.features.smart_format).toBe(true);
        expect(body.features.punctuation).toBe(true);
        expect(body.features.utterances).toBe(true);
        expect(body.features.word_timestamps).toBe(true);
        expect(body.usage).toBeDefined();
        expect(body.usage.endpoint).toBe('POST /api/voice/stt');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// STT POST Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('/api/voice/stt POST', () => {
    async function getHandler() {
        const mod = await import('@/app/api/voice/stt/route');
        return mod.POST;
    }

    it('should return 401 when x-user-tenant header is missing', async () => {
        const POST = await getHandler();
        const req = createMockRequest('http://localhost:3000/api/voice/stt', {
            method: 'POST',
        });

        const res = await POST(req);
        expect(res.status).toBe(401);

        const body = await res.json();
        expect(body.error).toBe('Authentication required');
    });

    it('should return 503 when circuit breaker is open', async () => {
        mockDeepgramCircuitBreaker.isOpen.mockReturnValue(true);

        const POST = await getHandler();
        const req = createMockRequest('http://localhost:3000/api/voice/stt', {
            method: 'POST',
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await POST(req);
        expect(res.status).toBe(503);

        const body = await res.json();
        expect(body.error).toContain('circuit breaker');
        expect(body.fallback).toBe('browser');

        // Reset
        mockDeepgramCircuitBreaker.isOpen.mockReturnValue(false);
    });

    it('should return 400 when content type is not audio or multipart', async () => {
        // When DEEPGRAM_API_KEY is configured (loaded from env), the route checks
        // content-type after auth and circuit breaker. application/json is invalid.
        const POST = await getHandler();

        const req = createMockRequest('http://localhost:3000/api/voice/stt', {
            method: 'POST',
            body: { some: 'data' },
            headers: { 'x-user-tenant': 'tenant-123' },
        });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Expected multipart/form-data or audio/*');
    });

    it('should return 400 when audio data is empty', async () => {
        const POST = await getHandler();

        // Build a request with audio/* content type but empty body
        const req = new NextRequest(
            new URL('http://localhost:3000/api/voice/stt'),
            {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Content-Type': 'audio/webm',
                },
                body: new ArrayBuffer(0),
            }
        );

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Empty audio data');
    });

    it('should return transcript on successful Deepgram response', async () => {
        const POST = await getHandler();

        const deepgramResponse = {
            results: {
                channels: [{
                    alternatives: [{
                        transcript: 'Merhaba, randevu almak istiyorum',
                        confidence: 0.95,
                        words: [
                            { word: 'Merhaba', start: 0.0, end: 0.5, confidence: 0.98 },
                            { word: 'randevu', start: 0.6, end: 1.0, confidence: 0.93 },
                            { word: 'almak', start: 1.1, end: 1.4, confidence: 0.94 },
                            { word: 'istiyorum', start: 1.5, end: 2.0, confidence: 0.96 },
                        ],
                    }],
                    detected_language: 'tr',
                }],
                utterances: [{
                    transcript: 'Merhaba, randevu almak istiyorum',
                    confidence: 0.95,
                    start: 0.0,
                    end: 2.0,
                }],
            },
        };

        // The circuit breaker execute wraps the fetch call to Deepgram.
        // Mock it to return a successful Deepgram-like JSON response.
        mockDeepgramCircuitBreaker.execute.mockImplementation(async (fn: Function) => {
            // Mock the global fetch so the function inside the circuit breaker gets it
            mockFetch.mockResolvedValueOnce(
                new Response(JSON.stringify(deepgramResponse), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            return fn();
        });

        // Create a request with audio content type and non-empty body
        const audioBytes = new Uint8Array(256);
        for (let i = 0; i < audioBytes.length; i++) audioBytes[i] = i % 256;

        const req = new NextRequest(
            new URL('http://localhost:3000/api/voice/stt'),
            {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Content-Type': 'audio/webm',
                    'x-language': 'tr',
                },
                body: audioBytes.buffer,
            }
        );

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.transcript).toBe('Merhaba, randevu almak istiyorum');
        expect(body.confidence).toBe(0.95);
        expect(body.words).toHaveLength(4);
        expect(body.words[0].word).toBe('Merhaba');
        expect(body.utterances).toHaveLength(1);
        expect(body.provider).toBe('deepgram-nova-2');
        expect(body.isEmpty).toBe(false);
        expect(body.language).toBe('tr');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// TTS GET Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('/api/voice/tts GET', () => {
    async function getHandler() {
        const mod = await import('@/app/api/voice/tts/route');
        return mod.GET;
    }

    it('should return provider strategy info', async () => {
        const GET = await getHandler();

        const res = await GET();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.providers).toBeDefined();
        expect(body.providers.cartesia).toBeDefined();
        expect(body.providers.cartesia.role).toContain('default');
        expect(body.providers.google).toBeDefined();
        expect(body.providers.google.role).toContain('legacy');
        expect(body.providers.openai).toBeDefined();
        expect(body.providers.openai.role).toContain('last-resort');
        expect(body.strategy).toBeDefined();
        expect(body.strategy.all_plans.tr).toContain('Cartesia');
        expect(body.strategy.all_plans.en).toContain('Cartesia');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// TTS POST Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('/api/voice/tts POST', () => {
    async function getHandler() {
        const mod = await import('@/app/api/voice/tts/route');
        return mod.POST;
    }

    it('should return 400 when text is missing', async () => {
        const POST = await getHandler();

        const req = createMockRequest('http://localhost:3000/api/voice/tts', {
            method: 'POST',
            body: { language: 'tr' },
        });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Text is required');
    });

    it('should return audio stream from Cartesia', async () => {
        const POST = await getHandler();

        // Cartesia is the primary TTS provider — synthesizeCartesiaTTS is called directly (not via circuit breaker execute in test)
        const fakeAudioBody = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('fake-audio-data'));
                controller.close();
            },
        });

        // Mock synthesizeCartesiaTTS to return a successful audio response
        mockSynthesizeCartesiaTTS.mockResolvedValueOnce(
            new Response(fakeAudioBody, {
                status: 200,
                headers: { 'Content-Type': 'audio/mpeg' },
            })
        );

        const req = createMockRequest('http://localhost:3000/api/voice/tts', {
            method: 'POST',
            body: {
                text: 'Merhaba, hoş geldiniz!',
                language: 'tr',
                greeting: true,
            },
        });

        const res = await POST(req);

        // Should return audio stream
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
        expect(res.headers.get('X-TTS-Provider')).toBe('cartesia');
    });

    it('should fallback to OpenAI when Cartesia fails', async () => {
        const POST = await getHandler();

        // Make Cartesia return null (failure)
        mockSynthesizeCartesiaTTS.mockResolvedValueOnce(null);

        // OpenAI should succeed — the TTS route calls synthesizeOpenAI directly with fetch
        const fakeAudioBody = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('openai-audio-data'));
                controller.close();
            },
        });

        // For Turkish, the chain is Cartesia → OpenAI (no Kokoro/Murf for TR)
        // OpenAI TTS uses openaiCircuitBreaker.execute wrapping a fetch call
        mockFetch.mockResolvedValueOnce(
            new Response(fakeAudioBody, {
                status: 200,
                headers: { 'Content-Type': 'audio/mpeg' },
            })
        );

        const req = createMockRequest('http://localhost:3000/api/voice/tts', {
            method: 'POST',
            body: {
                text: 'Merhaba!',
                language: 'tr',
                greeting: false,
            },
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
        expect(res.headers.get('X-TTS-Provider')).toBe('openai-fallback');
    });

    it('should return 503 when all providers fail', async () => {
        const POST = await getHandler();

        // Make all providers return null (default) and circuit breakers open
        mockCartesiaCircuitBreaker.isOpen.mockReturnValue(true);
        mockMurfCircuitBreaker.isOpen.mockReturnValue(true);
        mockKokoroCircuitBreaker.isOpen.mockReturnValue(true);
        mockOpenaiCircuitBreaker.isOpen.mockReturnValue(true);

        const req = createMockRequest('http://localhost:3000/api/voice/tts', {
            method: 'POST',
            body: {
                text: 'Merhaba!',
                language: 'tr',
            },
        });

        const res = await POST(req);
        expect(res.status).toBe(503);

        const body = await res.json();
        expect(body.error).toContain('All TTS providers failed');

        // Reset
        mockCartesiaCircuitBreaker.isOpen.mockReturnValue(false);
        mockMurfCircuitBreaker.isOpen.mockReturnValue(false);
        mockKokoroCircuitBreaker.isOpen.mockReturnValue(false);
        mockOpenaiCircuitBreaker.isOpen.mockReturnValue(false);
    });

    it('should use OpenAI in emergency mode', async () => {
        const POST = await getHandler();

        // Enable emergency mode
        mockShouldUseEmergencyTts.mockResolvedValue(true);

        // OpenAI should be used for body (non-greeting) TTS in emergency mode
        const fakeAudioBody = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('emergency-audio'));
                controller.close();
            },
        });

        mockOpenaiCircuitBreaker.execute.mockImplementation(async (fn: Function) => {
            mockFetch.mockResolvedValueOnce(
                new Response(fakeAudioBody, {
                    status: 200,
                    headers: { 'Content-Type': 'audio/mpeg' },
                })
            );
            return fn();
        });

        const req = createMockRequest('http://localhost:3000/api/voice/tts', {
            method: 'POST',
            body: {
                text: 'Bu bir test mesajıdır.',
                language: 'tr',
                greeting: false,
            },
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
        expect(res.headers.get('X-TTS-Provider')).toBe('openai-emergency');
        expect(res.headers.get('X-TTS-Emergency')).toBe('true');

        // Reset
        mockShouldUseEmergencyTts.mockResolvedValue(false);
    });
});
