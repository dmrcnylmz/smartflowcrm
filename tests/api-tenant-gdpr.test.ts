/**
 * GDPR Route Tests
 *
 * Tests for GET and POST /api/tenant/gdpr
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createAuthenticatedRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ─────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                    exists: true,
                    id: 'tenant-123',
                    data: () => ({ companyName: 'Test Co' }),
                }),
                collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ docs: [] }),
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                name: 'Test Customer',
                                email: 'customer@example.com',
                            }),
                        }),
                    }),
                    add: vi.fn().mockResolvedValue({ id: 'log-1' }),
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                    }),
                }),
            }),
        }),
        batch: vi.fn().mockReturnValue({
            delete: vi.fn(),
            update: vi.fn(),
            commit: vi.fn().mockResolvedValue(undefined),
        }),
        listCollections: vi.fn().mockResolvedValue([]),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
    },
}));

// ── requireStrictAuth mock ──────────────────────────────────────────────────
const mockRequireStrictAuth = vi.fn();
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Error handler mock ──────────────────────────────────────────────────────
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    ),
    createApiError: vi.fn().mockImplementation((code: string, message: string) => {
        const statusMap: Record<string, number> = {
            VALIDATION_ERROR: 400,
            AUTH_ERROR: 401,
            NOT_FOUND: 404,
        };
        return { code, message, statusCode: statusMap[code] || 500 };
    }),
    errorResponse: vi.fn().mockImplementation((apiError: { code: string; message: string; statusCode: number }) => {
        const { NextResponse } = require('next/server');
        return NextResponse.json(
            { error: apiError.message, code: apiError.code },
            { status: apiError.statusCode },
        );
    }),
}));

// ── Cache headers mock ──────────────────────────────────────────────────────
vi.mock('@/lib/utils/cache-headers', () => ({
    cacheHeaders: vi.fn().mockReturnValue({}),
}));

describe('GDPR — GET /api/tenant/gdpr', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        mockRequireStrictAuth.mockResolvedValue({
            uid: 'user-1',
            email: 'admin@example.com',
            tenantId: 'tenant-123',
        });
    });

    it('rejects unauthenticated requests (401)', async () => {
        const { NextResponse } = await import('next/server');
        mockRequireStrictAuth.mockResolvedValue({
            error: NextResponse.json(
                { error: 'Kimlik dogrulama gerekli', code: 'AUTH_ERROR' },
                { status: 401 },
            ),
        });

        const { GET } = await import('@/app/api/tenant/gdpr/route');
        const req = createMockRequest('/api/tenant/gdpr?action=export');

        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('GET handler exists and is a function', async () => {
        const mod = await import('@/app/api/tenant/gdpr/route');
        expect(mod.GET).toBeDefined();
        expect(typeof mod.GET).toBe('function');
    });

    it('GET returns data export for authenticated admin', async () => {
        const { GET } = await import('@/app/api/tenant/gdpr/route');
        const req = createMockRequest('/api/tenant/gdpr?action=export', {
            headers: {
                Authorization: 'Bearer test-token',
                'x-user-role': 'owner',
            },
        });

        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toContain('gdpr-export');
    });
});

describe('GDPR — POST /api/tenant/gdpr', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        mockRequireStrictAuth.mockResolvedValue({
            uid: 'user-1',
            email: 'admin@example.com',
            tenantId: 'tenant-123',
        });
    });

    it('rejects unauthenticated requests (401)', async () => {
        const { NextResponse } = await import('next/server');
        mockRequireStrictAuth.mockResolvedValue({
            error: NextResponse.json(
                { error: 'Kimlik dogrulama gerekli', code: 'AUTH_ERROR' },
                { status: 401 },
            ),
        });

        const { POST } = await import('@/app/api/tenant/gdpr/route');
        const req = createMockRequest('/api/tenant/gdpr', {
            method: 'POST',
            body: { action: 'delete-customer', customerId: 'cust-1' },
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('POST requires action field in body', async () => {
        const { POST } = await import('@/app/api/tenant/gdpr/route');
        const req = createMockRequest('/api/tenant/gdpr', {
            method: 'POST',
            body: { customerId: 'cust-1' },
            headers: {
                Authorization: 'Bearer test-token',
                'x-user-role': 'owner',
            },
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
    });

    it('POST handler exists and is a function', async () => {
        const mod = await import('@/app/api/tenant/gdpr/route');
        expect(mod.POST).toBeDefined();
        expect(typeof mod.POST).toBe('function');
    });
});
