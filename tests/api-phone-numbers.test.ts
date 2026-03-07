/**
 * API Route Tests — /api/phone/numbers
 *
 * Tests GET (list) and DELETE (release) handlers.
 * Verifies auth and admin-only role for deletion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// =============================================
// Mock Setup
// =============================================

const mockListTenantNumbers = vi.fn();
const mockReleaseNumber = vi.fn();

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({})),
}));

vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: vi.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@callception.com',
        tenantId: 'tenant-123',
    }),
}));

vi.mock('@/lib/phone/gateway', () => ({
    listTenantNumbers: (...args: unknown[]) => mockListTenantNumbers(...args),
    releaseNumber: (...args: unknown[]) => mockReleaseNumber(...args),
}));

vi.mock('@/lib/utils/error-handler', async () => {
    const actual = await vi.importActual('@/lib/utils/error-handler');
    return actual;
});

// =============================================
// Tests
// =============================================

describe('/api/phone/numbers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── GET ───

    describe('GET', () => {
        it('should list tenant phone numbers', async () => {
            mockListTenantNumbers.mockResolvedValue([
                {
                    phoneNumber: '+905321234567',
                    tenantId: 'tenant-123',
                    providerType: 'SIP_TRUNK',
                    sipCarrier: 'netgsm',
                    country: 'TR',
                    isActive: true,
                },
                {
                    phoneNumber: '+12025551234',
                    tenantId: 'tenant-123',
                    providerType: 'TWILIO_NATIVE',
                    country: 'US',
                    isActive: true,
                },
            ]);

            const { GET } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.numbers).toHaveLength(2);
            expect(data.count).toBe(2);
            expect(data.numbers[0].providerType).toBe('SIP_TRUNK');
            expect(data.numbers[1].providerType).toBe('TWILIO_NATIVE');
        });

        it('should return empty list when tenant has no numbers', async () => {
            mockListTenantNumbers.mockResolvedValue([]);

            const { GET } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.numbers).toHaveLength(0);
            expect(data.count).toBe(0);
        });

        it('should call listTenantNumbers with correct tenantId', async () => {
            mockListTenantNumbers.mockResolvedValue([]);

            const { GET } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            await GET(request);

            expect(mockListTenantNumbers).toHaveBeenCalledWith(
                expect.anything(),
                'tenant-123',
            );
        });

        it('should return 401 when not authenticated', async () => {
            const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
            const { NextResponse } = await import('next/server');
            (requireStrictAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
            });

            const { GET } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });

    // ─── DELETE ───

    describe('DELETE', () => {
        it('should release a phone number (admin)', async () => {
            mockReleaseNumber.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { phoneNumber: '+905321234567' },
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.message).toContain('+905321234567');
        });

        it('should allow owner role for deletion', async () => {
            mockReleaseNumber.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: { phoneNumber: '+905321234567' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(200);
        });

        it('should return 403 for non-admin role', async () => {
            const { DELETE } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'member',
                    'Authorization': 'Bearer test-token',
                },
                body: { phoneNumber: '+905321234567' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(403);
        });

        it('should return 403 when no role header', async () => {
            const { DELETE } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { phoneNumber: '+905321234567' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(403);
        });

        it('should return 400 when phoneNumber is missing', async () => {
            const { DELETE } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
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

        it('should call releaseNumber with correct params', async () => {
            mockReleaseNumber.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/phone/numbers/route');
            const request = createMockRequest('/api/phone/numbers', {
                method: 'DELETE',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { phoneNumber: '+12025551234' },
            });

            await DELETE(request);

            expect(mockReleaseNumber).toHaveBeenCalledWith(
                expect.anything(),
                'tenant-123',
                '+12025551234',
            );
        });
    });
});
