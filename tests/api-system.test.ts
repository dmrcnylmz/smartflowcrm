/**
 * API System Tests — Admin Stats, Go-Live Check, Monitoring Errors
 *
 * Comprehensive tests for admin/system/monitoring routes
 * covering auth, Firestore queries, env checks, rate limiting, and error tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── Firestore mock with chainable methods ────────────────────────────────────
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockCount = vi.fn();
const mockWhere = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: (...args: unknown[]) => mockCollection(...args),
        collectionGroup: vi.fn().mockReturnValue({ where: mockWhere }),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
}));

// ── require-super-admin mock ─────────────────────────────────────────────────
const mockRequireSuperAdmin = vi.fn().mockResolvedValue({
    uid: 'super-admin-uid',
    email: 'admin@callception.com',
    tenantId: 'admin-tenant',
});
vi.mock('@/lib/utils/require-super-admin', () => ({
    requireSuperAdmin: (...args: unknown[]) => mockRequireSuperAdmin(...args),
}));

// ── Phone number pool mock ───────────────────────────────────────────────────
const mockGetPoolStats = vi.fn().mockResolvedValue({
    total: 10,
    available: 5,
    assigned: 3,
    reserved: 2,
    byCarrier: {},
});
vi.mock('@/lib/phone/number-pool', () => ({
    getPoolStats: (...args: unknown[]) => mockGetPoolStats(...args),
}));

// ── Error handler mock (real functions with override capability) ──────────────
const mockRequireAuth = vi.fn().mockReturnValue(null);
const mockErrorResponse = vi.fn((apiError: { code: string; message: string; statusCode: number }) => {
    const { NextResponse } = require('next/server');
    return NextResponse.json(
        { error: apiError.message, code: apiError.code, timestamp: new Date().toISOString() },
        { status: apiError.statusCode },
    );
});
const mockCreateApiError = vi.fn((code: string, message: string) => {
    const statusMap: Record<string, number> = {
        VALIDATION_ERROR: 400,
        AUTH_ERROR: 401,
        NOT_FOUND: 404,
        RATE_LIMITED: 429,
        INTERNAL_ERROR: 500,
    };
    return { code, message, statusCode: statusMap[code] || 400 };
});
const mockHandleApiError = vi.fn().mockImplementation(() =>
    new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
);
const mockRateLimitResponse = vi.fn((windowMs?: number) => {
    const { NextResponse } = require('next/server');
    return NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMITED', retryAfterMs: windowMs || 60000, timestamp: new Date().toISOString() },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((windowMs || 60000) / 1000)) } },
    );
});

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: (...args: unknown[]) => mockHandleApiError(...args),
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
    errorResponse: (...args: unknown[]) => mockErrorResponse(...args),
    createApiError: (...args: unknown[]) => mockCreateApiError(...args),
    rateLimitResponse: (...args: unknown[]) => mockRateLimitResponse(...args),
}));

// ── Error tracker mock ───────────────────────────────────────────────────────
const mockCaptureError = vi.fn().mockReturnValue({
    id: 'evt-123',
    fingerprint: 'fp-123',
    level: 'error',
    message: 'Test error',
    timestamp: '2024-01-01T00:00:00.000Z',
});
const mockGetRecentErrors = vi.fn().mockReturnValue([
    { fingerprint: 'fp-1', message: 'Error 1', count: 3, lastSeen: '2024-01-01' },
    { fingerprint: 'fp-2', message: 'Error 2', count: 1, lastSeen: '2024-01-02' },
]);
const mockGetErrorStats = vi.fn().mockReturnValue({
    total: 10,
    errors: 7,
    warnings: 3,
    uniqueFingerprints: 5,
    errorsThisMinute: 2,
});

vi.mock('@/lib/monitoring/error-tracker', () => ({
    captureError: (...args: unknown[]) => mockCaptureError(...args),
    getRecentErrors: (...args: unknown[]) => mockGetRecentErrors(...args),
    getErrorStats: (...args: unknown[]) => mockGetErrorStats(...args),
}));

// ── Metrics logger mock ──────────────────────────────────────────────────────
vi.mock('@/lib/billing/metrics-logger', () => ({
    metricsLogger: {
        getStats: vi.fn().mockReturnValue({ bufferSize: 10, isFlushing: false }),
    },
}));

// ── get-app-url mock ─────────────────────────────────────────────────────────
vi.mock('@/lib/utils/get-app-url', () => ({
    getAppUrlDiagnostics: vi.fn().mockReturnValue({
        url: 'https://app.smartflow.com',
        source: 'APP_URL',
    }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Stats — GET /api/admin/stats
// ═══════════════════════════════════════════════════════════════════════════════

describe('Admin Stats — GET /api/admin/stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Restore default mock behavior after clearAllMocks
        mockRequireSuperAdmin.mockResolvedValue({
            uid: 'super-admin-uid',
            email: 'admin@callception.com',
            tenantId: 'admin-tenant',
        });
        mockGetPoolStats.mockResolvedValue({
            total: 10,
            available: 5,
            assigned: 3,
            reserved: 2,
            byCarrier: {},
        });
    });

    async function callAdminStats() {
        const { GET } = await import('@/app/api/admin/stats/route');
        const req = createMockRequest('/api/admin/stats');
        return GET(req);
    }

    function setupFirestoreMocks(options?: {
        tenantCount?: number;
        phoneNumberDocs?: Array<{ providerType: string }>;
        portingSize?: number;
    }) {
        const {
            tenantCount = 5,
            phoneNumberDocs = [
                { providerType: 'TWILIO_NATIVE' },
                { providerType: 'TWILIO_NATIVE' },
                { providerType: 'SIP_TRUNK' },
            ],
            portingSize = 2,
        } = options || {};

        // The route calls getDb() which does getFirestore(), returning { collection: mockCollection }
        // Then it does:
        //   database.collection('tenants').count().get()           -> tenantsSnap
        //   database.collection('tenant_phone_numbers').get()      -> phoneNumbersSnap
        //   database.collection('porting_requests').where(...).get() -> portingSnap
        //   getPoolStats(database)                                  -> poolStats

        let callIndex = 0;

        // mockCollection is called for each collection name
        // We need to track calls and return appropriate chainable objects
        mockCollection.mockImplementation((collectionName: string) => {
            if (collectionName === 'tenants') {
                return {
                    count: () => ({
                        get: vi.fn().mockResolvedValue({
                            data: () => ({ count: tenantCount }),
                        }),
                    }),
                };
            }
            if (collectionName === 'tenant_phone_numbers') {
                return {
                    get: vi.fn().mockResolvedValue({
                        size: phoneNumberDocs.length,
                        docs: phoneNumberDocs.map((d, i) => ({
                            id: `phone-${i}`,
                            data: () => d,
                        })),
                    }),
                };
            }
            if (collectionName === 'porting_requests') {
                return {
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            size: portingSize,
                        }),
                    }),
                };
            }
            // Fallback for any other collection (e.g., used by getPoolStats)
            return {
                doc: mockDoc,
                count: mockCount,
                get: mockGet,
                where: mockWhere,
            };
        });
    }

    it('should return system stats for super-admin', async () => {
        setupFirestoreMocks({
            tenantCount: 5,
            phoneNumberDocs: [
                { providerType: 'TWILIO_NATIVE' },
                { providerType: 'TWILIO_NATIVE' },
                { providerType: 'SIP_TRUNK' },
            ],
            portingSize: 2,
        });

        const res = await callAdminStats();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.tenants.total).toBe(5);
        expect(body.phoneNumbers.total).toBe(3);
        expect(body.phoneNumbers.twilioNative).toBe(2);
        expect(body.phoneNumbers.sipTrunk).toBe(1);
        expect(body.phoneNumbers.legacy).toBe(0);
        expect(body.pool).toBeDefined();
        expect(body.porting.activeRequests).toBe(2);
    });

    it('should return 403 when not super-admin', async () => {
        const { NextResponse } = await import('next/server');
        mockRequireSuperAdmin.mockResolvedValue({
            error: NextResponse.json(
                { error: 'Super-admin yetkisi gerekli' },
                { status: 403 },
            ),
        });

        const { GET } = await import('@/app/api/admin/stats/route');
        const req = createMockRequest('/api/admin/stats');
        const res = await GET(req);

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain('Super-admin');
    });

    it('should count phone numbers by provider type', async () => {
        setupFirestoreMocks({
            phoneNumberDocs: [
                { providerType: 'TWILIO_NATIVE' },
                { providerType: 'SIP_TRUNK' },
                { providerType: 'SIP_TRUNK' },
                { providerType: 'LEGACY' },
                { providerType: 'OTHER' },
            ],
        });

        const res = await callAdminStats();
        const body = await res.json();

        expect(body.phoneNumbers.total).toBe(5);
        expect(body.phoneNumbers.twilioNative).toBe(1);
        expect(body.phoneNumbers.sipTrunk).toBe(2);
        // "LEGACY" and "OTHER" both fall into the else branch → legacy count
        expect(body.phoneNumbers.legacy).toBe(2);
    });

    it('should include pool stats', async () => {
        setupFirestoreMocks();

        const res = await callAdminStats();
        const body = await res.json();

        expect(body.pool).toEqual({
            total: 10,
            available: 5,
            assigned: 3,
            reserved: 2,
            byCarrier: {},
        });
        expect(mockGetPoolStats).toHaveBeenCalled();
    });

    it('should include porting request count', async () => {
        setupFirestoreMocks({ portingSize: 7 });

        const res = await callAdminStats();
        const body = await res.json();

        expect(body.porting.activeRequests).toBe(7);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Go-Live Check — GET /api/system/go-live-check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Go-Live Check — GET /api/system/go-live-check', () => {
    // Store original env values to restore later
    const originalEnv: Record<string, string | undefined> = {};
    const criticalEnvKeys = [
        'OPENAI_API_KEY',
        'DEEPGRAM_API_KEY',
        'ELEVENLABS_API_KEY',
        'LEMONSQUEEZY_API_KEY',
        'LEMONSQUEEZY_STORE_ID',
        'LEMONSQUEEZY_WEBHOOK_SECRET',
        'LEMONSQUEEZY_VARIANT_STARTER',
        'LEMONSQUEEZY_VARIANT_STARTER_YEARLY',
        'LEMONSQUEEZY_VARIANT_PROFESSIONAL',
        'LEMONSQUEEZY_VARIANT_PROFESSIONAL_YEARLY',
        'LEMONSQUEEZY_VARIANT_ENTERPRISE',
        'LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY',
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Save and clear all relevant env vars
        const allKeys = [
            ...criticalEnvKeys,
            'GROQ_API_KEY',
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'ALERT_SLACK_WEBHOOK_URL',
            'ALERT_TELEGRAM_BOT_TOKEN',
            'ALERT_TELEGRAM_CHAT_ID',
            'RESEND_API_KEY',
            'EMAIL_FROM',
            'CRON_SECRET',
            'FIREBASE_SERVICE_ACCOUNT_KEY',
            'FIREBASE_SERVICE_ACCOUNT_KEY_PATH',
            'GOOGLE_APPLICATION_CREDENTIALS',
        ];

        for (const key of allKeys) {
            originalEnv[key] = process.env[key];
            delete process.env[key];
        }

        // Setup Firestore mock for the health check write
        mockSet.mockResolvedValue(undefined);
        mockDoc.mockReturnValue({ set: mockSet, get: mockGet });
        mockCollection.mockImplementation(() => ({
            doc: (...args: unknown[]) => mockDoc(...args),
            count: () => ({
                get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
            }),
            get: mockGet,
            where: (...args: unknown[]) => ({
                get: mockGet,
                count: () => ({
                    get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
                }),
            }),
        }));

        // Mock global fetch for external API checks (provider checks)
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network disabled in test')));
    });

    afterEach(() => {
        // Restore env vars
        for (const key of Object.keys(originalEnv)) {
            if (originalEnv[key] !== undefined) {
                process.env[key] = originalEnv[key];
            } else {
                delete process.env[key];
            }
        }
        vi.unstubAllGlobals();
    });

    function setCriticalEnvVars() {
        for (const key of criticalEnvKeys) {
            process.env[key] = `test-value-${key}`;
        }
    }

    async function callGoLiveCheck() {
        const mod = await import('@/app/api/system/go-live-check/route');
        return mod.GET();
    }

    it('should return GO verdict when all critical envs are set', async () => {
        setCriticalEnvVars();

        const res = await callGoLiveCheck();
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.verdict).toBe('GO');
        expect(body.summary.errors).toBe(0);
        expect(body.timestamp).toBeDefined();
    });

    it('should return NO-GO (503) when critical env missing', async () => {
        // Set only some of the critical envs — leave OPENAI_API_KEY missing
        process.env.DEEPGRAM_API_KEY = 'test-deepgram';
        process.env.ELEVENLABS_API_KEY = 'test-elevenlabs';
        // Missing: OPENAI_API_KEY, LEMONSQUEEZY_* keys

        const res = await callGoLiveCheck();
        expect(res.status).toBe(503);

        const body = await res.json();
        expect(body.verdict).toBe('NO-GO');
        expect(body.summary.errors).toBeGreaterThan(0);
        expect(body.blockers).toBeDefined();
        expect(body.blockers.length).toBeGreaterThan(0);
        // Should mention OPENAI_API_KEY in blockers
        const hasOpenaiBlocker = body.blockers.some((b: string) => b.includes('OPENAI_API_KEY'));
        expect(hasOpenaiBlocker).toBe(true);
    });

    it('should check Firestore connectivity', async () => {
        setCriticalEnvVars();

        const res = await callGoLiveCheck();
        const body = await res.json();

        // Find the firestore:connection check
        const firestoreCheck = body.checks.find((c: { name: string }) => c.name === 'firestore:connection');
        expect(firestoreCheck).toBeDefined();
        // Since our mock resolves, it should be 'ok'
        expect(firestoreCheck.status).toBe('ok');
        expect(firestoreCheck.detail).toContain('latency');
    });

    it('should check billing variants', async () => {
        setCriticalEnvVars();

        const res = await callGoLiveCheck();
        const body = await res.json();

        const variantCheck = body.checks.find((c: { name: string }) => c.name === 'billing:variants');
        expect(variantCheck).toBeDefined();
        expect(variantCheck.status).toBe('ok');
        expect(variantCheck.detail).toContain('6 plan variants');

        // Now test with missing variants
        vi.resetModules();
        delete process.env.LEMONSQUEEZY_VARIANT_STARTER;
        delete process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY;

        const res2 = await callGoLiveCheck();
        const body2 = await res2.json();
        const variantCheck2 = body2.checks.find((c: { name: string }) => c.name === 'billing:variants');
        expect(variantCheck2.status).toBe('error');
        expect(variantCheck2.detail).toContain('Missing');
    });

    it('should include alerting channel status', async () => {
        setCriticalEnvVars();
        process.env.ALERT_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

        const res = await callGoLiveCheck();
        const body = await res.json();

        const alertCheck = body.checks.find((c: { name: string }) => c.name === 'alerting:channels');
        expect(alertCheck).toBeDefined();
        expect(alertCheck.status).toBe('ok'); // Slack is configured
        expect(alertCheck.detail).toContain('Slack: ready');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Monitoring Errors — POST /api/monitoring/errors
// ═══════════════════════════════════════════════════════════════════════════════

describe('Monitoring Errors — POST /api/monitoring/errors', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Restore default mock behavior
        mockCaptureError.mockReturnValue({
            id: 'evt-123',
            fingerprint: 'fp-123',
            level: 'error',
            message: 'Test error',
            timestamp: '2024-01-01T00:00:00.000Z',
        });
        mockRateLimitResponse.mockImplementation((windowMs?: number) => {
            const { NextResponse } = require('next/server');
            return NextResponse.json(
                { error: 'Rate limit exceeded', code: 'RATE_LIMITED', retryAfterMs: windowMs || 60000 },
                { status: 429 },
            );
        });
    });

    async function callMonitoringPost(body: Record<string, unknown>, headers?: Record<string, string>) {
        const { POST } = await import('@/app/api/monitoring/errors/route');
        const req = createMockRequest('/api/monitoring/errors', {
            method: 'POST',
            body,
            headers: {
                'x-forwarded-for': '192.168.1.1',
                ...headers,
            },
        });
        return POST(req);
    }

    it('should capture error and return 201', async () => {
        const res = await callMonitoringPost({
            message: 'Something went wrong',
            source: 'client',
            stack: 'Error: Something went wrong\n    at test.ts:1:1',
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.captured).toBe(true);
        expect(body.fingerprint).toBe('fp-123');
        expect(mockCaptureError).toHaveBeenCalled();
    });

    it('should return 400 when message is missing', async () => {
        const res = await callMonitoringPost({
            source: 'client',
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(mockCreateApiError).toHaveBeenCalledWith('VALIDATION_ERROR', 'message gerekli');
    });

    it('should include fingerprint in response', async () => {
        mockCaptureError.mockReturnValue({
            id: 'evt-456',
            fingerprint: 'fp-unique-456',
            level: 'error',
            message: 'Unique error',
        });

        const res = await callMonitoringPost({ message: 'Unique error' });
        const body = await res.json();

        expect(body.fingerprint).toBe('fp-unique-456');
        expect(body.captured).toBe(true);
    });

    it('should extract userId and tenantId from headers', async () => {
        await callMonitoringPost(
            { message: 'Error with context' },
            {
                'x-user-uid': 'user-abc',
                'x-user-tenant': 'tenant-xyz',
            },
        );

        expect(mockCaptureError).toHaveBeenCalled();
        const callArgs = mockCaptureError.mock.calls[0];
        // First arg is the Error object, second is the context
        const context = callArgs[1];
        expect(context.userId).toBe('user-abc');
        expect(context.tenantId).toBe('tenant-xyz');
    });

    it('should handle rate limiting after 51+ calls', async () => {
        // The route module has per-IP rate limiting with a Map.
        // We need a single module import so the Map persists across calls.
        const { POST } = await import('@/app/api/monitoring/errors/route');

        // Use a unique IP to avoid interference from other tests
        const testIp = '10.99.99.99';

        let lastRes: Response | undefined;
        // Send 51 requests from the same IP — first 50 should pass, 51st should be rate limited
        for (let i = 0; i < 51; i++) {
            const req = createMockRequest('/api/monitoring/errors', {
                method: 'POST',
                body: { message: `Error ${i}` },
                headers: { 'x-forwarded-for': testIp },
            });
            lastRes = await POST(req);
        }

        expect(lastRes!.status).toBe(429);
        expect(mockRateLimitResponse).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Monitoring Errors — GET /api/monitoring/errors
// ═══════════════════════════════════════════════════════════════════════════════

describe('Monitoring Errors — GET /api/monitoring/errors', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Restore default mock behavior
        mockRequireAuth.mockReturnValue(null);
        mockGetRecentErrors.mockReturnValue([
            { fingerprint: 'fp-1', message: 'Error 1', count: 3, lastSeen: '2024-01-01' },
            { fingerprint: 'fp-2', message: 'Error 2', count: 1, lastSeen: '2024-01-02' },
        ]);
        mockGetErrorStats.mockReturnValue({
            total: 10,
            errors: 7,
            warnings: 3,
            uniqueFingerprints: 5,
            errorsThisMinute: 2,
        });
        mockErrorResponse.mockImplementation((apiError: { code: string; message: string; statusCode: number }) => {
            const { NextResponse } = require('next/server');
            return NextResponse.json(
                { error: apiError.message, code: apiError.code, timestamp: new Date().toISOString() },
                { status: apiError.statusCode },
            );
        });
        mockCreateApiError.mockImplementation((code: string, message: string) => {
            const statusMap: Record<string, number> = {
                VALIDATION_ERROR: 400,
                AUTH_ERROR: 401,
                NOT_FOUND: 404,
                RATE_LIMITED: 429,
                INTERNAL_ERROR: 500,
            };
            return { code, message, statusCode: statusMap[code] || 400 };
        });
    });

    async function callMonitoringGet(headers?: Record<string, string>, query?: string) {
        const { GET } = await import('@/app/api/monitoring/errors/route');
        const url = query ? `/api/monitoring/errors?${query}` : '/api/monitoring/errors';
        const req = createMockRequest(url, {
            method: 'GET',
            headers: {
                'x-user-uid': 'admin-uid',
                'x-user-role': 'admin',
                ...headers,
            },
        });
        return GET(req);
    }

    it('should return errors for admin user', async () => {
        const res = await callMonitoringGet({
            'x-user-uid': 'admin-uid',
            'x-user-role': 'admin',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.errors).toHaveLength(2);
        expect(body.stats).toBeDefined();
        expect(body.stats.total).toBe(10);
        expect(body.timestamp).toBeDefined();
    });

    it('should return errors for owner role', async () => {
        const res = await callMonitoringGet({
            'x-user-uid': 'owner-uid',
            'x-user-role': 'owner',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.errors).toHaveLength(2);
        expect(body.stats.total).toBe(10);
    });

    it('should return error when uid missing', async () => {
        // When uid is missing, requireAuth returns an error object
        mockRequireAuth.mockReturnValue({
            code: 'AUTH_ERROR',
            message: 'Kimlik doğrulama gerekli',
            statusCode: 401,
        });

        const res = await callMonitoringGet({
            // No x-user-uid header
            'x-user-role': 'admin',
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(mockRequireAuth).toHaveBeenCalled();
    });

    it('should return error when role is not admin/owner', async () => {
        const res = await callMonitoringGet({
            'x-user-uid': 'user-uid',
            'x-user-role': 'member',
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(mockCreateApiError).toHaveBeenCalledWith(
            'AUTH_ERROR',
            'Yalnızca yöneticiler hata loglarını görebilir',
        );
    });

    it('should respect limit query param', async () => {
        const res = await callMonitoringGet(
            { 'x-user-uid': 'admin-uid', 'x-user-role': 'admin' },
            'limit=10',
        );

        expect(res.status).toBe(200);
        expect(mockGetRecentErrors).toHaveBeenCalledWith(10);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test Endpoint Production Guards
// ═══════════════════════════════════════════════════════════════════════════════

describe('test endpoint production guards', () => {
    const originalEnv = process.env.NODE_ENV;

    // Mock dependencies for voice/test-e2e route
    vi.mock('@/lib/ai/llm-fallback-chain', () => ({
        generateWithFallback: vi.fn(),
        getLLMProviderStatus: vi.fn().mockReturnValue({}),
    }));
    vi.mock('@/lib/ai/intent-fast', () => ({
        detectIntentFast: vi.fn(),
        shouldShortcut: vi.fn(),
        getShortcutResponse: vi.fn(),
    }));
    vi.mock('@/lib/voice/circuit-breaker', () => ({
        openaiCircuitBreaker: { getState: vi.fn() },
        groqCircuitBreaker: { getState: vi.fn() },
        geminiCircuitBreaker: { getState: vi.fn() },
        gpuCircuitBreaker: { getState: vi.fn() },
    }));
    vi.mock('@/lib/voice/response-cache', () => ({
        inferCache: { getStats: vi.fn() },
    }));
    // @/lib/utils/error-handler and @/lib/utils/get-app-url are already mocked above

    // Mock dependency for billing/alert-test route
    vi.mock('@/lib/billing/alert-dispatcher', () => ({
        dispatchAlert: vi.fn(),
    }));

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        vi.restoreAllMocks();
    });

    it('voice/test-e2e returns 404 in production', async () => {
        process.env.NODE_ENV = 'production';
        vi.resetModules();
        const { GET } = await import('@/app/api/voice/test-e2e/route');
        const res = await GET();
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Not found');
    });

    it('twilio/test returns 404 in production', async () => {
        process.env.NODE_ENV = 'production';
        vi.resetModules();
        const { GET } = await import('@/app/api/twilio/test/route');
        const res = await GET();
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Not found');
    });

    it('billing/alert-test POST returns 404 in production', async () => {
        process.env.NODE_ENV = 'production';
        vi.resetModules();
        const req = new Request('http://localhost/api/billing/alert-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'info' }),
        });
        const { POST } = await import('@/app/api/billing/alert-test/route');
        const res = await POST(req as any);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Not found');
    });

    it('voice/test returns 404 in production', async () => {
        process.env.NODE_ENV = 'production';
        vi.resetModules();
        const { GET } = await import('@/app/api/voice/test/route');
        const res = await GET();
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Not found');
    });
});
