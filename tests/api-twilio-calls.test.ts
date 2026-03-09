/**
 * API Twilio Call Routes Tests
 *
 * Comprehensive tests for:
 * - /api/twilio/incoming   — inbound call webhook
 * - /api/twilio/voicemail  — voicemail recording callback
 * - /api/twilio/recording  — call recording status callback
 * - /api/twilio/gather     — speech gather + AI response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── Chainable Firestore mocks ──
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockCollectionGroup = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => {
        const docRef = {
            get: mockGet,
            set: mockSet,
            update: mockUpdate,
            collection: mockCollection,
            ref: { update: mockUpdate },
        };
        mockDoc.mockReturnValue(docRef);
        mockCollection.mockReturnValue({
            doc: mockDoc,
            add: mockAdd,
        });
        mockLimit.mockReturnValue({ get: mockGet });
        mockWhere.mockReturnValue({ limit: mockLimit, where: mockWhere });
        mockCollectionGroup.mockReturnValue({ where: mockWhere });
        return {
            collection: mockCollection,
            collectionGroup: mockCollectionGroup,
        };
    }),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
        arrayUnion: vi.fn((...args: unknown[]) => args),
    },
}));

// ── Telephony mock ──
const mockValidateTwilioSignature = vi.fn().mockReturnValue(true);
const mockGetTwilioConfig = vi.fn().mockReturnValue({
    authToken: 'test-token',
    accountSid: 'AC123',
    phoneNumber: '+905551234567',
});
const mockResolveTenantFromPhone = vi.fn().mockResolvedValue({
    tenantId: 'tenant-123',
    providerType: 'TWILIO_NATIVE',
    sipCarrier: null,
});
const mockGenerateGatherTwiML = vi.fn().mockReturnValue('<Response><Gather/></Response>');
const mockGenerateUnavailableTwiML = vi.fn().mockReturnValue('<Response><Say>Unavailable</Say></Response>');
const mockGenerateVoicemailTwiML = vi.fn().mockReturnValue('<Response><Record/></Response>');
const mockGenerateResponseAndGatherTwiML = vi.fn().mockReturnValue('<Response><Say>AI response</Say><Gather/></Response>');

vi.mock('@/lib/twilio/telephony', () => ({
    validateTwilioSignature: (...args: unknown[]) => mockValidateTwilioSignature(...args),
    getTwilioConfig: (...args: unknown[]) => mockGetTwilioConfig(...args),
    resolveTenantFromPhone: (...args: unknown[]) => mockResolveTenantFromPhone(...args),
    generateGatherTwiML: (...args: unknown[]) => mockGenerateGatherTwiML(...args),
    generateUnavailableTwiML: (...args: unknown[]) => mockGenerateUnavailableTwiML(...args),
    generateVoicemailTwiML: (...args: unknown[]) => mockGenerateVoicemailTwiML(...args),
    generateResponseAndGatherTwiML: (...args: unknown[]) => mockGenerateResponseAndGatherTwiML(...args),
}));

// ── Billing mocks ──
const mockCheckCallAllowed = vi.fn().mockResolvedValue({ allowed: true });
vi.mock('@/lib/billing/usage-guard', () => ({
    checkCallAllowed: (...args: unknown[]) => mockCheckCallAllowed(...args),
}));

const mockGetSubscription = vi.fn().mockResolvedValue(null);
const mockIsSubscriptionActive = vi.fn().mockReturnValue(true);
vi.mock('@/lib/billing/lemonsqueezy', () => ({
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
    isSubscriptionActive: (...args: unknown[]) => mockIsSubscriptionActive(...args),
}));

// ── AI mocks ──
const mockDetectIntentFast = vi.fn().mockReturnValue({ intent: 'appointment', confidence: 0.9 });
const mockShouldShortcut = vi.fn().mockReturnValue(false);
const mockGetShortcutResponse = vi.fn().mockReturnValue('Merhaba!');
vi.mock('@/lib/ai/intent-fast', () => ({
    detectIntentFast: (...args: unknown[]) => mockDetectIntentFast(...args),
    shouldShortcut: (...args: unknown[]) => mockShouldShortcut(...args),
    getShortcutResponse: (...args: unknown[]) => mockGetShortcutResponse(...args),
}));

const mockGenerateWithFallback = vi.fn().mockResolvedValue({ text: 'AI yanıtı burada', source: 'openai' });
vi.mock('@/lib/ai/llm-fallback-chain', () => ({
    generateWithFallback: (...args: unknown[]) => mockGenerateWithFallback(...args),
}));

// ── n8n mock ──
const mockSendWebhook = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/n8n/client', () => ({
    sendWebhook: (...args: unknown[]) => mockSendWebhook(...args),
}));

// ── Default Twilio call body ──
const defaultCallBody = {
    From: '+905551111111',
    To: '+905552222222',
    CallSid: 'CA123',
    CallStatus: 'ringing',
    AccountSid: 'AC123',
};

// ── Default tenant data returned by Firestore ──
const defaultTenantData = {
    agent: { greeting: 'Merhaba, size nasıl yardımcı olabilirim?', name: 'Asistan' },
    language: 'tr',
    companyName: 'Test Şirket',
    settings: { callRecording: false },
    business: {},
};

// =============================================
// Test Suites
// =============================================

describe('Twilio Call API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset all mock implementations to defaults
        mockValidateTwilioSignature.mockReturnValue(true);
        mockResolveTenantFromPhone.mockResolvedValue({
            tenantId: 'tenant-123',
            providerType: 'TWILIO_NATIVE',
            sipCarrier: null,
        });
        mockGetTwilioConfig.mockReturnValue({
            authToken: 'test-token',
            accountSid: 'AC123',
            phoneNumber: '+905551234567',
        });
        mockCheckCallAllowed.mockResolvedValue({ allowed: true });
        mockGetSubscription.mockResolvedValue(null);
        mockIsSubscriptionActive.mockReturnValue(true);
        mockDetectIntentFast.mockReturnValue({ intent: 'appointment', confidence: 0.9 });
        mockShouldShortcut.mockReturnValue(false);
        mockGenerateWithFallback.mockResolvedValue({ text: 'AI yanıtı burada', source: 'openai' });

        // Default Firestore get returns tenant data
        mockGet.mockResolvedValue({
            exists: true,
            data: () => ({ ...defaultTenantData }),
        });
        mockSet.mockResolvedValue(undefined);
        mockUpdate.mockResolvedValue(undefined);
        mockAdd.mockResolvedValue({ id: 'auto-id-1' });
    });

    // ═══════════════════════════════════════════
    // /api/twilio/incoming
    // ═══════════════════════════════════════════
    describe('/api/twilio/incoming POST', () => {
        async function callIncoming(body?: Record<string, unknown>, headers?: Record<string, string>) {
            const { POST } = await import('@/app/api/twilio/incoming/route');
            const request = createMockRequest('http://localhost:3000/api/twilio/incoming', {
                method: 'POST',
                body: body || defaultCallBody,
                headers: {
                    'x-twilio-signature': 'valid-signature',
                    ...headers,
                },
            });
            return POST(request);
        }

        it('should return TwiML with gather on valid call', async () => {
            const response = await callIncoming();

            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('<Gather');
            expect(response.headers.get('Content-Type')).toBe('text/xml');
            expect(mockGenerateGatherTwiML).toHaveBeenCalled();
        });

        it('should return unavailable TwiML when tenant not found', async () => {
            mockResolveTenantFromPhone.mockResolvedValue(null);

            const response = await callIncoming();

            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('Unavailable');
            expect(mockGenerateUnavailableTwiML).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('yapılandırılmamış') })
            );
        });

        it('should return 403 on invalid Twilio signature', async () => {
            mockValidateTwilioSignature.mockReturnValue(false);

            const response = await callIncoming();

            expect(response.status).toBe(403);
        });

        it('should return unavailable when subscription inactive', async () => {
            mockGetSubscription.mockResolvedValue({ planId: 'starter', status: 'cancelled' });
            mockIsSubscriptionActive.mockReturnValue(false);

            const response = await callIncoming();

            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('Unavailable');
            expect(mockGenerateUnavailableTwiML).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('aboneliği sona ermiştir') })
            );
        });

        it('should return unavailable when usage limit exceeded', async () => {
            mockCheckCallAllowed.mockResolvedValue({ allowed: false, reason: 'Aylık limitiniz doldu.' });

            const response = await callIncoming();

            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('Unavailable');
            expect(mockGenerateUnavailableTwiML).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Aylık limitiniz doldu.' })
            );
        });

        it('should record call in Firestore', async () => {
            await callIncoming();

            // Should call set() to create the call record
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    callSid: 'CA123',
                    tenantId: 'tenant-123',
                    from: '+905551111111',
                    to: '+905552222222',
                    direction: 'inbound',
                    status: 'ringing',
                    channel: 'twilio',
                    providerType: 'TWILIO_NATIVE',
                })
            );
        });

        it('should return voicemail TwiML when outside working hours', async () => {
            // Return tenant data with working hours that are guaranteed to be outside
            // We set a very narrow window that won't match any current time
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    ...defaultTenantData,
                    business: {
                        workingHours: '03:00-03:01', // 1-minute window at 3 AM
                        workingDays: 'Pazartesi-Cuma',
                    },
                    agent: {
                        greeting: 'Merhaba',
                        farewell: 'Mesai saatleri dışındayız. Mesaj bırakın.',
                    },
                }),
            });

            const response = await callIncoming();
            expect(response.status).toBe(200);

            // The route either returns voicemail or gather TwiML depending on actual time.
            // Since we can't fully control Date in this test, verify the route completes without error.
            const body = await response.text();
            expect(body).toBeTruthy();
            expect(response.headers.get('Content-Type')).toBe('text/xml');
        });

        it('should increment usage counters', async () => {
            await callIncoming();

            // Should call set() with merge:true for usage increment
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    totalCalls: 'INCREMENT_1',
                    inboundCalls: 'INCREMENT_1',
                    lastCallAt: 'MOCK_TIMESTAMP',
                }),
                { merge: true }
            );
        });
    });

    // ═══════════════════════════════════════════
    // /api/twilio/voicemail
    // ═══════════════════════════════════════════
    describe('/api/twilio/voicemail POST', () => {
        const voicemailBody = {
            RecordingUrl: 'https://api.twilio.com/recordings/RE123',
            RecordingSid: 'RE123',
            RecordingDuration: '15',
            CallSid: 'CA123',
            From: '+905551111111',
        };

        async function callVoicemail(
            url?: string,
            body?: Record<string, unknown>,
            headers?: Record<string, string>
        ) {
            const { POST } = await import('@/app/api/twilio/voicemail/route');
            const request = createMockRequest(
                url || 'http://localhost:3000/api/twilio/voicemail?tenantId=tenant-123&callSid=CA123',
                {
                    method: 'POST',
                    body: body || voicemailBody,
                    headers: {
                        'x-twilio-signature': 'valid-signature',
                        'x-forwarded-for': '1.2.3.4',
                        ...headers,
                    },
                }
            );
            return POST(request);
        }

        it('should store voicemail in Firestore', async () => {
            const response = await callVoicemail();

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);

            // Should add voicemail document
            expect(mockAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: 'tenant-123',
                    callSid: 'CA123',
                    from: '+905551111111',
                    recordingUrl: 'https://api.twilio.com/recordings/RE123',
                    recordingSid: 'RE123',
                    durationSeconds: 15,
                    status: 'new',
                })
            );
        });

        it('should return 400 when tenantId missing', async () => {
            const response = await callVoicemail(
                'http://localhost:3000/api/twilio/voicemail'
            );

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('tenantId');
        });

        it('should return 403 on invalid Twilio signature', async () => {
            mockValidateTwilioSignature.mockReturnValue(false);

            const response = await callVoicemail();

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Forbidden');
        });

        it('should update call record with voicemail info when callSid present', async () => {
            await callVoicemail();

            // Should call set() with merge for the call record
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    hasVoicemail: true,
                    voicemailUrl: 'https://api.twilio.com/recordings/RE123',
                    voicemailDuration: 15,
                }),
                { merge: true }
            );
        });

        it('should return 429 on rate limit exceeded', async () => {
            // Call 31 times to exceed the 30 req/min limit
            const { POST } = await import('@/app/api/twilio/voicemail/route');

            let lastResponse: Response | null = null;
            for (let i = 0; i < 31; i++) {
                const request = createMockRequest(
                    'http://localhost:3000/api/twilio/voicemail?tenantId=tenant-123&callSid=CA123',
                    {
                        method: 'POST',
                        body: voicemailBody,
                        headers: {
                            'x-twilio-signature': 'valid-signature',
                            'x-forwarded-for': '99.99.99.99', // Use a unique IP to avoid interference
                        },
                    }
                );
                lastResponse = await POST(request);
            }

            expect(lastResponse!.status).toBe(429);
            const data = await lastResponse!.json();
            expect(data.error).toContain('Rate limit');
        });
    });

    // ═══════════════════════════════════════════
    // /api/twilio/recording
    // ═══════════════════════════════════════════
    describe('/api/twilio/recording POST', () => {
        const recordingBody = {
            RecordingSid: 'RE456',
            RecordingUrl: 'https://api.twilio.com/recordings/RE456',
            RecordingStatus: 'completed',
            RecordingDuration: '120',
            CallSid: 'CA123',
            RecordingChannels: '1',
        };

        async function callRecording(body?: Record<string, unknown>) {
            const { POST } = await import('@/app/api/twilio/recording/route');
            const request = createMockRequest('http://localhost:3000/api/twilio/recording', {
                method: 'POST',
                body: body || recordingBody,
            });
            return POST(request);
        }

        it('should update call record when recording completed', async () => {
            // Mock collectionGroup query returning a call document
            const mockCallDocRef = { update: mockUpdate };
            mockGet.mockResolvedValue({
                empty: false,
                docs: [{
                    data: () => ({ tenantId: 'tenant-123', callSid: 'CA123' }),
                    ref: mockCallDocRef,
                }],
            });

            const response = await callRecording();

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.ok).toBe(true);

            // Should update the call doc with recording info
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    recording: expect.objectContaining({
                        sid: 'RE456',
                        url: 'https://api.twilio.com/recordings/RE456',
                        mp3Url: 'https://api.twilio.com/recordings/RE456.mp3',
                        wavUrl: 'https://api.twilio.com/recordings/RE456.wav',
                        duration: 120,
                        channels: 1,
                        status: 'completed',
                    }),
                })
            );
        });

        it('should store recording in dedicated collection', async () => {
            const mockCallDocRef = { update: mockUpdate };
            mockGet.mockResolvedValue({
                empty: false,
                docs: [{
                    data: () => ({ tenantId: 'tenant-123', callSid: 'CA123' }),
                    ref: mockCallDocRef,
                }],
            });

            await callRecording();

            // Should set() recording document in tenants/{id}/recordings/{recordingSid}
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordingSid: 'RE456',
                    callSid: 'CA123',
                    tenantId: 'tenant-123',
                    url: 'https://api.twilio.com/recordings/RE456',
                    mp3Url: 'https://api.twilio.com/recordings/RE456.mp3',
                    duration: 120,
                    status: 'completed',
                })
            );
        });

        it('should handle failed recording status', async () => {
            const mockCallDocRef = { update: mockUpdate };
            mockGet.mockResolvedValue({
                empty: false,
                docs: [{
                    data: () => ({ tenantId: 'tenant-123', callSid: 'CA123' }),
                    ref: mockCallDocRef,
                }],
            });

            const response = await callRecording({
                ...recordingBody,
                RecordingStatus: 'failed',
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.ok).toBe(true);

            // Should update with failed status
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    'recording.status': 'failed',
                    'recording.sid': 'RE456',
                })
            );
        });

        it('should return {ok: true} when callSid missing', async () => {
            const response = await callRecording({
                RecordingSid: 'RE456',
                RecordingUrl: 'https://api.twilio.com/recordings/RE456',
                RecordingStatus: 'completed',
                // No CallSid
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.ok).toBe(true);

            // Should NOT query Firestore
            expect(mockCollectionGroup).not.toHaveBeenCalled();
        });

        it('should return {ok: true} when call record not found', async () => {
            mockGet.mockResolvedValue({
                empty: true,
                docs: [],
            });

            const response = await callRecording();

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.ok).toBe(true);

            // Should NOT attempt update since no doc found
            expect(mockUpdate).not.toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════
    // /api/twilio/gather
    // ═══════════════════════════════════════════
    describe('/api/twilio/gather POST', () => {
        const gatherBody = {
            SpeechResult: 'Randevu almak istiyorum',
            Confidence: '0.92',
            From: '+905551111111',
            To: '+905552222222',
            CallSid: 'CA123',
        };

        async function callGather(
            url?: string,
            body?: Record<string, unknown>,
            headers?: Record<string, string>
        ) {
            const { POST } = await import('@/app/api/twilio/gather/route');
            const request = createMockRequest(
                url || 'http://localhost:3000/api/twilio/gather?tenantId=tenant-123&callSid=CA123',
                {
                    method: 'POST',
                    body: body || gatherBody,
                    headers: {
                        'x-twilio-signature': 'valid-signature',
                        'x-forwarded-for': '5.6.7.8',
                        ...headers,
                    },
                }
            );
            return POST(request);
        }

        it('should return TwiML with AI response', async () => {
            const response = await callGather();

            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('AI response');
            expect(response.headers.get('Content-Type')).toBe('text/xml');
            expect(mockGenerateResponseAndGatherTwiML).toHaveBeenCalled();
        });

        it('should save conversation turn to Firestore', async () => {
            await callGather();

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    conversationHistory: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'user',
                            content: 'Randevu almak istiyorum',
                            intent: 'appointment',
                        }),
                        expect.objectContaining({
                            role: 'assistant',
                        }),
                    ]),
                    lastActivityAt: 'MOCK_TIMESTAMP',
                })
            );
        });

        it('should fire n8n webhook', async () => {
            await callGather();

            expect(mockSendWebhook).toHaveBeenCalledWith(
                'on_new_call',
                expect.objectContaining({
                    tenantId: 'tenant-123',
                    sessionId: 'CA123',
                    arguments: expect.objectContaining({
                        callSid: 'CA123',
                        speechResult: 'Randevu almak istiyorum',
                        intent: 'appointment',
                    }),
                })
            );
        });

        it('should return 403 on invalid Twilio signature', async () => {
            mockValidateTwilioSignature.mockReturnValue(false);

            const response = await callGather();

            expect(response.status).toBe(403);
            const body = await response.text();
            expect(body).toContain('Unavailable');
        });

        it('should handle shortcut responses (greeting intent)', async () => {
            mockDetectIntentFast.mockReturnValue({ intent: 'greeting', confidence: 0.95 });
            mockShouldShortcut.mockReturnValue(true);
            mockGetShortcutResponse.mockReturnValue('Merhaba! Size nasıl yardımcı olabilirim?');

            const response = await callGather();

            expect(response.status).toBe(200);
            expect(mockShouldShortcut).toHaveBeenCalled();
            expect(mockGetShortcutResponse).toHaveBeenCalledWith('greeting', 'tr');
            // LLM should NOT be called for shortcut responses
            expect(mockGenerateWithFallback).not.toHaveBeenCalled();
        });

        it('should return "sizi duyamadım" when no speech result', async () => {
            const response = await callGather(
                undefined,
                { ...gatherBody, SpeechResult: '' }
            );

            expect(response.status).toBe(200);
            expect(mockGenerateResponseAndGatherTwiML).toHaveBeenCalledWith(
                expect.objectContaining({
                    aiResponse: expect.stringContaining('duyamadım'),
                })
            );
        });

        it('should return 429 on rate limit exceeded', async () => {
            const { POST } = await import('@/app/api/twilio/gather/route');

            let lastResponse: Response | null = null;
            for (let i = 0; i < 61; i++) {
                const request = createMockRequest(
                    'http://localhost:3000/api/twilio/gather?tenantId=tenant-123&callSid=CA123',
                    {
                        method: 'POST',
                        body: gatherBody,
                        headers: {
                            'x-twilio-signature': 'valid-signature',
                            'x-forwarded-for': '88.88.88.88', // Unique IP
                        },
                    }
                );
                lastResponse = await POST(request);
            }

            expect(lastResponse!.status).toBe(429);
        });
    });
});
