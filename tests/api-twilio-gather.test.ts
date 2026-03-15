/**
 * Twilio Gather Route Tests
 *
 * Tests for POST /api/twilio/gather
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTwilioWebhookRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ─────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({
                        conversationHistory: [],
                        consecutiveSilence: 0,
                    }),
                }),
                set: vi.fn().mockResolvedValue(undefined),
                update: vi.fn().mockResolvedValue(undefined),
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                conversationHistory: [],
                                consecutiveSilence: 0,
                            }),
                        }),
                        update: vi.fn().mockResolvedValue(undefined),
                    }),
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                        }),
                    }),
                }),
            }),
        }),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
        arrayUnion: vi.fn((...args: unknown[]) => args),
    },
}));

// ── Twilio telephony mock ───────────────────────────────────────────────────
const mockValidateTwilioSignature = vi.fn().mockReturnValue(true);
const mockGetTwilioConfig = vi.fn().mockReturnValue({
    accountSid: 'test-sid',
    authToken: 'test-auth-token',
});

vi.mock('@/lib/twilio/telephony', () => ({
    validateTwilioSignature: (...args: unknown[]) => mockValidateTwilioSignature(...args),
    getTwilioConfig: () => mockGetTwilioConfig(),
    generateResponseAndGatherTwiML: vi.fn().mockReturnValue('<Response><Gather/></Response>'),
    generateUnavailableTwiML: vi.fn().mockReturnValue('<Response><Say>Unavailable</Say></Response>'),
}));

// ── AI mocks ────────────────────────────────────────────────────────────────
vi.mock('@/lib/ai/intent-fast', () => ({
    detectIntentFast: vi.fn().mockReturnValue({
        intent: 'general',
        confidence: 0.8,
        detectedKeywords: [],
        language: 'tr',
    }),
    shouldShortcut: vi.fn().mockReturnValue(false),
    getShortcutResponse: vi.fn().mockReturnValue(''),
}));
vi.mock('@/lib/ai/llm-fallback-chain', () => ({
    generateWithFallback: vi.fn().mockResolvedValue({ text: 'AI response', provider: 'mock' }),
}));
vi.mock('@/lib/ai/response-cache', () => ({
    getResponseCache: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(null),
        set: vi.fn(),
    }),
    buildCacheKey: vi.fn().mockReturnValue('cache-key'),
}));

// ── TTS mocks ───────────────────────────────────────────────────────────────
vi.mock('@/lib/voice/tts-cartesia', () => ({
    isCartesiaConfigured: vi.fn().mockReturnValue(false),
    synthesizeCartesiaTTS: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/voice/phone-audio-cache', () => ({
    cachePhoneAudio: vi.fn(),
}));
vi.mock('@/lib/voice/streaming-tts-pipeline', () => ({
    streamLLMWithChunkedTTS: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/twilio/text-optimizer', () => ({
    optimizeForPhoneTTS: vi.fn().mockImplementation((text: string) => text),
}));

// ── Webhook mock ────────────────────────────────────────────────────────────
vi.mock('@/lib/n8n/client', () => ({
    sendWebhook: vi.fn().mockResolvedValue(undefined),
}));

// ── i18n mock ───────────────────────────────────────────────────────────────
vi.mock('@/lib/i18n/config', () => ({
    localeBCP47: { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fr: 'fr-FR' },
}));

// ── Logger mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/utils/logger', () => ({
    createLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        }),
    }),
}));

describe('Twilio Gather — POST /api/twilio/gather', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        mockValidateTwilioSignature.mockReturnValue(true);
        mockGetTwilioConfig.mockReturnValue({
            accountSid: 'test-sid',
            authToken: 'test-auth-token',
        });
    });

    it('handler exports POST function', async () => {
        const mod = await import('@/app/api/twilio/gather/route');
        expect(mod.POST).toBeDefined();
        expect(typeof mod.POST).toBe('function');
    });

    it('rejects requests without valid Twilio signature', async () => {
        mockValidateTwilioSignature.mockReturnValue(false);

        const { POST } = await import('@/app/api/twilio/gather/route');
        const req = createTwilioWebhookRequest(
            '/api/twilio/gather?tenantId=tenant-123&callSid=CA123',
            { SpeechResult: 'hello', Confidence: '0.9' },
        );

        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('handles empty SpeechResult gracefully', async () => {
        const { POST } = await import('@/app/api/twilio/gather/route');
        const req = createTwilioWebhookRequest(
            '/api/twilio/gather?tenantId=tenant-123&callSid=CA123',
            { SpeechResult: '', Confidence: '0' },
        );

        const res = await POST(req);
        // Should return TwiML (silence handling — asks user to repeat)
        expect(res.headers.get('Content-Type')).toBe('text/xml');
        // Should NOT be an error status
        expect(res.status).toBeLessThan(400);
    });
});
