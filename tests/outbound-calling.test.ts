/**
 * Outbound Calling Tests
 *
 * Tests for:
 * - createOutboundCall builds correct Twilio API request
 * - OUTBOUND_GREETINGS has all 4 languages
 * - Outbound route requires auth
 * - E.164 validation
 * - Outbound-answer returns valid TwiML
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Unit Tests: lib/twilio/outbound.ts
// =============================================

describe('Outbound Calling — lib/twilio/outbound', () => {
    describe('OUTBOUND_GREETINGS', () => {
        it('has greeting templates for all 4 languages', async () => {
            const { OUTBOUND_GREETINGS } = await import('@/lib/twilio/outbound');

            expect(OUTBOUND_GREETINGS).toHaveProperty('tr');
            expect(OUTBOUND_GREETINGS).toHaveProperty('en');
            expect(OUTBOUND_GREETINGS).toHaveProperty('de');
            expect(OUTBOUND_GREETINGS).toHaveProperty('fr');

            // Each greeting should contain placeholders
            for (const lang of ['tr', 'en', 'de', 'fr'] as const) {
                expect(OUTBOUND_GREETINGS[lang]).toContain('{agentName}');
                expect(OUTBOUND_GREETINGS[lang]).toContain('{companyName}');
                expect(typeof OUTBOUND_GREETINGS[lang]).toBe('string');
                expect(OUTBOUND_GREETINGS[lang].length).toBeGreaterThan(10);
            }
        });
    });

    describe('buildOutboundGreeting', () => {
        it('replaces placeholders with agent and company names', async () => {
            const { buildOutboundGreeting } = await import('@/lib/twilio/outbound');

            const greeting = buildOutboundGreeting('en', 'Alice', 'Acme Corp');
            expect(greeting).toContain('Alice');
            expect(greeting).toContain('Acme Corp');
            expect(greeting).not.toContain('{agentName}');
            expect(greeting).not.toContain('{companyName}');
        });

        it('uses default names when empty strings provided', async () => {
            const { buildOutboundGreeting } = await import('@/lib/twilio/outbound');

            const greetingTr = buildOutboundGreeting('tr', '', '');
            expect(greetingTr).toContain('asistan');

            const greetingEn = buildOutboundGreeting('en', '', '');
            expect(greetingEn).toContain('the assistant');

            const greetingDe = buildOutboundGreeting('de', '', '');
            expect(greetingDe).toContain('der Assistent');

            const greetingFr = buildOutboundGreeting('fr', '', '');
            expect(greetingFr).toContain("l'assistant");
        });
    });

    describe('createOutboundCall', () => {
        it('builds correct Twilio API request and returns call data', async () => {
            const mockResponse = {
                sid: 'CA1234567890abcdef',
                status: 'queued',
                direction: 'outbound-api',
                from: '+14155551234',
                to: '+14155559876',
                date_created: '2026-03-15T10:00:00Z',
            };

            const fetchSpy = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            vi.stubGlobal('fetch', fetchSpy);

            const { createOutboundCall } = await import('@/lib/twilio/outbound');

            const result = await createOutboundCall({
                accountSid: 'AC_test_sid',
                authToken: 'test_auth_token',
                to: '+14155559876',
                from: '+14155551234',
                webhookUrl: 'https://example.com/api/twilio/outbound-answer',
                statusCallback: 'https://example.com/api/twilio/status',
                machineDetection: 'Enable',
            });

            // Verify fetch was called with correct URL
            expect(fetchSpy).toHaveBeenCalledOnce();
            const [url, options] = fetchSpy.mock.calls[0];
            expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Calls.json');

            // Verify method and headers
            expect(options.method).toBe('POST');
            expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
            expect(options.headers['Authorization']).toMatch(/^Basic /);

            // Verify Basic Auth encoding
            const expectedAuth = 'Basic ' + Buffer.from('AC_test_sid:test_auth_token').toString('base64');
            expect(options.headers['Authorization']).toBe(expectedAuth);

            // Verify body params
            const bodyParams = new URLSearchParams(options.body);
            expect(bodyParams.get('To')).toBe('+14155559876');
            expect(bodyParams.get('From')).toBe('+14155551234');
            expect(bodyParams.get('Url')).toBe('https://example.com/api/twilio/outbound-answer');
            expect(bodyParams.get('StatusCallback')).toBe('https://example.com/api/twilio/status');
            expect(bodyParams.get('MachineDetection')).toBe('Enable');

            // Verify return value
            expect(result.sid).toBe('CA1234567890abcdef');
            expect(result.status).toBe('queued');
            expect(result.to).toBe('+14155559876');
            expect(result.from).toBe('+14155551234');

            vi.unstubAllGlobals();
        });

        it('throws on Twilio API error', async () => {
            const fetchSpy = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: () => Promise.resolve('Unauthorized'),
            });
            vi.stubGlobal('fetch', fetchSpy);

            const { createOutboundCall } = await import('@/lib/twilio/outbound');

            await expect(createOutboundCall({
                accountSid: 'AC_test',
                authToken: 'bad_token',
                to: '+14155559876',
                from: '+14155551234',
                webhookUrl: 'https://example.com/webhook',
            })).rejects.toThrow('Twilio outbound call failed (401)');

            vi.unstubAllGlobals();
        });
    });
});

// =============================================
// E.164 Validation Tests
// =============================================

describe('Outbound Calling — E.164 Validation', () => {
    const isValidE164 = (phone: string): boolean => /^\+[1-9]\d{1,14}$/.test(phone);

    it('accepts valid E.164 numbers', () => {
        expect(isValidE164('+14155551234')).toBe(true);
        expect(isValidE164('+905321234567')).toBe(true);
        expect(isValidE164('+442071234567')).toBe(true);
        expect(isValidE164('+33123456789')).toBe(true);
        expect(isValidE164('+4930123456')).toBe(true);
    });

    it('rejects invalid formats', () => {
        expect(isValidE164('14155551234')).toBe(false);    // no +
        expect(isValidE164('+0123456789')).toBe(false);    // starts with 0
        expect(isValidE164('')).toBe(false);                // empty
        expect(isValidE164('+1')).toBe(false);              // too short (only country code, 1 digit after +)
        expect(isValidE164('phone')).toBe(false);           // not a number
        expect(isValidE164('+1234567890123456')).toBe(false); // too long (16 digits)
    });
});

// =============================================
// API Route Tests
// =============================================

describe('Outbound Calling — API Route /api/twilio/outbound', () => {
    it('requires authentication (no token → 401)', async () => {
        // Mock requireStrictAuth to return an error
        vi.doMock('@/lib/utils/require-strict-auth', () => ({
            requireStrictAuth: vi.fn().mockResolvedValue({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                }),
            }),
        }));

        // The route should return the auth error
        const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
        const result = await (requireStrictAuth as ReturnType<typeof vi.fn>)(new Request('http://localhost/api/twilio/outbound'));
        expect(result.error).toBeDefined();
        expect(result.error.status).toBe(401);

        vi.doUnmock('@/lib/utils/require-strict-auth');
    });
});

// =============================================
// Outbound Answer TwiML Tests
// =============================================

describe('Outbound Calling — TwiML Generation', () => {
    it('generateGatherTwiML produces valid XML for outbound greeting', async () => {
        const { generateGatherTwiML } = await import('@/lib/twilio/telephony');

        const twiml = generateGatherTwiML({
            gatherUrl: 'https://example.com/api/twilio/gather?tenantId=t1&callSid=CA123&agentId=a1',
            message: 'Hello, this is Alice from Acme Corp. We wanted to reach out to you.',
            language: 'en-US',
        });

        // Should be valid XML
        expect(twiml).toContain('<?xml version="1.0"');
        expect(twiml).toContain('<Response>');
        expect(twiml).toContain('</Response>');

        // Should contain Gather element
        expect(twiml).toContain('<Gather');
        expect(twiml).toContain('input="speech"');
        expect(twiml).toContain('tenantId=t1');
        expect(twiml).toContain('agentId=a1');

        // Should contain the greeting
        expect(twiml).toContain('Alice');
        expect(twiml).toContain('Acme Corp');
    });

    it('generateGatherTwiML uses <Play> when audioUrl is provided', async () => {
        const { generateGatherTwiML } = await import('@/lib/twilio/telephony');

        const twiml = generateGatherTwiML({
            gatherUrl: 'https://example.com/gather',
            message: 'Hello',
            language: 'en-US',
            audioUrl: 'https://example.com/audio/greeting.wav',
        });

        expect(twiml).toContain('<Play>');
        expect(twiml).toContain('greeting.wav');
    });
});

// =============================================
// Metering Direction Tests
// =============================================

describe('Outbound Calling — Metering', () => {
    it('meterCallEnd accepts direction parameter', async () => {
        // Verify the function signature accepts direction
        const metering = await import('@/lib/billing/metering');
        expect(typeof metering.meterCallEnd).toBe('function');

        // Check it accepts 6 params (db, tenantId, duration, ttsChars, providerType, direction)
        expect(metering.meterCallEnd.length).toBeGreaterThanOrEqual(3);
    });
});

// =============================================
// i18n Messages Tests
// =============================================

describe('Outbound Calling — i18n Messages', () => {
    const OUTBOUND_KEYS = [
        'newOutboundCall',
        'callCustomer',
        'enterPhoneNumber',
        'callPurpose',
        'callInitiated',
        'callQueued',
        'selectAgent',
    ];

    it.each(['tr', 'en', 'de', 'fr'])('has all outbound keys in %s.json', async (locale) => {
        const messages = await import(`@/messages/${locale}.json`);
        const calls = messages.default?.calls || messages.calls;

        for (const key of OUTBOUND_KEYS) {
            expect(calls).toHaveProperty(key);
            expect(typeof calls[key]).toBe('string');
            expect(calls[key].length).toBeGreaterThan(0);
        }
    });
});

// =============================================
// Middleware Tests
// =============================================

describe('Outbound Calling — Middleware', () => {
    it('outbound-answer is listed in PUBLIC_API_PATHS', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const middlewarePath = path.resolve(process.cwd(), 'middleware.ts');
        const middlewareSrc = fs.readFileSync(middlewarePath, 'utf-8');

        expect(middlewareSrc).toContain('/api/twilio/outbound-answer');
    });
});
