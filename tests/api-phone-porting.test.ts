/**
 * API Route Tests — /api/phone/porting
 *
 * Tests GET (list), POST (create), PATCH (update/complete) handlers.
 * Verifies role-based access and input validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// =============================================
// Mock Setup
// =============================================

const mockCreatePortingRequest = vi.fn();
const mockUpdatePortingStatus = vi.fn();
const mockCompletePorting = vi.fn();
const mockListPortingRequests = vi.fn();

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

vi.mock('@/lib/phone/porting', () => ({
    createPortingRequest: (...args: unknown[]) => mockCreatePortingRequest(...args),
    updatePortingStatus: (...args: unknown[]) => mockUpdatePortingStatus(...args),
    completePorting: (...args: unknown[]) => mockCompletePorting(...args),
    listPortingRequests: (...args: unknown[]) => mockListPortingRequests(...args),
}));

vi.mock('@/lib/utils/error-handler', async () => {
    const actual = await vi.importActual('@/lib/utils/error-handler');
    return actual;
});

// =============================================
// Tests
// =============================================

describe('/api/phone/porting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── GET ───

    describe('GET', () => {
        it('should list porting requests for regular user (filtered by tenant)', async () => {
            mockListPortingRequests.mockResolvedValue([
                {
                    id: 'pr1',
                    tenantId: 'tenant-123',
                    phoneNumber: '+905321234567',
                    status: 'pending',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'netgsm',
                },
            ]);

            const { GET } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                headers: {
                    'x-user-role': 'member',
                    'Authorization': 'Bearer test-token',
                },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.requests).toHaveLength(1);
            expect(data.count).toBe(1);

            // Non-admin: should filter by tenantId
            expect(mockListPortingRequests).toHaveBeenCalledWith(
                expect.anything(),
                'tenant-123',  // tenantFilter = tenant-123 (not undefined)
                undefined,
            );
        });

        it('should list ALL porting requests for admin (no tenant filter)', async () => {
            mockListPortingRequests.mockResolvedValue([]);

            const { GET } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
            });

            await GET(request);

            // Admin: tenantFilter should be undefined (see all)
            expect(mockListPortingRequests).toHaveBeenCalledWith(
                expect.anything(),
                undefined,  // admin sees all
                undefined,
            );
        });

        it('should pass status filter from query params', async () => {
            mockListPortingRequests.mockResolvedValue([]);

            const { GET } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting?status=pending', {
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
            });

            await GET(request);

            expect(mockListPortingRequests).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                'pending',
            );
        });
    });

    // ─── POST ───

    describe('POST', () => {
        it('should create a porting request', async () => {
            mockCreatePortingRequest.mockResolvedValue({
                id: 'pr-new',
                tenantId: 'tenant-123',
                phoneNumber: '+905321234567',
                status: 'pending',
                currentCarrier: 'Turkcell',
                targetCarrier: 'netgsm',
            });

            const { POST } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    phoneNumber: '+905321234567',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'netgsm',
                    notes: 'Lütfen hızlı taşıyın',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.request.id).toBe('pr-new');
        });

        it('should return 400 for missing required fields', async () => {
            const { POST } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { phoneNumber: '+905321234567' }, // missing currentCarrier, targetCarrier
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 for invalid targetCarrier', async () => {
            const { POST } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    phoneNumber: '+905321234567',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'invalidCarrier',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Geçersiz hedef operatör');
        });

        it('should accept all valid carrier values', async () => {
            const validCarriers = ['netgsm', 'bulutfon', 'other'];

            for (const carrier of validCarriers) {
                mockCreatePortingRequest.mockResolvedValue({
                    id: `pr-${carrier}`,
                    targetCarrier: carrier,
                    status: 'pending',
                });

                const { POST } = await import('@/app/api/phone/porting/route');
                const request = createMockRequest('/api/phone/porting', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer test-token' },
                    body: {
                        phoneNumber: '+905321234567',
                        currentCarrier: 'Turkcell',
                        targetCarrier: carrier,
                    },
                });

                const response = await POST(request);
                expect(response.status).toBe(201);
            }
        });
    });

    // ─── PATCH ───

    describe('PATCH', () => {
        it('should update porting status (admin)', async () => {
            mockUpdatePortingStatus.mockResolvedValue(undefined);

            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    requestId: 'pr-1',
                    status: 'submitted',
                    adminNotes: 'Operatöre iletildi',
                },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.message).toContain('submitted');
        });

        it('should complete porting with action=complete', async () => {
            mockCompletePorting.mockResolvedValue({
                phoneNumber: '+905321234567',
                tenantId: 'tenant-123',
                providerType: 'SIP_TRUNK',
                sipCarrier: 'netgsm',
            });

            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    requestId: 'pr-1',
                    action: 'complete',
                },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.phoneNumber.providerType).toBe('SIP_TRUNK');
        });

        it('should return 403 for non-admin', async () => {
            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'member',
                    'Authorization': 'Bearer test-token',
                },
                body: { requestId: 'pr-1', status: 'submitted' },
            });

            const response = await PATCH(request);
            expect(response.status).toBe(403);
        });

        it('should return 400 when requestId is missing', async () => {
            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { status: 'submitted' },
            });

            const response = await PATCH(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when neither status nor action provided', async () => {
            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { requestId: 'pr-1' }, // no status, no action
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('status');
        });

        it('should return 400 for invalid status value', async () => {
            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { requestId: 'pr-1', status: 'invalid_status' },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Geçersiz durum');
        });

        it('should allow owner role for PATCH', async () => {
            mockUpdatePortingStatus.mockResolvedValue(undefined);

            const { PATCH } = await import('@/app/api/phone/porting/route');
            const request = createMockRequest('/api/phone/porting', {
                method: 'PATCH',
                headers: {
                    'x-user-role': 'owner',
                    'Authorization': 'Bearer test-token',
                },
                body: { requestId: 'pr-1', status: 'in_progress' },
            });

            const response = await PATCH(request);
            expect(response.status).toBe(200);
        });
    });
});
