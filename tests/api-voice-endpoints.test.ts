/**
 * API Voice Endpoint Tests — Connect, Feedback, Session, Metrics, TTS Phone
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createAuthError } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: vi.fn().mockResolvedValue(undefined),
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({ get: mockGet }),
                    where: vi.fn().mockReturnValue({
                        orderBy: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({ get: mockGet }),
                        }),
                    }),
                }),
            }),
        }),
    })),
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
}));

// ── requireStrictAuth mock ──
const mockRequireStrictAuth = vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    tenantId: 'tenant-123',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Voice mocks ──
vi.mock('@/lib/voice/rate-limit', () => ({
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 99, resetTime: Date.now() + 60000 }),
    RATE_LIMITS: {
        session: { maxRequests: 100, windowMs: 60000 },
        general: { maxRequests: 100, windowMs: 60000 },
    },
    rateLimitExceeded: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 }),
    ),
    getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/voice/logging', () => ({
    voiceLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
    metrics: {
        increment: vi.fn(),
    },
    METRICS: {
        API_REQUESTS: 'api_requests',
        API_ERRORS: 'api_errors',
        RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
        SESSIONS_CREATED: 'sessions_created',
    },
    withTiming: vi.fn(),
}));

vi.mock('@/lib/voice/feedback', () => ({
    updateCallFeedback: vi.fn().mockResolvedValue(undefined),
    getCallFeedback: vi.fn().mockResolvedValue({ rating: 4, comment: 'Good' }),
    getCallFeedbackStats: vi.fn().mockResolvedValue({ avgRating: 4.2, totalFeedbacks: 10 }),
}));

vi.mock('@/lib/voice/tts-cartesia', () => ({
    synthesizeCartesiaTTS: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/voice/phone-audio-cache', () => ({
    getCachedPhoneAudio: vi.fn().mockReturnValue(null),
    getCachedPhoneAudioByText: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/utils/logger', () => ({
    createLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    }),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((_err: unknown, context: string) =>
        new Response(JSON.stringify({ error: `${context} failed` }), { status: 500 }),
    ),
    requireFields: vi.fn().mockReturnValue(null),
    errorResponse: vi.fn((msg: string) =>
        new Response(JSON.stringify({ error: msg }), { status: 400 }),
    ),
}));

describe('API Voice Endpoint Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    // ── Voice Connect ──
    describe('/api/voice/connect', () => {
        it('GET exports a function', async () => {
            const route = await import('@/app/api/voice/connect/route');
            expect(typeof route.GET).toBe('function');
        });

        it('POST exports a function', async () => {
            const route = await import('@/app/api/voice/connect/route');
            expect(typeof route.POST).toBe('function');
        });

        it('GET returns WebSocket connection info', async () => {
            const { GET } = await import('@/app/api/voice/connect/route');
            const request = createMockRequest('/api/voice/connect');
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.websocket_url).toBeDefined();
            expect(data.audio_format).toBeDefined();
        });

        it('POST returns session token', async () => {
            const { POST } = await import('@/app/api/voice/connect/route');
            const request = createMockRequest('/api/voice/connect', {
                method: 'POST',
                body: { persona: 'default' },
            });
            const response = await POST(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.token).toBeDefined();
            expect(data.expires_in).toBe(300);
        });
    });

    // ── Voice Feedback ──
    describe('/api/voice/feedback', () => {
        it('POST returns 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                body: { callId: 'call-1', rating: 4 },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('POST returns 400 for invalid rating', async () => {
            // requireFields mock returns null (passes), so test the rating validation
            const { requireFields } = await import('@/lib/utils/error-handler');
            vi.mocked(requireFields).mockReturnValueOnce(null);

            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { callId: 'call-1', rating: 10 },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('GET returns 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('GET returns feedback stats when authenticated', async () => {
            const { GET } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback?days=30', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.stats).toBeDefined();
        });

        it('exports GET and POST', async () => {
            const route = await import('@/app/api/voice/feedback/route');
            expect(typeof route.GET).toBe('function');
            expect(typeof route.POST).toBe('function');
        });
    });

    // ── Voice Session ──
    describe('/api/voice/session', () => {
        it('GET returns 401 without x-user-tenant header', async () => {
            const { GET } = await import('@/app/api/voice/session/route');
            const request = createMockRequest('/api/voice/session?action=status');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('POST returns 401 without x-user-tenant header', async () => {
            const { POST } = await import('@/app/api/voice/session/route');
            const request = createMockRequest('/api/voice/session', {
                method: 'POST',
                body: { action: 'save', sessionId: 'sess-1' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('exports GET and POST', async () => {
            const route = await import('@/app/api/voice/session/route');
            expect(typeof route.GET).toBe('function');
            expect(typeof route.POST).toBe('function');
        });
    });

    // ── Voice Metrics ──
    describe('/api/voice/metrics', () => {
        it('GET returns 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/voice/metrics/route');
            const request = createMockRequest('/api/voice/metrics');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('GET returns metrics when authenticated', async () => {
            mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

            const { GET } = await import('@/app/api/voice/metrics/route');
            const request = createMockRequest('/api/voice/metrics?days=7', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.stats).toBeDefined();
            expect(data.period).toBe('7d');
        });

        it('exports GET', async () => {
            const route = await import('@/app/api/voice/metrics/route');
            expect(typeof route.GET).toBe('function');
        });
    });

    // ── Voice TTS Phone ──
    describe('/api/voice/tts/phone', () => {
        it('GET returns 404 for missing audio ID', async () => {
            const { GET } = await import('@/app/api/voice/tts/phone/route');
            const request = createMockRequest('/api/voice/tts/phone?id=nonexistent-id');
            const response = await GET(request);
            expect(response.status).toBe(404);
        });

        it('GET returns 400 for bad base64 text without id', async () => {
            const { GET } = await import('@/app/api/voice/tts/phone/route');
            const request = createMockRequest('/api/voice/tts/phone');
            const response = await GET(request);
            expect(response.status).toBe(400);
        });

        it('GET returns 403 for invalid HMAC signature', async () => {
            // Encode some text as base64url
            const text = Buffer.from('Hello').toString('base64url');
            const { GET } = await import('@/app/api/voice/tts/phone/route');
            const request = createMockRequest(`/api/voice/tts/phone?t=${text}&l=en&v=voice-1&s=bad-signature`);
            const response = await GET(request);
            expect(response.status).toBe(403);
        });

        it('exports GET', async () => {
            const route = await import('@/app/api/voice/tts/phone/route');
            expect(typeof route.GET).toBe('function');
        });
    });
});
