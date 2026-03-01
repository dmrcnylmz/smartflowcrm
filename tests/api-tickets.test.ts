/**
 * API Route Tests — /api/tickets
 *
 * Tests GET (list), POST (create), PATCH (update) handlers.
 * Mocks lib/firebase/db functions used by the route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// Mock the firebase/db module used by the tickets route
const mockGetComplaints = vi.fn();
const mockGetInfoRequests = vi.fn();
const mockCreateComplaint = vi.fn();
const mockCreateInfoRequest = vi.fn();
const mockUpdateComplaint = vi.fn();
const mockUpdateInfoRequest = vi.fn();

vi.mock('@/lib/firebase/db', () => ({
    getComplaints: (...args: unknown[]) => mockGetComplaints(...args),
    getInfoRequests: (...args: unknown[]) => mockGetInfoRequests(...args),
    createComplaint: (...args: unknown[]) => mockCreateComplaint(...args),
    createInfoRequest: (...args: unknown[]) => mockCreateInfoRequest(...args),
    updateComplaint: (...args: unknown[]) => mockUpdateComplaint(...args),
    updateInfoRequest: (...args: unknown[]) => mockUpdateInfoRequest(...args),
}));

describe('/api/tickets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('should return complaint list by default', async () => {
            const mockComplaints = [
                { id: 't1', category: 'delivery', status: 'open' },
                { id: 't2', category: 'quality', status: 'investigating' },
            ];
            mockGetComplaints.mockResolvedValue(mockComplaints);

            const { GET } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets');

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
            const request = createMockRequest('/api/tickets?type=info');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(1);
            expect(mockGetInfoRequests).toHaveBeenCalledOnce();
        });
    });

    describe('POST', () => {
        it('should create complaint ticket with valid data', async () => {
            mockCreateComplaint.mockResolvedValue({ id: 'new-t1' });

            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                body: {
                    type: 'complaint',
                    customerId: 'c1',
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

        it('should return 400 when customerId is missing', async () => {
            const { POST } = await import('@/app/api/tickets/route');
            const request = createMockRequest('/api/tickets', {
                method: 'POST',
                body: { category: 'delivery', description: 'Some issue' },
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
                body: { id: 't1', type: 'complaint', status: 'resolved' },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockUpdateComplaint).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'resolved' }));
        });
    });
});
