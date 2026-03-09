/**
 * API Voice Tests — Connect, Feedback, Metrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// Build a chainable query mock (where/orderBy/limit all return same chainable)
const mockQueryGet = vi.fn().mockResolvedValue({ docs: [], empty: true });
function buildChainableQuery() {
    const q: Record<string, unknown> = { get: mockQueryGet };
    q.where = vi.fn().mockReturnValue(q);
    q.orderBy = vi.fn().mockReturnValue(q);
    q.limit = vi.fn().mockReturnValue(q);
    return q;
}

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
                set: vi.fn().mockResolvedValue(undefined),
                collection: vi.fn().mockReturnValue({
                    ...buildChainableQuery(),
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
                        set: vi.fn().mockResolvedValue(undefined),
                    }),
                    add: vi.fn().mockResolvedValue({ id: 'new-id' }),
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

// ── Voice feedback mocks ──
vi.mock('@/lib/voice/feedback', () => ({
    updateCallFeedback: vi.fn().mockResolvedValue(undefined),
    getCallFeedback: vi.fn().mockResolvedValue({ rating: 4, comment: 'Good' }),
    getCallFeedbackStats: vi.fn().mockResolvedValue({ average: 4.2, total: 50 }),
}));

// ── Voice rate-limit mock ──
vi.mock('@/lib/voice/rate-limit', () => ({
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 }),
    RATE_LIMITS: { session: { maxRequests: 30, windowMs: 60000 } },
    rateLimitExceeded: vi.fn().mockReturnValue(new Response('Rate limited', { status: 429 })),
    getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ── Voice logging mock ──
vi.mock('@/lib/voice/logging', () => ({
    voiceLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    metrics: { increment: vi.fn() },
    METRICS: {
        RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
        API_REQUESTS: 'api_requests',
        API_ERRORS: 'api_errors',
        SESSIONS_CREATED: 'sessions_created',
    },
}));

// ── Voice metrics mock ──
vi.mock('@/lib/voice/metrics-aggregator', () => ({
    getAggregatedMetrics: vi.fn().mockReturnValue({
        ttft: { avg: 200, p50: 180, p95: 350, p99: 500 },
        stt: { avg: 150, p50: 120, p95: 300, p99: 450 },
    }),
}));

describe('API Voice Tests', () => {
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
        it('GET should return WebSocket URL and audio format', async () => {
            const { GET } = await import('@/app/api/voice/connect/route');
            const request = createMockRequest('/api/voice/connect');
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.websocket_url).toBeDefined();
            expect(data.audio_format).toBeDefined();
            expect(data.audio_format.sample_rate).toBe(24000);
        });

        it('POST should return session token without api_key', async () => {
            const { POST } = await import('@/app/api/voice/connect/route');
            const request = createMockRequest('/api/voice/connect', {
                method: 'POST',
                body: { persona: 'sales' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.token).toBeDefined();
            expect(data.expires_in).toBe(300);

            const decoded = JSON.parse(Buffer.from(data.token, 'base64').toString());
            expect(decoded.api_key).toBeUndefined();
            expect(decoded.persona).toBe('sales');
            expect(decoded.sessionId).toBeDefined();
        });
    });

    // ── Voice Feedback ──
    describe('/api/voice/feedback', () => {
        it('POST should save valid feedback (rating 1-5)', async () => {
            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { callId: 'call-1', rating: 4, comment: 'Great' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('POST should reject invalid rating (0)', async () => {
            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { callId: 'call-1', rating: 0 },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('POST should reject invalid rating (6)', async () => {
            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { callId: 'call-1', rating: 6 },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('POST should return 400 when callId is missing', async () => {
            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { rating: 4 },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('POST should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { POST } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                method: 'POST',
                body: { callId: 'call-1', rating: 4 },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('GET should return feedback stats', async () => {
            const { GET } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.stats).toBeDefined();
        });

        it('GET should return specific call feedback when callId provided', async () => {
            const { GET } = await import('@/app/api/voice/feedback/route');
            const request = createMockRequest('/api/voice/feedback?callId=call-1', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.feedback).toBeDefined();
        });
    });

    // ── Voice Metrics ──
    describe('/api/voice/metrics', () => {
        it('GET should return metrics when authenticated', async () => {
            const { GET } = await import('@/app/api/voice/metrics/route');
            const request = createMockRequest('/api/voice/metrics', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
        });

        it('GET should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/voice/metrics/route');
            const request = createMockRequest('/api/voice/metrics');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });
});
