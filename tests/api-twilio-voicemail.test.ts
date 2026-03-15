/**
 * API Twilio Voicemail Callback Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockAdd = vi.fn().mockResolvedValue({ id: 'vm-001' });
const mockSet = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockReturnValue({
                    add: mockAdd,
                    doc: vi.fn().mockReturnValue({ set: mockSet }),
                }),
                set: mockSet,
            }),
        }),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TS'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
}));

// ── Twilio validation mock ──
vi.mock('@/lib/twilio/telephony', () => ({
    validateTwilioSignature: vi.fn().mockReturnValue(true),
    getTwilioConfig: vi.fn().mockReturnValue({ authToken: null }),
}));

describe('API Twilio Voicemail Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('/api/twilio/voicemail POST', () => {
        it('should export a POST function', async () => {
            const mod = await import('@/app/api/twilio/voicemail/route');
            expect(mod.POST).toBeDefined();
            expect(typeof mod.POST).toBe('function');
        });

        it('should store voicemail metadata', async () => {
            const { POST } = await import('@/app/api/twilio/voicemail/route');
            const request = createMockRequest(
                '/api/twilio/voicemail?tenantId=tenant-123',
                {
                    method: 'POST',
                    body: {
                        CallSid: 'CA123abc',
                        RecordingUrl: 'https://api.twilio.com/recordings/RE-vm1',
                        RecordingSid: 'RE-vm1',
                        RecordingDuration: '15',
                        From: '+15551234567',
                    },
                },
            );

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);

            // Should add voicemail doc
            expect(mockAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: 'tenant-123',
                    callSid: 'CA123abc',
                    from: '+15551234567',
                    recordingUrl: 'https://api.twilio.com/recordings/RE-vm1',
                    recordingSid: 'RE-vm1',
                    durationSeconds: 15,
                    status: 'new',
                }),
            );
        });

        it('should handle recording URL from Twilio', async () => {
            const { POST } = await import('@/app/api/twilio/voicemail/route');
            const request = createMockRequest(
                '/api/twilio/voicemail?tenantId=tenant-123&callSid=CA-from-query',
                {
                    method: 'POST',
                    body: {
                        RecordingUrl: 'https://api.twilio.com/recordings/RE-vm2',
                        RecordingSid: 'RE-vm2',
                        RecordingDuration: '30',
                        Caller: '+15559999999',
                    },
                },
            );

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);

            // Should use Caller field when From is missing
            expect(mockAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: '+15559999999',
                    recordingUrl: 'https://api.twilio.com/recordings/RE-vm2',
                    durationSeconds: 30,
                }),
            );

            // Should update call record with voicemail info
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    hasVoicemail: true,
                    voicemailUrl: 'https://api.twilio.com/recordings/RE-vm2',
                    voicemailDuration: 30,
                }),
                { merge: true },
            );
        });

        it('should return 400 when tenantId is missing', async () => {
            const { POST } = await import('@/app/api/twilio/voicemail/route');
            const request = createMockRequest('/api/twilio/voicemail', {
                method: 'POST',
                body: {
                    CallSid: 'CA123',
                    RecordingUrl: 'https://example.com/rec',
                },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should update voicemail count on tenant doc', async () => {
            const { POST } = await import('@/app/api/twilio/voicemail/route');
            const request = createMockRequest(
                '/api/twilio/voicemail?tenantId=tenant-123',
                {
                    method: 'POST',
                    body: {
                        CallSid: 'CA123abc',
                        RecordingSid: 'RE-vm3',
                        RecordingDuration: '10',
                        From: '+15551111111',
                    },
                },
            );

            await POST(request);

            // Should update tenant doc with voicemail count
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    voicemailCount: 'INCREMENT_1',
                    lastVoicemailAt: 'MOCK_TS',
                }),
                { merge: true },
            );
        });
    });
});
