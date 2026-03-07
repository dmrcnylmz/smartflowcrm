/**
 * API Route Tests — POST /api/phone/provision
 *
 * Tests:
 *   - Auth enforcement (requireStrictAuth)
 *   - Subscription guard
 *   - Country code validation
 *   - TR → SIP_TRUNK routing
 *   - Global → TWILIO_NATIVE routing
 *   - Error responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// =============================================
// Mock Setup
// =============================================

const mockProvisionNumber = vi.fn();

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

vi.mock('@/lib/billing/subscription-guard', () => ({
    checkSubscriptionActive: vi.fn().mockResolvedValue({ active: true }),
}));

vi.mock('@/lib/phone/gateway', () => ({
    provisionNumber: (...args: unknown[]) => mockProvisionNumber(...args),
}));

vi.mock('@/lib/utils/error-handler', async () => {
    const actual = await vi.importActual('@/lib/utils/error-handler');
    return actual;
});

// =============================================
// Tests
// =============================================

describe('POST /api/phone/provision', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should provision a TR number via pool', async () => {
        mockProvisionNumber.mockResolvedValue({
            success: true,
            phoneNumber: {
                phoneNumber: '+905321234567',
                tenantId: 'tenant-123',
                providerType: 'SIP_TRUNK',
                sipCarrier: 'netgsm',
                country: 'TR',
            },
        });

        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: { country: 'TR' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.phoneNumber.providerType).toBe('SIP_TRUNK');
    });

    it('should provision a US number via Twilio', async () => {
        mockProvisionNumber.mockResolvedValue({
            success: true,
            phoneNumber: {
                phoneNumber: '+12025551234',
                tenantId: 'tenant-123',
                providerType: 'TWILIO_NATIVE',
                country: 'US',
            },
        });

        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: { country: 'US', areaCode: '212' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.phoneNumber.providerType).toBe('TWILIO_NATIVE');
    });

    it('should return 400 for missing country field', async () => {
        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: {},
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
    });

    it('should return 400 for invalid country code (too long)', async () => {
        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: { country: 'TUR' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('ülke kodu');
    });

    it('should return 400 for invalid country code (number)', async () => {
        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: { country: 90 },
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
    });

    it('should return 422 when provisioning fails', async () => {
        mockProvisionNumber.mockResolvedValue({
            success: false,
            error: 'Havuzda müsait numara yok',
        });

        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: { country: 'TR' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(422);
        expect(data.error).toContain('müsait numara yok');
    });

    it('should return 403 when subscription is inactive', async () => {
        const { checkSubscriptionActive } = await import('@/lib/billing/subscription-guard');
        (checkSubscriptionActive as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            active: false,
            reason: 'Plan expired',
        });

        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: { country: 'US' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Abonelik');
    });

    it('should return auth error when not authenticated', async () => {
        const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
        const { NextResponse } = await import('next/server');
        (requireStrictAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        });

        const { POST } = await import('@/app/api/phone/provision/route');
        const request = createMockRequest('/api/phone/provision', {
            method: 'POST',
            body: { country: 'TR' },
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
    });
});
