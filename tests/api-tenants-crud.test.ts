/**
 * API Tenants CRUD Tests — POST, GET, PUT handlers for /api/tenants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── Tenant admin mocks ──
const mockCreateTenant = vi.fn();
const mockGetTenant = vi.fn();
const mockUpdateTenant = vi.fn();
const mockAssignUserToTenant = vi.fn();
const mockListTenants = vi.fn();

vi.mock('@/lib/tenant/admin', () => ({
    createTenant: (...args: unknown[]) => mockCreateTenant(...args),
    getTenant: (...args: unknown[]) => mockGetTenant(...args),
    updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
    assignUserToTenant: (...args: unknown[]) => mockAssignUserToTenant(...args),
    listTenants: (...args: unknown[]) => mockListTenants(...args),
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

describe('API Tenants CRUD', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset requireStrictAuth to default success
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });

        // Reset tenant admin mocks to defaults
        mockCreateTenant.mockResolvedValue('new-tenant-id');
        mockGetTenant.mockResolvedValue({ id: 'tenant-123', companyName: 'Test Co' });
        mockUpdateTenant.mockResolvedValue(undefined);
        mockAssignUserToTenant.mockResolvedValue(undefined);
        mockListTenants.mockResolvedValue([]);
    });

    // ═══════════════════════════════════════════
    // POST /api/tenants
    // ═══════════════════════════════════════════
    describe('POST /api/tenants', () => {
        it('should create tenant with companyName', async () => {
            const { POST } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'POST',
                headers: { 'x-user-uid': 'test-uid' },
                body: { companyName: 'Acme Corp' },
            });

            await POST(request);

            expect(mockCreateTenant).toHaveBeenCalledTimes(1);
            const tenantData = mockCreateTenant.mock.calls[0][0];
            expect(tenantData.companyName).toBe('Acme Corp');
            expect(tenantData.agent).toBeDefined();
            expect(tenantData.business).toBeDefined();
            expect(tenantData.voice).toBeDefined();
            expect(tenantData.guardrails).toBeDefined();
            expect(tenantData.quotas).toBeDefined();
        });

        it('should return 201 with tenantId and message', async () => {
            const { POST } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'POST',
                headers: { 'x-user-uid': 'test-uid' },
                body: { companyName: 'Acme Corp' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.tenantId).toBe('new-tenant-id');
            expect(data.message).toContain('Acme Corp');
            expect(data.note).toBeDefined();
        });

        it('should assign creator as owner', async () => {
            const { POST } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'POST',
                headers: { 'x-user-uid': 'test-uid' },
                body: { companyName: 'Acme Corp' },
            });

            await POST(request);

            expect(mockAssignUserToTenant).toHaveBeenCalledWith(
                'test-uid',
                'new-tenant-id',
                'owner',
            );
        });

        it('should return 400 when companyName is missing', async () => {
            const { POST } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'POST',
                headers: { 'x-user-uid': 'test-uid' },
                body: {},
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            expect(mockCreateTenant).not.toHaveBeenCalled();
        });

        it('should return 401 when x-user-uid header is missing', async () => {
            const { POST } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'POST',
                body: { companyName: 'Acme Corp' },
            });

            const response = await POST(request);

            expect(response.status).toBe(401);
            expect(mockCreateTenant).not.toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════
    // GET /api/tenants
    // ═══════════════════════════════════════════
    describe('GET /api/tenants', () => {
        it('should return own tenant data', async () => {
            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants?tenantId=tenant-123', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.id).toBe('tenant-123');
            expect(data.companyName).toBe('Test Co');
            expect(mockGetTenant).toHaveBeenCalledWith('tenant-123');
        });

        it('should return 404 when tenant not found', async () => {
            mockGetTenant.mockResolvedValueOnce(null);

            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants?tenantId=tenant-123', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);

            expect(response.status).toBe(404);
        });

        it('should block access to other tenant data', async () => {
            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants?tenantId=other-tenant', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);

            expect(response.status).toBe(401);
            expect(mockGetTenant).not.toHaveBeenCalled();
        });

        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants');

            const response = await GET(request);

            expect(response.status).toBe(401);
        });
    });

    // ═══════════════════════════════════════════
    // PUT /api/tenants
    // ═══════════════════════════════════════════
    describe('PUT /api/tenants', () => {
        it('should update tenant with allowed fields', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: { companyName: 'Updated Corp', sector: 'Tech' },
            });

            const response = await PUT(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.message).toContain('updated');
            expect(mockUpdateTenant).toHaveBeenCalledWith('tenant-123', {
                companyName: 'Updated Corp',
                sector: 'Tech',
            });
        });

        it('should filter disallowed fields', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    companyName: 'Valid Name',
                    forbiddenField: 'should be removed',
                    quotas: { dailyMinutes: 9999 },
                    active: false,
                },
            });

            const response = await PUT(request);

            expect(response.status).toBe(200);
            const updateArgs = mockUpdateTenant.mock.calls[0][1];
            expect(updateArgs.companyName).toBe('Valid Name');
            expect(updateArgs.forbiddenField).toBeUndefined();
            expect(updateArgs.quotas).toBeUndefined();
            expect(updateArgs.active).toBeUndefined();
        });

        it('should return 400 when no valid update fields provided', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: { invalidField: 'value', anotherBadField: 123 },
            });

            const response = await PUT(request);

            expect(response.status).toBe(400);
            expect(mockUpdateTenant).not.toHaveBeenCalled();
        });

        it('should return 401 when user role is not owner/admin', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'x-user-role': 'viewer',
                    'Authorization': 'Bearer test-token',
                },
                body: { companyName: 'Hacked Name' },
            });

            const response = await PUT(request);

            expect(response.status).toBe(401);
            expect(mockUpdateTenant).not.toHaveBeenCalled();
        });

        it('should block cross-tenant updates', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: { tenantId: 'other-tenant', companyName: 'Hijacked' },
            });

            const response = await PUT(request);

            expect(response.status).toBe(401);
            expect(mockUpdateTenant).not.toHaveBeenCalled();
        });

        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                body: { companyName: 'No Auth' },
            });

            const response = await PUT(request);

            expect(response.status).toBe(401);
            expect(mockUpdateTenant).not.toHaveBeenCalled();
        });

        it('should allow admin role to update tenant', async () => {
            const { PUT } = await import('@/app/api/tenants/route');
            const request = createMockRequest('/api/tenants', {
                method: 'PUT',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { companyName: 'Admin Updated' },
            });

            const response = await PUT(request);

            expect(response.status).toBe(200);
            expect(mockUpdateTenant).toHaveBeenCalledWith('tenant-123', {
                companyName: 'Admin Updated',
            });
        });
    });
});
