/**
 * API Security Tests
 * Tests Twilio signature validation, webhook auth, metrics auth, voice connect token safety,
 * health info disclosure, RAG search auth, voice STT auth, tenants PUT field allowlist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Twilio telephony mocks ──
vi.mock('@/lib/twilio/telephony', () => ({
    validateTwilioSignature: vi.fn().mockReturnValue(true),
    getTwilioConfig: vi.fn().mockReturnValue({ authToken: 'test-token', accountSid: 'AC123', phoneNumber: '+1234' }),
    generateResponseAndGatherTwiML: vi.fn().mockReturnValue('<Response></Response>'),
    generateUnavailableTwiML: vi.fn().mockReturnValue('<Response><Say>Unavailable</Say></Response>'),
    generateWelcomeTwiML: vi.fn().mockReturnValue('<Response></Response>'),
}));

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteDoc = vi.fn();
const mockCollectionGet = vi.fn();
const mockBatch = { update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                update: mockUpdate,
                delete: mockDeleteDoc,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate, delete: mockDeleteDoc }),
                    add: mockAdd,
                    get: mockCollectionGet,
                    orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            get: mockCollectionGet,
                            where: vi.fn().mockReturnValue({ get: mockCollectionGet }),
                        }),
                        get: mockCollectionGet,
                    }),
                    where: vi.fn().mockReturnValue({
                        get: mockCollectionGet,
                        count: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }) }),
                    }),
                }),
            }),
        }),
        batch: vi.fn().mockReturnValue(mockBatch),
        listCollections: vi.fn().mockResolvedValue([]),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TS'),
        increment: vi.fn((n: number) => n),
        arrayUnion: vi.fn((...args: unknown[]) => args),
    },
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

// ── Monitoring mock ──
vi.mock('@/lib/utils/monitoring', () => ({
    monitor: {
        getHealthSummary: vi.fn().mockReturnValue({ status: 'healthy', errors: 0 }),
        getMetrics: vi.fn().mockReturnValue([]),
        captureError: vi.fn(),
        startTimer: vi.fn(),
        trackEvent: vi.fn(),
    },
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
    METRICS: { RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded', API_REQUESTS: 'api_requests', API_ERRORS: 'api_errors', SESSIONS_CREATED: 'sessions_created' },
}));

// ── AI mocks ──
vi.mock('@/lib/ai/intent-fast', () => ({
    detectIntentFast: vi.fn().mockReturnValue({ intent: 'general', confidence: 0.5 }),
    shouldShortcut: vi.fn().mockReturnValue(false),
    getShortcutResponse: vi.fn().mockReturnValue('Merhaba!'),
}));
vi.mock('@/lib/ai/llm-fallback-chain', () => ({
    generateWithFallback: vi.fn().mockResolvedValue({ text: 'AI response' }),
}));
vi.mock('@/lib/n8n/client', () => ({ sendWebhook: vi.fn().mockResolvedValue(undefined) }));

// ── Env mock ──
vi.mock('@/lib/env', () => ({ warnMissingOptionalKeys: vi.fn() }));

// ── Admin-db mocks ──
vi.mock('@/lib/firebase/admin-db', () => ({
    addCallLog: vi.fn().mockResolvedValue({ id: 'call-1' }),
    addActivityLog: vi.fn().mockResolvedValue(undefined),
    getCustomerByPhone: vi.fn().mockResolvedValue({ id: 'c1', name: 'Test Customer' }),
    createCustomer: vi.fn().mockResolvedValue({ id: 'c2' }),
    getCustomer: vi.fn().mockResolvedValue({ id: 'c1', name: 'Test Customer' }),
    getTenantFromRequest: vi.fn().mockReturnValue('tenant-123'),
    Timestamp: { now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }) },
}));

// ── Tenant admin mocks ──
vi.mock('@/lib/tenant/admin', () => ({
    createTenant: vi.fn().mockResolvedValue('new-tenant-id'),
    listTenants: vi.fn().mockResolvedValue([]),
    getTenant: vi.fn().mockResolvedValue({ id: 'tenant-123', companyName: 'Test Co' }),
    updateTenant: vi.fn().mockResolvedValue(undefined),
    assignUserToTenant: vi.fn().mockResolvedValue(undefined),
}));

describe('API Security Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
        mockGet.mockResolvedValue({ exists: true, data: () => ({ companyName: 'Test Co', language: 'tr' }) });
        mockCollectionGet.mockResolvedValue({ docs: [] });
        mockAdd.mockResolvedValue({ id: 'new-doc-id' });
    });

    // ── Metrics Auth ──
    describe('/api/metrics — Auth', () => {
        it('should return 401 when no auth provided', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/metrics/route');
            const request = createMockRequest('/api/metrics');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return metrics when authenticated', async () => {
            const { GET } = await import('@/app/api/metrics/route');
            const request = createMockRequest('/api/metrics', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.status).toBe('ok');
            expect(data.health).toBeDefined();
        });

        it('should NOT expose nodeVersion or platform in response', async () => {
            const { GET } = await import('@/app/api/metrics/route');
            const request = createMockRequest('/api/metrics', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(data.system?.nodeVersion).toBeUndefined();
            expect(data.system?.platform).toBeUndefined();
        });
    });

    // ── Webhook Call Auth ──
    describe('/api/webhook/call — Auth', () => {
        it('should accept valid webhook key', async () => {
            // Mock env
            const origKey = process.env.WEBHOOK_API_KEY;
            process.env.WEBHOOK_API_KEY = 'secret-key';

            const { POST } = await import('@/app/api/webhook/call/route');
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                headers: { 'x-webhook-key': 'secret-key' },
                body: {
                    tenantId: 'tenant-123',
                    customerPhone: '555-0001',
                    customerName: 'Test',
                },
            });
            const response = await POST(request);
            expect([200, 201]).toContain(response.status);

            process.env.WEBHOOK_API_KEY = origKey;
        });

        it('should reject invalid webhook key', async () => {
            const origKey = process.env.WEBHOOK_API_KEY;
            process.env.WEBHOOK_API_KEY = 'secret-key';

            const { POST } = await import('@/app/api/webhook/call/route');
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                headers: { 'x-webhook-key': 'wrong-key' },
                body: { tenantId: 'tenant-123', customerPhone: '555-0001' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);

            process.env.WEBHOOK_API_KEY = origKey;
        });

        it('should return 400 when customerPhone is missing', async () => {
            const origKey = process.env.WEBHOOK_API_KEY;
            delete process.env.WEBHOOK_API_KEY;

            const { POST } = await import('@/app/api/webhook/call/route');
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                body: { tenantId: 'tenant-123' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);

            process.env.WEBHOOK_API_KEY = origKey;
        });

        it('should return 400 when tenantId is missing', async () => {
            const origKey = process.env.WEBHOOK_API_KEY;
            delete process.env.WEBHOOK_API_KEY;

            // Override getTenantFromRequest to return null for this test
            const adminDb = await import('@/lib/firebase/admin-db');
            vi.mocked(adminDb.getTenantFromRequest).mockReturnValueOnce(null as never);

            const { POST } = await import('@/app/api/webhook/call/route');
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                body: { customerPhone: '555-0001' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);

            process.env.WEBHOOK_API_KEY = origKey;
        });

        it('should validate tenant exists in Firestore', async () => {
            const origKey = process.env.WEBHOOK_API_KEY;
            delete process.env.WEBHOOK_API_KEY;

            mockGet.mockResolvedValueOnce({ exists: false });

            const { POST } = await import('@/app/api/webhook/call/route');
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                body: { tenantId: 'nonexistent', customerPhone: '555-0001' },
            });
            const response = await POST(request);
            expect(response.status).toBe(404);

            process.env.WEBHOOK_API_KEY = origKey;
        });
    });

    // ── Voice Connect Token Safety ──
    describe('/api/voice/connect — Token Safety', () => {
        it('POST response should not contain api_key', async () => {
            const { POST } = await import('@/app/api/voice/connect/route');
            const request = createMockRequest('/api/voice/connect', {
                method: 'POST',
                body: { persona: 'default' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(data.token).toBeDefined();

            // Decode base64 token and check
            const decoded = JSON.parse(Buffer.from(data.token, 'base64').toString());
            expect(decoded.api_key).toBeUndefined();
            expect(decoded.sessionId).toBeDefined();
        });

        it('GET should return websocket_url', async () => {
            const { GET } = await import('@/app/api/voice/connect/route');
            const request = createMockRequest('/api/voice/connect');
            const response = await GET(request);
            const data = await response.json();
            expect(data.websocket_url).toBeDefined();
            expect(data.audio_format).toBeDefined();
        });
    });

    // ── Health Info Disclosure ──
    describe('/api/health — Info Disclosure', () => {
        it('should not expose nodeVersion or platform', async () => {
            const { GET } = await import('@/app/api/health/route');
            const response = await GET();
            const data = await response.json();
            expect(data.nodeVersion).toBeUndefined();
            expect(data.platform).toBeUndefined();
        });

        it('should include basic health info', async () => {
            const { GET } = await import('@/app/api/health/route');
            const response = await GET();
            const data = await response.json();
            expect(data.status).toBeDefined();
            expect(data.timestamp).toBeDefined();
        });
    });

    // ── Tenants PUT Field Allowlist ──
    describe('/api/tenants PUT — Field Allowlist', () => {
        it('should filter disallowed fields', async () => {
            const { updateTenant } = await import('@/lib/tenant/admin');
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'owner',
                },
                body: {
                    companyName: 'Updated Co',
                    maliciousField: 'hack',
                    isAdmin: true,
                    quotas: { dailyMinutes: 9999 },
                },
            });

            const response = await PUT(request);
            expect(response.status).toBe(200);

            // updateTenant should be called with filtered fields only
            expect(updateTenant).toHaveBeenCalledWith(
                'tenant-123',
                expect.not.objectContaining({ maliciousField: 'hack' }),
            );
            expect(updateTenant).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({ companyName: 'Updated Co' }),
            );
        });

        it('should return error when no valid fields provided', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'owner',
                },
                body: { maliciousField: 'hack', anotherBad: 'nope' },
            });

            const response = await PUT(request);
            expect(response.status).toBe(400);
        });

        it('should reject non-owner/admin updates', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'viewer',
                },
                body: { companyName: 'Hack Co' },
            });

            const response = await PUT(request);
            // AUTH_ERROR maps to 401 in error-handler
            expect(response.status).toBe(401);
        });
    });
});
