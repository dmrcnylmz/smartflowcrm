/**
 * API Tenant Tests — Tenants CRUD, Settings, GDPR, Compliance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

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
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                        update: mockUpdate,
                        delete: mockDeleteDoc,
                    }),
                    add: mockAdd,
                    get: mockCollectionGet,
                    orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({ get: mockCollectionGet }),
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

// ── Tenant admin mocks ──
vi.mock('@/lib/tenant/admin', () => ({
    createTenant: vi.fn().mockResolvedValue('new-tenant-id'),
    listTenants: vi.fn().mockResolvedValue([]),
    getTenant: vi.fn().mockResolvedValue({ id: 'tenant-123', companyName: 'Test Co' }),
    updateTenant: vi.fn().mockResolvedValue(undefined),
    assignUserToTenant: vi.fn().mockResolvedValue(undefined),
}));

// ── Billing mocks ──
vi.mock('@/lib/billing/lemonsqueezy', () => ({
    getSubscription: vi.fn().mockResolvedValue(null),
    isSubscriptionActive: vi.fn().mockReturnValue(true),
}));

// ── Compliance mocks ──
vi.mock('@/lib/compliance/audit', () => ({
    queryAuditLogs: vi.fn().mockResolvedValue([
        { id: 'log-1', action: 'data-export', timestamp: '2024-01-01' },
    ]),
    redactPII: vi.fn().mockReturnValue({ original: 'test@email.com', redacted: '***@***.com', piiFound: true }),
    recordConsent: vi.fn().mockResolvedValue('consent-1'),
    getRetentionPolicy: vi.fn().mockResolvedValue({ retentionDays: 365 }),
}));

describe('API Tenant Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
        mockGet.mockResolvedValue({
            exists: true,
            id: 'tenant-123',
            data: () => ({
                companyName: 'Test Co',
                language: 'tr',
                agent: { name: 'Asistan' },
            }),
        });
        mockCollectionGet.mockResolvedValue({ docs: [] });
        mockAdd.mockResolvedValue({ id: 'new-doc-id' });
    });

    // ── Tenants GET ──
    describe('/api/tenants GET', () => {
        it('should return tenant data when authenticated', async () => {
            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.companyName).toBe('Test Co');
        });

        it('should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should block cross-tenant access', async () => {
            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants?tenantId=other-tenant', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            // AUTH_ERROR maps to 401 in error-handler
            expect(response.status).toBe(401);
        });
    });

    // ── Tenants PUT ──
    describe('/api/tenants PUT', () => {
        it('should update with allowed fields', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'admin',
                },
                body: { companyName: 'New Name', language: 'en' },
            });
            const response = await PUT(request);
            expect(response.status).toBe(200);
        });
    });

    // ── Tenant Settings ──
    describe('/api/tenant/settings', () => {
        it('GET should return settings when authenticated', async () => {
            const { GET } = await import('@/app/api/tenant/settings/route');
            const request = createMockRequest('/api/tenant/settings', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.settings).toBeDefined();
            expect(data.tenantId).toBe('tenant-123');
        });

        it('GET should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenant/settings/route');
            const request = createMockRequest('/api/tenant/settings');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('PUT should update settings for admin', async () => {
            mockSet.mockResolvedValue(undefined);
            mockAdd.mockResolvedValue({ id: 'log-1' });

            const { PUT } = await import('@/app/api/tenant/settings/route');
            const request = createMockRequest('/api/tenant/settings', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'admin',
                },
                body: { companyName: 'Updated Co', language: 'en' },
            });
            const response = await PUT(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.updatedFields).toContain('companyName');
        });

        it('PUT should reject viewer role', async () => {
            const { PUT } = await import('@/app/api/tenant/settings/route');
            const request = createMockRequest('/api/tenant/settings', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'viewer',
                },
                body: { companyName: 'Hacked Co' },
            });
            const response = await PUT(request);
            // AUTH_ERROR maps to 401 in error-handler
            expect(response.status).toBe(401);
        });
    });

    // ── GDPR ──
    describe('/api/tenant/gdpr', () => {
        it('GET export should return tenant data', async () => {
            mockCollectionGet.mockResolvedValue({ docs: [] });

            const { GET } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr?action=export', {
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'admin',
                },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Disposition')).toContain('gdpr-export');
        });

        it('GET should return error for invalid action', async () => {
            const { GET } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr?action=invalid', {
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'admin',
                },
            });
            const response = await GET(request);
            expect(response.status).toBe(400);
        });

        it('GET should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr?action=export');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('POST delete-customer should succeed for valid customerId', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ name: 'Test Customer', phone: '555-0001' }),
            });
            mockCollectionGet.mockResolvedValue({ docs: [] });

            const { POST } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'admin',
                },
                body: { action: 'delete-customer', customerId: 'cust-1' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.action).toBe('delete-customer');
        });

        it('POST should return 400 for missing customerId', async () => {
            const { POST } = await import('@/app/api/tenant/gdpr/route');
            const request = createMockRequest('/api/tenant/gdpr', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer test-token',
                    'x-user-role': 'admin',
                },
                body: { action: 'delete-customer' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });

    // ── Compliance ──
    describe('/api/compliance', () => {
        it('GET should return audit logs', async () => {
            const { GET } = await import('@/app/api/compliance/route');
            const request = createMockRequest('/api/compliance', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.logs).toBeDefined();
            expect(data.count).toBeGreaterThanOrEqual(0);
        });

        it('GET should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/compliance/route');
            const request = createMockRequest('/api/compliance');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('POST redact should redact PII from text', async () => {
            const { POST } = await import('@/app/api/compliance/route');
            const request = createMockRequest('/api/compliance', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { operation: 'redact', text: 'Email: test@email.com' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.piiFound).toBe(true);
        });

        it('POST consent should record consent', async () => {
            const { POST } = await import('@/app/api/compliance/route');
            const request = createMockRequest('/api/compliance', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    operation: 'consent',
                    userId: 'user-1',
                    callerPhone: '555-0001',
                    callRecording: true,
                    dataProcessing: true,
                },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(201);
            expect(data.consentId).toBeDefined();
        });

        it('POST should return error for unknown operation', async () => {
            const { POST } = await import('@/app/api/compliance/route');
            const request = createMockRequest('/api/compliance', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { operation: 'unknown' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });
});
