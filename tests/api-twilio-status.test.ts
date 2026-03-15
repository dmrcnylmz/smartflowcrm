/**
 * API Twilio Status Callback Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockCallDocRef = { update: mockUpdate };
const mockCallDoc = {
    ref: mockCallDocRef,
    data: () => ({ tenantId: 'tenant-123', from: '+15551234567', providerType: 'twilio' }),
};
const mockCollectionGroupGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collectionGroup: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    get: mockCollectionGroupGet,
                }),
            }),
        }),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TS'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
}));

// ── Billing metering mock ──
const mockMeterCallEnd = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/billing/metering', () => ({
    meterCallEnd: (...args: unknown[]) => mockMeterCallEnd(...args),
}));

// ── n8n webhook mock ──
const mockSendWebhook = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/n8n/client', () => ({
    sendWebhook: (...args: unknown[]) => mockSendWebhook(...args),
}));

describe('API Twilio Status Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCollectionGroupGet.mockResolvedValue({
            empty: false,
            docs: [mockCallDoc],
        });
    });

    describe('/api/twilio/status POST', () => {
        it('should export a POST function', async () => {
            const mod = await import('@/app/api/twilio/status/route');
            expect(mod.POST).toBeDefined();
            expect(typeof mod.POST).toBe('function');
        });

        it('should handle call status updates', async () => {
            const { POST } = await import('@/app/api/twilio/status/route');
            const request = createMockRequest('/api/twilio/status', {
                method: 'POST',
                body: {
                    CallSid: 'CA123abc',
                    CallStatus: 'in-progress',
                    To: '+15559876543',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'in-progress',
                    updatedAt: 'MOCK_TS',
                }),
            );
        });

        it('should meter completed calls with duration', async () => {
            const { POST } = await import('@/app/api/twilio/status/route');
            const request = createMockRequest('/api/twilio/status', {
                method: 'POST',
                body: {
                    CallSid: 'CA123abc',
                    CallStatus: 'completed',
                    CallDuration: '120',
                    To: '+15559876543',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
            expect(mockMeterCallEnd).toHaveBeenCalledWith(
                expect.anything(), // db
                'tenant-123',     // tenantId
                120,              // durationSecs
                0,                // cost
                'twilio',         // providerType
            );
        });

        it('should update Firestore call records', async () => {
            const { POST } = await import('@/app/api/twilio/status/route');
            const request = createMockRequest('/api/twilio/status', {
                method: 'POST',
                body: {
                    CallSid: 'CA123abc',
                    CallStatus: 'completed',
                    CallDuration: '60',
                },
            });

            await POST(request);

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed',
                    durationSeconds: 60,
                    endedAt: 'MOCK_TS',
                    updatedAt: 'MOCK_TS',
                }),
            );
        });

        it('should return 400 if CallSid is missing', async () => {
            const { POST } = await import('@/app/api/twilio/status/route');
            const request = createMockRequest('/api/twilio/status', {
                method: 'POST',
                body: { CallStatus: 'completed' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return ok:true if call record not found', async () => {
            mockCollectionGroupGet.mockResolvedValueOnce({ empty: true, docs: [] });

            const { POST } = await import('@/app/api/twilio/status/route');
            const request = createMockRequest('/api/twilio/status', {
                method: 'POST',
                body: { CallSid: 'CA-not-found', CallStatus: 'completed' },
            });

            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
        });

        it('should fire on_missed_call webhook for no-answer status', async () => {
            const { POST } = await import('@/app/api/twilio/status/route');
            const request = createMockRequest('/api/twilio/status', {
                method: 'POST',
                body: {
                    CallSid: 'CA123abc',
                    CallStatus: 'no-answer',
                    To: '+15559876543',
                },
            });

            await POST(request);

            expect(mockSendWebhook).toHaveBeenCalledWith(
                'on_missed_call',
                expect.objectContaining({
                    tenantId: 'tenant-123',
                    sessionId: 'CA123abc',
                }),
            );
        });
    });
});
