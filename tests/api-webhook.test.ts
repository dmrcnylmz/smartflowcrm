/**
 * API Webhook Tests — Call webhook + Manage webhook CRUD
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createWebhookRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockAdd = vi.fn().mockResolvedValue({ id: 'call-log-1' });
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);

const mockTenantGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockTenantGet,
                set: mockSet,
                update: mockUpdate,
                delete: mockDelete,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                        update: mockUpdate,
                        delete: mockDelete,
                    }),
                    add: mockAdd,
                    get: vi.fn().mockResolvedValue({ docs: [] }),
                    orderBy: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                    }),
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                        }),
                        orderBy: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                get: vi.fn().mockResolvedValue({ docs: [] }),
                            }),
                        }),
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                    }),
                    count: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
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

// ── Webhook call route deps ──
vi.mock('@/lib/firebase/admin-db', () => ({
    addCallLog: vi.fn().mockResolvedValue({ id: 'call-log-1' }),
    addActivityLog: vi.fn().mockResolvedValue(undefined),
    getCustomerByPhone: vi.fn().mockResolvedValue({ id: 'cust-1', name: 'Test Customer' }),
    createCustomer: vi.fn().mockResolvedValue({ id: 'new-cust' }),
    getCustomer: vi.fn().mockResolvedValue({ id: 'new-cust', name: 'New' }),
    getTenantFromRequest: vi.fn().mockReturnValue('tenant-123'),
    Timestamp: { now: vi.fn().mockReturnValue('MOCK_TS') },
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    ),
    requireFields: vi.fn().mockImplementation((body: Record<string, unknown>, fields: string[]) => {
        for (const f of fields) {
            if (!body[f]) return { code: 'VALIDATION_ERROR', message: `${f} is required` };
        }
        return null;
    }),
    errorResponse: vi.fn().mockImplementation((err: { message: string }) =>
        new Response(JSON.stringify({ error: err.message }), { status: 400 }),
    ),
    createApiError: vi.fn().mockImplementation((code: string, message: string) => ({ code, message })),
}));

// ── requireStrictAuth mock (for webhook manage) ──
const mockRequireStrictAuth = vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    tenantId: 'tenant-123',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Webhook manage deps ──
vi.mock('@/lib/utils/cache-headers', () => ({
    cacheHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/webhook/dispatcher', () => ({
    generateWebhookSecret: vi.fn().mockReturnValue('whsec_mock_secret_1234567890'),
    getWebhookLogs: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/webhook/types', () => ({
    WEBHOOK_EVENT_LABELS: {
        'call.completed': 'Call Completed',
        'call.missed': 'Call Missed',
        'voicemail.new': 'New Voicemail',
    },
}));

vi.mock('@/lib/utils/rate-limiter', () => ({
    checkSensitiveLimit: vi.fn().mockResolvedValue({ success: true }),
}));

describe('API Webhook Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
        mockTenantGet.mockResolvedValue({ exists: true, data: () => ({}) });
    });

    // ── Webhook Call ──
    describe('/api/webhook/call POST', () => {
        it('should export a POST function', async () => {
            const mod = await import('@/app/api/webhook/call/route');
            expect(mod.POST).toBeDefined();
            expect(typeof mod.POST).toBe('function');
        });

        it('should validate API key when WEBHOOK_API_KEY is configured', async () => {
            const originalEnv = process.env.WEBHOOK_API_KEY;
            process.env.WEBHOOK_API_KEY = 'test-secret-key';

            // Re-import to pick up env
            vi.resetModules();

            // Re-apply mocks after resetModules
            vi.doMock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));
            vi.doMock('firebase-admin/firestore', () => ({
                getFirestore: vi.fn(() => ({
                    collection: vi.fn().mockReturnValue({
                        doc: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ exists: true }),
                            collection: vi.fn().mockReturnValue({
                                doc: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
                            }),
                        }),
                    }),
                })),
                FieldValue: { serverTimestamp: vi.fn(() => 'TS') },
            }));
            vi.doMock('@/lib/firebase/admin-db', () => ({
                addCallLog: vi.fn().mockResolvedValue({ id: 'cl-1' }),
                addActivityLog: vi.fn(),
                getCustomerByPhone: vi.fn().mockResolvedValue({ id: 'c1', name: 'C' }),
                createCustomer: vi.fn(),
                getCustomer: vi.fn(),
                getTenantFromRequest: vi.fn().mockReturnValue('tenant-123'),
                Timestamp: { now: vi.fn() },
            }));
            vi.doMock('@/lib/utils/error-handler', () => ({
                handleApiError: vi.fn().mockReturnValue(
                    new Response(JSON.stringify({ error: 'err' }), { status: 500 }),
                ),
                requireFields: vi.fn().mockReturnValue(null),
                errorResponse: vi.fn().mockImplementation((e: { message: string }) =>
                    new Response(JSON.stringify({ error: e.message }), { status: 400 }),
                ),
                createApiError: vi.fn(),
            }));

            const { POST } = await import('@/app/api/webhook/call/route');

            // Request without API key should be rejected
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                body: { customerPhone: '+15551234567', tenantId: 'tenant-123' },
            });

            const response = await POST(request);
            expect(response.status).toBe(401);

            process.env.WEBHOOK_API_KEY = originalEnv;
        });
    });

    // ── Webhook Manage ──
    describe('/api/webhook/manage', () => {
        it('should require auth for GET (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/webhook/manage/route');
            const request = createMockRequest('/api/webhook/manage');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should export GET, POST, PUT, DELETE functions (CRUD)', async () => {
            const mod = await import('@/app/api/webhook/manage/route');
            expect(mod.GET).toBeDefined();
            expect(mod.POST).toBeDefined();
            expect(mod.PUT).toBeDefined();
            expect(mod.DELETE).toBeDefined();
            expect(typeof mod.GET).toBe('function');
            expect(typeof mod.POST).toBe('function');
            expect(typeof mod.PUT).toBe('function');
            expect(typeof mod.DELETE).toBe('function');
        });

        it('should require auth for POST (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { POST } = await import('@/app/api/webhook/manage/route');
            const request = createMockRequest('/api/webhook/manage', {
                method: 'POST',
                body: { url: 'https://example.com/hook', events: ['call.completed'] },
            });

            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should require auth for DELETE (401 when auth fails)', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { DELETE } = await import('@/app/api/webhook/manage/route');
            const request = createMockRequest('/api/webhook/manage', {
                method: 'DELETE',
                body: { webhookId: 'wh-123' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(401);
        });
    });
});
