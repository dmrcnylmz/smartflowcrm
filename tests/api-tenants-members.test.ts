/**
 * API Tenant Members Tests — Assign, List, Remove members
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

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
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'x-user-role': 'admin', 'x-user-tenant': 'tenant-123' },
                body: { uid: 'new-user', tenantId: 'tenant-123' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('new-user');
            expect(data.message).toContain('viewer');
            expect(mockAssignUserToTenant).toHaveBeenCalledWith('new-user', 'tenant-123', 'viewer');
        });

        it('should return 403 when caller role is not owner/admin', async () => {
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                body: { uid: 'new-user', tenantId: 'tenant-123' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('owners and admins');
        });

        it('should return 400 when uid is missing in body', async () => {
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'x-user-role': 'admin', 'x-user-tenant': 'tenant-123' },
                body: { tenantId: 'tenant-123' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('uid and tenantId are required');
        });

        it('should return 400 when tenantId is missing in body', async () => {
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'x-user-role': 'admin', 'x-user-tenant': 'tenant-123' },
                body: { uid: 'new-user' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('uid and tenantId are required');
        });

        it('should return 403 when non-owner tries to assign owner role', async () => {
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'x-user-role': 'admin', 'x-user-tenant': 'tenant-123' },
                body: { uid: 'new-user', tenantId: 'tenant-123', role: 'owner' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('Only owners can assign the owner role');
        });

        it('should return 403 when managing another tenant\'s members', async () => {
            const { POST } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'POST',
                headers: { 'x-user-role': 'admin', 'x-user-tenant': 'tenant-999' },
                body: { uid: 'new-user', tenantId: 'tenant-123' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('Cannot manage members of another tenant');
        });
    });

    // ── GET: List tenant members ──
    describe('/api/tenants/members GET', () => {
        it('should return members list with count', async () => {
            const { GET } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.tenantId).toBe('tenant-123');
            expect(data.members).toHaveLength(2);
            expect(data.count).toBe(2);
            expect(response.headers.get('Cache-Control')).toContain('private');
            expect(mockGetTenantMembers).toHaveBeenCalledWith('tenant-123');
        });

        it('should return 400 when no x-user-tenant header', async () => {
            const { GET } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members');
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('tenantId is required');
        });
    });

    // ── DELETE: Remove user from tenant ──
    describe('/api/tenants/members DELETE', () => {
        it('should remove user from tenant', async () => {
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'x-user-role': 'admin' },
                body: { uid: 'user-to-remove', tenantId: 'tenant-123' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('removed');
        });

        it('should return 403 when caller is not owner/admin', async () => {
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'x-user-role': 'viewer' },
                body: { uid: 'user-to-remove', tenantId: 'tenant-123' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(403);
            expect(data.error).toContain('owners and admins');
        });

        it('should return 400 when uid is missing', async () => {
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'x-user-role': 'admin' },
                body: { tenantId: 'tenant-123' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('uid and tenantId are required');
        });

        it('should return 400 when tenantId is missing', async () => {
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'x-user-role': 'admin' },
                body: { uid: 'user-to-remove' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('uid and tenantId are required');
        });

        it('should call removeUserFromTenant with correct params', async () => {
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'x-user-role': 'owner' },
                body: { uid: 'user-abc', tenantId: 'tenant-xyz' },
            });
            await DELETE(request);
            expect(mockRemoveUserFromTenant).toHaveBeenCalledWith('user-abc', 'tenant-xyz');
        });

        it('should return success message with user and tenant info', async () => {
            const { DELETE } = await import('@/app/api/tenants/members/route');
            const request = createMockRequest('/api/tenants/members', {
                method: 'DELETE',
                headers: { 'x-user-role': 'admin' },
                body: { uid: 'user-456', tenantId: 'tenant-789' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('user-456');
            expect(data.message).toContain('tenant-789');
        });
    });
});
