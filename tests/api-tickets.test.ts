/**
 * API Route Tests — /api/tickets
 *
 * Tests GET (list), POST (create), PATCH (update) handlers.
 * Mocks lib/firebase/admin-db functions used by the route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// Mock the firebase/admin-db module used by the tickets route
const mockGetComplaints = vi.fn();
const mockGetInfoRequests = vi.fn();
const mockCreateComplaint = vi.fn();
const mockCreateInfoRequest = vi.fn();
const mockUpdateComplaint = vi.fn();
const mockUpdateInfoRequest = vi.fn();
const mockGetTenantFromRequest = vi.fn();

vi.mock('@/lib/firebase/admin-db', () => ({
    getComplaints: (...args: unknown[]) => mockGetComplaints(...args),
    getInfoRequests: (...args: unknown[]) => mockGetInfoRequests(...args),
    createComplaint: (...args: unknown[]) => mockCreateComplaint(...args),
    createInfoRequest: (...args: unknown[]) => mockCreateInfoRequest(...args),
    updateComplaint: (...args: unknown[]) => mockUpdateComplaint(...args),
    updateInfoRequest: (...args: unknown[]) => mockUpdateInfoRequest(...args),
    getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}));

// Mock requireStrictAuth — simulate authenticated user
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: vi.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@example.com',
        tenantId: 'tenant-123',
    }),
}));

// Mock n8n/client webhook
vi.mock('@/lib/n8n/client', () => ({
    sendWebhook: vi.fn().mockResolvedValue(undefined),
}));

describe('/api/tickets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: return tenant from request header
        mockGetTenantFromRequest.mockImplementation((req: Request) => {
            return req.headers.get('x-user-tenant') || null;
        });
    });

    describe('GET', () => {
        it('should return complaint list by default', async () => {
            const mockComplaints = [
                { id: 't1', category: 'delivery', status: 'open' },
                { id: 't2', category: 'quality', status: 'investigating' },
            ];
            mockGetComplaints.mockResolvedValue(mockComplaints);

            const { GET } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(2);
            expect(mockGetComplaints).toHaveBeenCalledOnce();
        });

        it('should return info requests when type=info', async () => {
            const mockInfoReqs = [{ id: 'i1', topic: 'pricing', status: 'pending' }];
            mockGetInfoRequests.mockResolvedValue(mockInfoReqs);

            const { GET } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets?type=info', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(1);
            expect(mockGetInfoRequests).toHaveBeenCalledOnce();
        });

        it('should return 401 when auth is missing', async () => {
            // Simulate auth failure (no Bearer token)
            const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
            vi.mocked(requireStrictAuth).mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            } as never);

            const { GET } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should pass status filter to getComplaints', async () => {
            mockGetComplaints.mockResolvedValue([]);

            const { GET } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets?status=resolved', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            expect(response.status).toBe(200);
            expect(mockGetComplaints).toHaveBeenCalledWith('tenant-123', expect.objectContaining({ status: 'resolved' }));
        });

        it('should pass customerId filter to getComplaints', async () => {
            mockGetComplaints.mockResolvedValue([]);

            const { GET } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets?customerId=c1', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            expect(response.status).toBe(200);
            expect(mockGetComplaints).toHaveBeenCalledWith('tenant-123', expect.objectContaining({ customerId: 'c1' }));
        });
    });

    describe('POST', () => {
        it('should create complaint ticket with valid data', async () => {
            mockCreateComplaint.mockResolvedValue({ id: 'new-t1' });

            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    type: 'complaint',
                    customerId: 'c1',
                    title: 'Package issue',
                    category: 'delivery',
                    description: 'Package arrived damaged',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.type).toBe('complaint');
            expect(mockCreateComplaint).toHaveBeenCalledOnce();
        });

        it('should return 400 when customerId and customerName are missing', async () => {
            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { title: 'Some issue', category: 'delivery', description: 'Some issue' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should create info request when type is info', async () => {
            mockCreateInfoRequest.mockResolvedValue({ id: 'new-i1' });

            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    type: 'info',
                    customerId: 'c1',
                    title: 'Pricing inquiry',
                    description: 'Need pricing details',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.type).toBe('info');
            expect(mockCreateInfoRequest).toHaveBeenCalledOnce();
        });

        it('should create ticket with customerName (inline customer)', async () => {
            mockCreateComplaint.mockResolvedValue({ id: 'new-t2' });

            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    customerName: 'Walk-in Customer',
                    customerEmail: 'walkin@test.com',
                    title: 'Walk-in complaint',
                    category: 'service',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.type).toBe('complaint');
        });

        it('should return 400 when title is missing', async () => {
            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    customerId: 'c1',
                    category: 'delivery',
                    description: 'Some issue without title',
                },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });

    describe('PATCH', () => {
        it('should update complaint ticket status', async () => {
            mockUpdateComplaint.mockResolvedValue(undefined);

            const { PATCH } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { id: 't1', type: 'complaint', status: 'resolved' },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockUpdateComplaint).toHaveBeenCalledWith('tenant-123', 't1', expect.objectContaining({ status: 'resolved' }));
        });

        it('should update info request ticket', async () => {
            mockUpdateInfoRequest.mockResolvedValue(undefined);

            const { PATCH } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { id: 'i1', type: 'info', status: 'resolved' },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockUpdateInfoRequest).toHaveBeenCalledWith('tenant-123', 'i1', expect.objectContaining({ status: 'resolved' }));
        });

        it('should return 400 when id is missing from PATCH', async () => {
            const { PATCH } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { type: 'complaint', status: 'resolved' },
            });

            const response = await PATCH(request);
            expect(response.status).toBe(400);
        });
    });
});
