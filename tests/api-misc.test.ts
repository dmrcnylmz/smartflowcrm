/**
 * API Misc Tests — Leads, Locale, Metrics, Health, AI Status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockAdd = vi.fn().mockResolvedValue({ id: 'lead-1' });

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
            }),
            add: mockAdd,
            where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                }),
            }),
        }),
        listCollections: vi.fn().mockResolvedValue([]),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TS'),
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

// ── Leads deps ──
vi.mock('@/lib/utils/rate-limiter', () => ({
    checkSensitiveLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockImplementation((_err: unknown, _ctx: string) =>
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    ),
}));

// ── Locale deps ──
vi.mock('@/lib/i18n/config', () => ({
    isValidLocale: vi.fn().mockImplementation((locale: string) =>
        ['tr', 'en', 'de', 'fr'].includes(locale),
    ),
}));

// ── Metrics deps ──
vi.mock('@/lib/utils/monitoring', () => ({
    monitor: {
        getHealthSummary: vi.fn().mockReturnValue({ status: 'healthy' }),
        getMetrics: vi.fn().mockReturnValue([]),
    },
}));

vi.mock('@/lib/utils/cache-headers', () => ({
    cacheHeaders: vi.fn().mockReturnValue({}),
}));

// ── Health deps ──
vi.mock('@/lib/env', () => ({
    warnMissingOptionalKeys: vi.fn(),
    getFeatureStatus: vi.fn().mockReturnValue([
        { name: 'voice', ready: true, detail: 'ok' },
    ]),
}));

vi.mock('@/lib/voice/circuit-breaker', () => ({
    gpuCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
    openaiCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
    groqCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
    cartesiaCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
    deepgramCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
    murfCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
    kokoroCircuitBreaker: { getState: vi.fn().mockReturnValue('CLOSED') },
}));

vi.mock('@/lib/monitoring/upstream-monitor', () => ({
    getServiceHealth: vi.fn().mockReturnValue([]),
}));

// ── AI Status deps ──
vi.mock('@/lib/ai/ollama', () => ({
    isOllamaAvailable: vi.fn().mockResolvedValue(false),
    getAvailableModels: vi.fn().mockResolvedValue([]),
}));

describe('API Misc Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    // ── Leads ──
    describe('/api/leads POST', () => {
        it('should export a POST function', async () => {
            const mod = await import('@/app/api/leads/route');
            expect(mod.POST).toBeDefined();
            expect(typeof mod.POST).toBe('function');
        });

        it('should be a public endpoint (no auth required)', async () => {
            const { POST } = await import('@/app/api/leads/route');
            const request = createMockRequest('/api/leads', {
                method: 'POST',
                body: { email: 'test@example.com', source: 'landing' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should return 400 for invalid email', async () => {
            const { POST } = await import('@/app/api/leads/route');
            const request = createMockRequest('/api/leads', {
                method: 'POST',
                body: { email: 'not-an-email' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });

    // ── Locale ──
    describe('/api/locale POST', () => {
        it('should export a POST function', async () => {
            const mod = await import('@/app/api/locale/route');
            expect(mod.POST).toBeDefined();
            expect(typeof mod.POST).toBe('function');
        });

        it('should set locale cookie for valid locale', async () => {
            const { POST } = await import('@/app/api/locale/route');
            const request = createMockRequest('/api/locale', {
                method: 'POST',
                body: { locale: 'en' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.locale).toBe('en');
        });

        it('should return 400 for invalid locale', async () => {
            const { POST } = await import('@/app/api/locale/route');
            const request = createMockRequest('/api/locale', {
                method: 'POST',
                body: { locale: 'xx' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });

    // ── Metrics ──
    describe('/api/metrics GET', () => {
        it('should export a GET function', async () => {
            const mod = await import('@/app/api/metrics/route');
            expect(mod.GET).toBeDefined();
            expect(typeof mod.GET).toBe('function');
        });

        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/metrics/route');
            const request = createMockRequest('/api/metrics');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return metrics data when authenticated', async () => {
            const { GET } = await import('@/app/api/metrics/route');
            const request = createMockRequest('/api/metrics', {
                headers: { Authorization: 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('ok');
            expect(data.health).toBeDefined();
            expect(data.system).toBeDefined();
        });
    });

    // ── Health ──
    describe('/api/health GET', () => {
        it('should export a GET function', async () => {
            const mod = await import('@/app/api/health/route');
            expect(mod.GET).toBeDefined();
            expect(typeof mod.GET).toBe('function');
        });

        it('should be a public endpoint (no auth required)', async () => {
            // Mock fetch for health checks
            const originalFetch = globalThis.fetch;
            globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

            const { GET } = await import('@/app/api/health/route');
            const response = await GET();
            const data = await response.json();

            expect([200, 503]).toContain(response.status);
            expect(data.status).toBeDefined();
            expect(data.timestamp).toBeDefined();
            expect(data.services).toBeDefined();
            expect(data.config).toBeDefined();

            globalThis.fetch = originalFetch;
        });
    });

    // ── AI Status ──
    describe('/api/ai/status GET', () => {
        it('should export a GET function', async () => {
            const mod = await import('@/app/api/ai/status/route');
            expect(mod.GET).toBeDefined();
            expect(typeof mod.GET).toBe('function');
        });

        it('should be a public endpoint and return provider info', async () => {
            const { GET } = await import('@/app/api/ai/status/route');
            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('ok');
            expect(data.providers).toBeDefined();
            expect(data.providers.ollama).toBeDefined();
            expect(data.providers.openai).toBeDefined();
            expect(data.defaultProvider).toBeDefined();
        });
    });
});
