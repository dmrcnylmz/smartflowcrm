/**
 * API Admin Tests — Stats + Super Analytics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createAuthError } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [], size: 0 });
const mockCountGet = vi.fn().mockResolvedValue({ data: () => ({ count: 5 }) });

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
                collection: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                    }),
                }),
            }),
            get: mockCollectionGet,
            count: vi.fn().mockReturnValue({ get: mockCountGet }),
            where: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ docs: [], size: 0 }),
            }),
        }),
        collectionGroup: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ docs: [] }),
            where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
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
    email: 'admin@callception.com',
    tenantId: 'tenant-123',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

vi.mock('@/lib/phone/number-pool', () => ({
    getPoolStats: vi.fn().mockResolvedValue({
        total: 10,
        available: 5,
        assigned: 5,
    }),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((_err: unknown, context: string) =>
        new Response(JSON.stringify({ error: `${context} failed` }), { status: 500 }),
    ),
}));

describe('API Admin Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'admin@callception.com',
            tenantId: 'tenant-123',
        });
    });

    // ── Admin Stats ──
    describe('/api/admin/stats GET', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/admin/stats/route');
            const request = createMockRequest('/api/admin/stats');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return 403 for non-super-admin user', async () => {
            // requireSuperAdmin calls requireStrictAuth, then checks email domain
            // A non-callception.com email should get 403
            mockRequireStrictAuth.mockResolvedValueOnce({
                uid: 'test-uid',
                email: 'user@example.com',
                tenantId: 'tenant-123',
            });

            const { GET } = await import('@/app/api/admin/stats/route');
            const request = createMockRequest('/api/admin/stats', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(403);
        });

        it('should return stats for super-admin', async () => {
            mockCollectionGet.mockResolvedValueOnce({
                docs: [],
                size: 0,
            });

            const { GET } = await import('@/app/api/admin/stats/route');
            const request = createMockRequest('/api/admin/stats', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.tenants).toBeDefined();
            expect(data.phoneNumbers).toBeDefined();
            expect(data.pool).toBeDefined();
        });

        it('should export GET function', async () => {
            const route = await import('@/app/api/admin/stats/route');
            expect(typeof route.GET).toBe('function');
        });
    });

    // ── Super Analytics ──
    describe('/api/admin/super/analytics GET', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/admin/super/analytics/route');
            const request = createMockRequest('/api/admin/super/analytics');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return 403 for non-super-admin user', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                uid: 'test-uid',
                email: 'user@example.com',
                tenantId: 'tenant-123',
            });

            const { GET } = await import('@/app/api/admin/super/analytics/route');
            const request = createMockRequest('/api/admin/super/analytics', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(403);
        });

        it('should return analytics for super-admin', async () => {
            const { GET } = await import('@/app/api/admin/super/analytics/route');
            const request = createMockRequest('/api/admin/super/analytics?range=7d', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.range).toBe('7d');
            expect(data.days).toBe(7);
            expect(data.platform).toBeDefined();
            expect(data.generatedAt).toBeDefined();
        });

        it('should export GET function', async () => {
            const route = await import('@/app/api/admin/super/analytics/route');
            expect(typeof route.GET).toBe('function');
        });
    });
});
