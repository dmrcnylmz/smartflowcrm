/**
 * API Billing Extended Tests — Invoices, Usage (already tested), Analytics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({ get: mockGet, set: mockSet }),
                    add: vi.fn().mockResolvedValue({ id: 'doc-1' }),
                    get: vi.fn().mockResolvedValue({ docs: [] }),
                    where: vi.fn().mockReturnValue({
                        orderBy: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                get: vi.fn().mockResolvedValue({ docs: [] }),
                            }),
                        }),
                    }),
                    orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ docs: [] }),
                        }),
                    }),
                }),
            }),
        }),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TS'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
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

// ── Analytics deps ──
vi.mock('@/lib/firebase/admin-db', () => ({
    getTenantFromRequest: vi.fn().mockReturnValue('tenant-123'),
}));

vi.mock('@/lib/billing/analytics', () => ({
    getLatencyStats: vi.fn().mockResolvedValue({ avg: 100, p95: 200 }),
    getProviderBreakdown: vi.fn().mockResolvedValue([]),
    getCostTrend: vi.fn().mockResolvedValue([]),
    getDailyMetrics: vi.fn().mockResolvedValue([]),
    getPipelineSummary: vi.fn().mockResolvedValue({ totalCalls: 0 }),
}));

vi.mock('@/lib/utils/cache-headers', () => ({
    cacheHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/billing/metering', () => ({
    getUsage: vi.fn().mockResolvedValue({ totalMinutes: 45, totalCalls: 30, period: '2024-01' }),
    getUsageHistory: vi.fn().mockResolvedValue([]),
    estimateCost: vi.fn().mockReturnValue({ totalTry: 150 }),
    checkUsageLimits: vi.fn().mockReturnValue({ minutesRemaining: 15, callsRemaining: 70 }),
    estimatePerCallCost: vi.fn().mockReturnValue({ costTry: 5 }),
    SUBSCRIPTION_TIERS: {
        starter: { name: 'Starter', includedMinutes: 60, includedCalls: 100 },
    },
}));

vi.mock('@/lib/billing/lemonsqueezy', () => ({
    getSubscription: vi.fn().mockResolvedValue(null),
    isSubscriptionActive: vi.fn().mockReturnValue(true),
    PLANS: {
        starter: { id: 'starter', name: 'Starter', prices: { TRY: { monthly: 299, yearly: 2990 } }, includedMinutes: 60, includedCalls: 100, maxConcurrentSessions: 1, features: [] },
    },
}));

describe('API Billing Extended Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    // ── Invoices ──
    describe('/api/billing/invoices GET', () => {
        it('should export a GET function', async () => {
            const mod = await import('@/app/api/billing/invoices/route');
            expect(mod.GET).toBeDefined();
            expect(typeof mod.GET).toBe('function');
        });

        it('should require tenant header (403 without it)', async () => {
            const { GET } = await import('@/app/api/billing/invoices/route');
            const request = createMockRequest('/api/billing/invoices');
            // No x-user-tenant header
            const response = await GET(request);
            expect(response.status).toBe(403);
        });

        it('should return activities when authenticated with tenant header', async () => {
            const { GET } = await import('@/app/api/billing/invoices/route');
            const request = createMockRequest('/api/billing/invoices', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.activities).toBeDefined();
            expect(data.count).toBeDefined();
        });
    });

    // ── Usage (auth test) ──
    describe('/api/billing/usage GET', () => {
        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/billing/usage/route');
            const request = createMockRequest('/api/billing/usage');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should export a GET function', async () => {
            const mod = await import('@/app/api/billing/usage/route');
            expect(mod.GET).toBeDefined();
            expect(typeof mod.GET).toBe('function');
        });
    });

    // ── Analytics ──
    describe('/api/billing/analytics GET', () => {
        it('should export a GET function', async () => {
            const mod = await import('@/app/api/billing/analytics/route');
            expect(mod.GET).toBeDefined();
            expect(typeof mod.GET).toBe('function');
        });

        it('should require auth (401 without tenant)', async () => {
            vi.mocked((await import('@/lib/firebase/admin-db')).getTenantFromRequest).mockReturnValueOnce(null as never);

            const { GET } = await import('@/app/api/billing/analytics/route');
            const request = createMockRequest('/api/billing/analytics');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return analytics data with tenant header', async () => {
            const { GET } = await import('@/app/api/billing/analytics/route');
            const request = createMockRequest('/api/billing/analytics?type=summary&range=7d', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.summary).toBeDefined();
        });
    });
});
