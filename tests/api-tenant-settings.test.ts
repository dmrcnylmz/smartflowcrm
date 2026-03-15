/**
 * API Tenant Settings, Voicemails, and GDPR Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockAdd = vi.fn().mockResolvedValue({ id: 'doc-1' });
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                update: mockUpdate,
                delete: mockDelete,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                        update: mockUpdate,
                    }),
                    add: mockAdd,
                    get: vi.fn().mockResolvedValue({ docs: [] }),
                    limit: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                    }),
                    orderBy: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                        limit: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ docs: [] }),
                        }),
                    }),
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                        orderBy: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ docs: [] }),
                            limit: vi.fn().mockReturnValue({
                                get: vi.fn().mockResolvedValue({ docs: [] }),
                            }),
                        }),
                    }),
                }),
            }),
        }),
        batch: vi.fn().mockReturnValue({
            delete: vi.fn(),
            update: vi.fn(),
            commit: vi.fn().mockResolvedValue(undefined),
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

// ── Additional mocks for settings route ──
vi.mock('@/lib/billing/lemonsqueezy', () => ({
    getSubscription: vi.fn().mockResolvedValue(null),
    isSubscriptionActive: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/utils/cache-headers', () => ({
    cacheHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockImplementation((_err: unknown, _ctx: string) =>
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    ),
    createApiError: vi.fn().mockImplementation((code: string, message: string) => ({ code, message })),
    errorResponse: vi.fn().mockImplementation((err: { message: string }) =>
        new Response(JSON.stringify({ error: err.message }), { status: 400 }),
    ),
}));

describe('API Tenant Settings Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
        // Default: tenant doc exists with basic data
        mockGet.mockResolvedValue({
            exists: true,
            id: 'tenant-123',
            data: () => ({
                companyName: 'Test Co',
                language: 'tr',
                role: 'owner',
            }),
        });
    });

    // ── Settings GET ──
    describe('/api/tenant/settings GET', () => {
        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenant/settings/route');
            const request = createMockRequest('/api/tenant/settings');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should export GET and PUT functions', async () => {
            const mod = await import('@/app/api/tenant/settings/route');
            expect(mod.GET).toBeDefined();
            expect(mod.PUT).toBeDefined();
            expect(typeof mod.GET).toBe('function');
            expect(typeof mod.PUT).toBe('function');
        });
    });

    // ── Settings PUT (PATCH equivalent) ──
    describe('/api/tenant/settings PUT', () => {
        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { PUT } = await import('@/app/api/tenant/settings/route');
            const request = createMockRequest('/api/tenant/settings', {
                method: 'PUT',
                body: { companyName: 'Updated' },
            });
            const response = await PUT(request);
            expect(response.status).toBe(401);
        });
    });

    // ── Voicemails GET ──
    describe('/api/tenant/voicemails GET', () => {
        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenant/voicemails/route');
            const request = createMockRequest('/api/tenant/voicemails');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should export GET and PATCH functions', async () => {
            const mod = await import('@/app/api/tenant/voicemails/route');
            expect(mod.GET).toBeDefined();
            expect(mod.PATCH).toBeDefined();
            expect(typeof mod.GET).toBe('function');
            expect(typeof mod.PATCH).toBe('function');
        });
    });

    // ── GDPR GET (data export) ──
    describe('/api/tenant/gdpr GET', () => {
        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr?action=export');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should export GET and POST functions', async () => {
            const mod = await import('@/app/api/tenant/gdpr/route');
            expect(mod.GET).toBeDefined();
            expect(mod.POST).toBeDefined();
            expect(typeof mod.GET).toBe('function');
            expect(typeof mod.POST).toBe('function');
        });
    });

    // ── GDPR POST (data deletion/anonymization) ──
    describe('/api/tenant/gdpr POST', () => {
        it('should require auth (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { POST } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr', {
                method: 'POST',
                body: { action: 'delete-customer', customerId: 'cust-1' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });
    });
});
