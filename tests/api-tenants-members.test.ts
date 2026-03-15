/**
 * API Tenant Members Tests — Assign, List, Remove members
 *
 * Updated to match the requireStrictAuth-based route implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── requireStrictAuth mock ──
const mockRequireStrictAuth = vi.fn();
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Tenant admin mocks ──
const mockAssignUserToTenant = vi.fn();
const mockRemoveUserFromTenant = vi.fn();
const mockGetTenantMembers = vi.fn();

vi.mock('@/lib/tenant/admin', () => ({
    assignUserToTenant: (...args: unknown[]) => mockAssignUserToTenant(...args),
    removeUserFromTenant: (...args: unknown[]) => mockRemoveUserFromTenant(...args),
    getTenantMembers: (...args: unknown[]) => mockGetTenantMembers(...args),
}));

// ── Error handler mock ──
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: (error: unknown, context: string) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message, context }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    },
}));

/** Helper to create a successful auth result */
function authSuccess(overrides?: { uid?: string; tenantId?: string; role?: string; email?: string }) {
    return {
        uid: overrides?.uid ?? 'test-uid',
        email: overrides?.email ?? 'test@example.com',
        tenantId: overrides?.tenantId ?? 'tenant-123',
        role: overrides?.role ?? 'admin',
    };
}

/** Helper to create a 401 auth failure */
function authFailure() {
    return {
        error: NextResponse.json(
            { error: 'Unauthorized', code: 'AUTH_ERROR' },
            { status: 401 },
        ),
    };
}

describe('API Tenant Members Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAssignUserToTenant.mockResolvedValue(undefined);
        mockRemoveUserFromTenant.mockResolvedValue(undefined);
        mockGetTenantMembers.mockResolvedValue([
            { uid: 'user-1', role: 'admin', email: 'admin@test.com' },
            { uid: 'user-2', role: 'viewer', email: 'viewer@test.com' },
        ]);
    });

    // ── POST: Assign user to tenant ──
    describe('/api/tenants/members POST', () => {
        it('should assign user to tenant with default viewer role', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'tenant-123', role: 'admin' }));
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'new-user' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('new-user');
            expect(data.message).toContain('viewer');
            expect(mockAssignUserToTenant).toHaveBeenCalledWith('new-user', 'tenant-123', 'viewer');
        });

        it('should return 401 when authentication fails', async () => {
            mockRequireStrictAuth.mockResolvedValue(authFailure());
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                body: { uid: 'new-user' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(401);
            expect(data.error).toContain('Unauthorized');
        });

        it('should return 403 when caller role is not owner/admin', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ role: 'viewer' }));
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'new-user' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('owners and admins');
        });

        it('should return 400 when uid is missing in body', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'tenant-123', role: 'admin' }));
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {},
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('uid is required');
        });

        it('should ignore body.tenantId and use JWT-derived tenantId', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'jwt-tenant', role: 'admin' }));
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'new-user', tenantId: 'spoofed-tenant' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(mockAssignUserToTenant).toHaveBeenCalledWith('new-user', 'jwt-tenant', 'viewer');
        });

        it('should return 403 when non-owner tries to assign owner role', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ role: 'admin' }));
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'new-user', role: 'owner' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('Only owners can assign the owner role');
        });
    });

    // ── GET: List tenant members ──
    describe('/api/tenants/members GET', () => {
        it('should return members list with count', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'tenant-123' }));
            const { GET } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.tenantId).toBe('tenant-123');
            expect(data.members).toHaveLength(2);
            expect(data.count).toBe(2);
            expect(mockGetTenantMembers).toHaveBeenCalledWith('tenant-123');
        });

        it('should return 401 when not authenticated', async () => {
            mockRequireStrictAuth.mockResolvedValue(authFailure());
            const { GET } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members');
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(401);
            expect(data.error).toContain('Unauthorized');
        });
    });

    // ── DELETE: Remove user from tenant ──
    describe('/api/tenants/members DELETE', () => {
        it('should remove user from tenant', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'tenant-123', role: 'admin' }));
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'user-to-remove' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('removed');
        });

        it('should return 403 when caller is not owner/admin', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ role: 'viewer' }));
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'user-to-remove' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('owners and admins');
        });

        it('should return 400 when uid is missing', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ role: 'admin' }));
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {},
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('uid is required');
        });

        it('should call removeUserFromTenant with JWT-derived tenantId', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'tenant-xyz', role: 'owner' }));
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'user-abc', tenantId: 'spoofed-tenant' },
            });
            await DELETE(request);
            expect(mockRemoveUserFromTenant).toHaveBeenCalledWith('user-abc', 'tenant-xyz');
        });

        it('should return success message with user and tenant info', async () => {
            mockRequireStrictAuth.mockResolvedValue(authSuccess({ tenantId: 'tenant-789', role: 'admin' }));
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { uid: 'user-456' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('user-456');
            expect(data.message).toContain('tenant-789');
        });
    });
});
