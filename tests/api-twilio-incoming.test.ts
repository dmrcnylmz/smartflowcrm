/**
 * Twilio Incoming Call Route Tests
 *
 * Tests for POST /api/twilio/incoming
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTwilioWebhookRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ─────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                set: vi.fn().mockResolvedValue(undefined),
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        set: vi.fn().mockResolvedValue(undefined),
                        get: vi.fn().mockResolvedValue({ exists: false }),
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
    resolveTenantFromPhone: vi.fn().mockResolvedValue({
        tenantId: 'tenant-123',
        providerType: 'TWILIO_NATIVE',
    }),
    generateGatherTwiML: vi.fn().mockReturnValue('<Response><Gather/></Response>'),
    generateUnavailableTwiML: vi.fn().mockReturnValue('<Response><Say>Unavailable</Say></Response>'),
    generateVoicemailTwiML: vi.fn().mockReturnValue('<Response><Record/></Response>'),
}));

// ── Billing mocks ───────────────────────────────────────────────────────────
vi.mock('@/lib/billing/usage-guard', () => ({
    checkCallAllowed: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock('@/lib/billing/lemonsqueezy', () => ({
    getSubscription: vi.fn().mockResolvedValue(null),
    isSubscriptionActive: vi.fn().mockReturnValue(true),
}));

// ── Voice mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/voice/gpu-manager', () => ({
    gpuManager: { isPodConfigured: vi.fn().mockReturnValue(false), ensureReady: vi.fn() },
}));
vi.mock('@/lib/voice/tts-cartesia', () => ({
    isCartesiaConfigured: vi.fn().mockReturnValue(false),
    synthesizeCartesiaTTS: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/voice/phone-audio-cache', () => ({
    cachePhoneAudio: vi.fn(),
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
    }),
}));

describe('Twilio Incoming — POST /api/twilio/incoming', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Restore defaults
        mockValidateTwilioSignature.mockReturnValue(true);
        mockGetTwilioConfig.mockReturnValue({
            accountSid: 'test-sid',
            authToken: 'test-auth-token',
        });
    });

    it('handler exports POST function', async () => {
        const mod = await import('@/app/api/twilio/incoming/route');
        expect(mod.POST).toBeDefined();
        expect(typeof mod.POST).toBe('function');
    });

    it('rejects requests without valid Twilio signature when auth token is configured', async () => {
        mockValidateTwilioSignature.mockReturnValue(false);

        const { POST } = await import('@/app/api/twilio/incoming/route');
        const req = createTwilioWebhookRequest('/api/twilio/incoming', {
            CallSid: 'CA123',
            From: '+15551234567',
            To: '+15559876543',
        });

        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('returns TwiML response for valid incoming call', async () => {
        const { POST } = await import('@/app/api/twilio/incoming/route');
        const req = createTwilioWebhookRequest('/api/twilio/incoming', {
            CallSid: 'CA123',
            From: '+15551234567',
            To: '+15559876543',
            CallStatus: 'ringing',
        });

        const res = await POST(req);
        // Should return XML (TwiML)
        expect(res.headers.get('Content-Type')).toBe('text/xml');
    });
});
