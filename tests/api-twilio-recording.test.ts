/**
 * API Twilio Recording Callback Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockCallDocRef = { update: mockUpdate };
const mockCallDoc = {
    ref: mockCallDocRef,
    data: () => ({ tenantId: 'tenant-123', callSid: 'CA123abc' }),
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
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        set: mockSet,
                    }),
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

describe('API Twilio Recording Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCollectionGroupGet.mockResolvedValue({
            empty: false,
            docs: [mockCallDoc],
        });
    });

    describe('/api/twilio/recording POST', () => {
        it('should export a POST function', async () => {
            const mod = await import('@/app/api/twilio/recording/route');
            expect(mod.POST).toBeDefined();
            expect(typeof mod.POST).toBe('function');
        });

        it('should store recording URLs when status is completed', async () => {
            const { POST } = await import('@/app/api/twilio/recording/route');
            const request = createMockRequest('/api/twilio/recording', {
                method: 'POST',
                body: {
                    RecordingSid: 'RE123abc',
                    RecordingUrl: 'https://api.twilio.com/recordings/RE123abc',
                    RecordingStatus: 'completed',
                    RecordingDuration: '45',
                    CallSid: 'CA123abc',
                    RecordingChannels: '2',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);

            // Should update the call record with recording info
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    recording: expect.objectContaining({
                        sid: 'RE123abc',
                        url: 'https://api.twilio.com/recordings/RE123abc',
                        mp3Url: 'https://api.twilio.com/recordings/RE123abc.mp3',
                        wavUrl: 'https://api.twilio.com/recordings/RE123abc.wav',
                        duration: 45,
                        channels: 2,
                        status: 'completed',
                    }),
                }),
            );
        });

        it('should create recording Firestore entries', async () => {
            const { POST } = await import('@/app/api/twilio/recording/route');
            const request = createMockRequest('/api/twilio/recording', {
                method: 'POST',
                body: {
                    RecordingSid: 'RE123abc',
                    RecordingUrl: 'https://api.twilio.com/recordings/RE123abc',
                    RecordingStatus: 'completed',
                    RecordingDuration: '30',
                    CallSid: 'CA123abc',
                    RecordingChannels: '1',
                },
            });

            await POST(request);

            // Should store in recordings collection and update usage stats
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordingSid: 'RE123abc',
                    callSid: 'CA123abc',
                    tenantId: 'tenant-123',
                    url: 'https://api.twilio.com/recordings/RE123abc',
                    status: 'completed',
                }),
            );
        });

        it('should return ok:true when CallSid or RecordingSid missing', async () => {
            const { POST } = await import('@/app/api/twilio/recording/route');
            const request = createMockRequest('/api/twilio/recording', {
                method: 'POST',
                body: { RecordingStatus: 'completed' },
            });

            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
        });

        it('should handle failed recording status', async () => {
            const { POST } = await import('@/app/api/twilio/recording/route');
            const request = createMockRequest('/api/twilio/recording', {
                method: 'POST',
                body: {
                    RecordingSid: 'RE-failed',
                    RecordingUrl: '',
                    RecordingStatus: 'failed',
                    CallSid: 'CA123abc',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    'recording.status': 'failed',
                    'recording.sid': 'RE-failed',
                }),
            );
        });
    });
});
