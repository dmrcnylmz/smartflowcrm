/**
 * API Route Tests — /api/phone/pool
 *
 * Tests GET (stats + list), POST (add), DELETE (remove) handlers.
 * Verifies admin-only role enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// =============================================
// Mock Setup
// =============================================

const mockGetPoolStats = vi.fn();
const mockListPoolNumbers = vi.fn();
const mockAddToPool = vi.fn();
const mockRemoveFromPool = vi.fn();

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({})),
}));

vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: vi.fn().mockResolvedValue({
        uid: 'admin-uid',
        email: 'admin@callception.com',
        tenantId: 'tenant-123',
    }),
}));

vi.mock('@/lib/phone/number-pool', () => ({
    getPoolStats: (...args: unknown[]) => mockGetPoolStats(...args),
    listPoolNumbers: (...args: unknown[]) => mockListPoolNumbers(...args),
    addToPool: (...args: unknown[]) => mockAddToPool(...args),
    removeFromPool: (...args: unknown[]) => mockRemoveFromPool(...args),
}));

vi.mock('@/lib/utils/error-handler', async () => {
    const actual = await vi.importActual('@/lib/utils/error-handler');
    return actual;
});

// =============================================
// Tests
// =============================================

describe('/api/phone/pool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── GET ───

    describe('GET', () => {
        it('should return pool stats and numbers for admin', async () => {
            mockGetPoolStats.mockResolvedValue({
                total: 10,
                available: 5,
                assigned: 4,
                reserved: 1,
                byCarrier: {
                    netgsm: { total: 6, available: 3 },
                    bulutfon: { total: 4, available: 2 },
                },
            });

            mockListPoolNumbers.mockResolvedValue([
                { id: 'p1', phoneNumber: '+905321111111', sipCarrier: 'netgsm', status: 'available' },
                { id: 'p2', phoneNumber: '+905322222222', sipCarrier: 'bulutfon', status: 'assigned' },
            ]);

            const { GET } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.stats.total).toBe(10);
            expect(data.stats.available).toBe(5);
            expect(data.numbers).toHaveLength(2);
            expect(data.count).toBe(2);
        });

        it('should pass query filters to listPoolNumbers', async () => {
            mockGetPoolStats.mockResolvedValue({ total: 0, available: 0, assigned: 0, reserved: 0, byCarrier: {} });
            mockListPoolNumbers.mockResolvedValue([]);

            const { GET } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool?status=available&carrier=netgsm', {
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
            });

            const response = await GET(request);
            expect(response.status).toBe(200);
            expect(mockListPoolNumbers).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ status: 'available', carrier: 'netgsm' }),
            );
        });

        it('should return 403 for non-admin role', async () => {
            const { GET } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                headers: {
                    'x-user-role': 'member',
                    'Authorization': 'Bearer test-token',
                },
            });

            const response = await GET(request);
            expect(response.status).toBe(403);
        });

        it('should return 403 when no role header', async () => {
            const { GET } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);
            expect(response.status).toBe(403);
        });
    });

    // ─── POST ───

    describe('POST', () => {
        it('should add numbers to pool', async () => {
            mockAddToPool.mockResolvedValue({ added: 3, skipped: 0 });

            const { POST } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'POST',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    numbers: [
                        { phone: '+905321111111', carrier: 'netgsm', rate: 1.00 },
                        { phone: '+905322222222', carrier: 'netgsm', rate: 1.00 },
                        { phone: '+905323333333', carrier: 'bulutfon', rate: 1.50 },
                    ],
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.added).toBe(3);
            expect(data.skipped).toBe(0);
        });

        it('should return skipped count for duplicates', async () => {
            mockAddToPool.mockResolvedValue({ added: 1, skipped: 2 });

            const { POST } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'POST',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    numbers: [
                        { phone: '+905321111111', carrier: 'netgsm', rate: 1.00 },
                        { phone: '+905322222222', carrier: 'netgsm', rate: 1.00 },
                        { phone: '+905323333333', carrier: 'netgsm', rate: 1.00 },
                    ],
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(data.added).toBe(1);
            expect(data.skipped).toBe(2);
        });

        it('should return 400 when numbers array is empty', async () => {
            const { POST } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'POST',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { numbers: [] },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when numbers field is missing', async () => {
            const { POST } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'POST',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {},
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when entry missing required fields', async () => {
            const { POST } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'POST',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    numbers: [{ phone: '+905321111111' }], // missing carrier and rate
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('carrier');
        });

        it('should return 403 for non-admin', async () => {
            const { POST } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'POST',
                headers: {
                    'x-user-role': 'member',
                    'Authorization': 'Bearer test-token',
                },
                body: { numbers: [{ phone: '+905321111111', carrier: 'netgsm', rate: 1 }] },
            });

            const response = await POST(request);
            expect(response.status).toBe(403);
        });
    });

    // ─── DELETE ───

    describe('DELETE', () => {
        it('should remove number from pool', async () => {
            mockRemoveFromPool.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { poolEntryId: 'pool-entry-1' },
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockRemoveFromPool).toHaveBeenCalledWith(expect.anything(), 'pool-entry-1');
        });

        it('should return 400 when poolEntryId is missing', async () => {
            const { DELETE } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {},
            });

            const response = await DELETE(request);
            expect(response.status).toBe(400);
        });

        it('should return 403 for non-admin', async () => {
            const { DELETE } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'member',
                    'Authorization': 'Bearer test-token',
                },
                body: { poolEntryId: 'pool-entry-1' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(403);
        });

        it('should allow owner role', async () => {
            mockRemoveFromPool.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/phone/pool/route');
            const request = createMockRequest('/api/phone/pool', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: { poolEntryId: 'pool-entry-1' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(200);
        });
    });
});
