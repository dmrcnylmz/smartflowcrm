/**
 * API Route Tests — /api/customers
 *
 * Tests GET (list) and POST (create) handlers.
 * Mocks lib/firebase/db functions used by the route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// Mock the firebase/db module used by the customers route
const mockGetAllCustomers = vi.fn();
const mockCreateCustomer = vi.fn();

vi.mock('@/lib/firebase/db', () => ({
    getAllCustomers: (...args: unknown[]) => mockGetAllCustomers(...args),
    createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
}));

describe('/api/customers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('should return customer list', async () => {
            const mockCustomers = [
                { id: 'c1', name: 'Ali Yilmaz', phone: '555-0001' },
                { id: 'c2', name: 'Ayse Demir', phone: '555-0002' },
            ];
            mockGetAllCustomers.mockResolvedValue(mockCustomers);

            const { GET } = await import('@/app/api/customers/route');
            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(2);
            expect(data[0].name).toBe('Ali Yilmaz');
            expect(mockGetAllCustomers).toHaveBeenCalledOnce();
        });
    });

    describe('POST', () => {
        it('should create customer with valid body', async () => {
            mockCreateCustomer.mockResolvedValue({ id: 'new-c1' });

            const { POST } = await import('@/app/api/customers/route');
            const request = createMockRequest('/api/customers', {
                method: 'POST',
                body: { name: 'Mehmet Kaya', phone: '555-0003', email: 'mk@test.com' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(mockCreateCustomer).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Mehmet Kaya', phone: '555-0003' })
            );
        });

        it('should return 400 when required fields are missing', async () => {
            const { POST } = await import('@/app/api/customers/route');
            const request = createMockRequest('/api/customers', {
                method: 'POST',
                body: { email: 'noname@test.com' }, // missing name and phone
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });
});
