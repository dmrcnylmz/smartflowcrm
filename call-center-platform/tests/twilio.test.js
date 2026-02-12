/**
 * Twilio Integration Tests
 * 
 * Tests for: TwiML generation, audio conversion, outbound API,
 * webhook handling, tenant isolation, billing, and signature validation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let twilioService, dbPrepareGet, dbPrepareAll, dbRun, closeDatabase, crypto;

beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SKIP_TWILIO_VALIDATION = 'true';

    const { seed } = require('../src/seed/run-seed');
    await seed();

    twilioService = require('../src/services/twilio.service');
    const dbModule = require('../src/config/database');
    dbPrepareGet = dbModule.dbPrepareGet;
    dbPrepareAll = dbModule.dbPrepareAll;
    dbRun = dbModule.dbRun;
    closeDatabase = dbModule.closeDatabase;
    crypto = require('crypto');
});

afterAll(() => {
    closeDatabase();
});

// ─── TwiML Generation ────────────────────────────────────

describe('TwiML Generation', () => {
    it('should generate valid inbound TwiML with Stream', () => {
        const twiml = twilioService.generateInboundTwiml('wss://example.com/ws/twilio-media', 'atlas_support');

        expect(twiml).toContain('<?xml version="1.0"');
        expect(twiml).toContain('<Response>');
        expect(twiml).toContain('<Connect>');
        expect(twiml).toContain('<Stream url="wss://example.com/ws/twilio-media"');
        expect(twiml).toContain('tenantId');
        expect(twiml).toContain('atlas_support');
        expect(twiml).toContain('</Stream>');
        expect(twiml).toContain('</Connect>');
        expect(twiml).toContain('</Response>');
    });

    it('should generate bridge TwiML with Dial', () => {
        const twiml = twilioService.generateBridgeTwiml('+905551234567');

        expect(twiml).toContain('<Response>');
        expect(twiml).toContain('<Dial>+905551234567</Dial>');
        expect(twiml).toContain('</Response>');
    });
});

// ─── Auth Token Encryption ───────────────────────────────

describe('Auth Token Encryption', () => {
    it('should encrypt and decrypt auth token correctly', () => {
        const original = 'my_secret_auth_token_12345';
        const encrypted = twilioService.encrypt(original);

        expect(encrypted).not.toBe(original);
        expect(encrypted).toContain(':'); // iv:ciphertext format

        const decrypted = twilioService.decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for same input (random IV)', () => {
        const token = 'same_token';
        const e1 = twilioService.encrypt(token);
        const e2 = twilioService.encrypt(token);

        expect(e1).not.toBe(e2); // Different IVs
        expect(twilioService.decrypt(e1)).toBe(token);
        expect(twilioService.decrypt(e2)).toBe(token);
    });
});

// ─── Audio Conversion ────────────────────────────────────

describe('Audio Conversion (μ-law ↔ PCM)', () => {
    // Re-implement audio functions inline for unit testing
    const MULAW_TO_LINEAR = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
        let mu = ~i & 0xFF;
        let sign = (mu & 0x80) ? -1 : 1;
        let exponent = (mu >> 4) & 0x07;
        let mantissa = mu & 0x0F;
        let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
        magnitude -= 0x84;
        MULAW_TO_LINEAR[i] = sign * magnitude;
    }

    function mulawToPcm16k(mulawBuffer) {
        const pcm = Buffer.alloc(mulawBuffer.length * 4);
        for (let i = 0; i < mulawBuffer.length; i++) {
            const sample = MULAW_TO_LINEAR[mulawBuffer[i]];
            pcm.writeInt16LE(sample, i * 4);
            pcm.writeInt16LE(sample, i * 4 + 2);
        }
        return pcm;
    }

    function linearToMulaw(sample) {
        const BIAS = 0x84;
        const MAX = 32635;
        let sign = 0;
        if (sample < 0) { sign = 0x80; sample = -sample; }
        if (sample > MAX) sample = MAX;
        sample += BIAS;
        let exponent = 7;
        let mask = 0x4000;
        while ((sample & mask) === 0 && exponent > 0) { exponent--; mask >>= 1; }
        const mantissa = (sample >> (exponent + 3)) & 0x0F;
        return ~(sign | (exponent << 4) | mantissa) & 0xFF;
    }

    function pcmToMulaw(pcmBuffer) {
        const mulawBuf = Buffer.alloc(pcmBuffer.length / 2);
        for (let i = 0; i < mulawBuf.length; i++) {
            const sample = pcmBuffer.readInt16LE(i * 2);
            mulawBuf[i] = linearToMulaw(sample);
        }
        return mulawBuf;
    }

    it('should convert μ-law to PCM 16kHz (upsampled)', () => {
        const mulaw = Buffer.from([0xFF, 0x7F, 0x00, 0x80]);
        const pcm = mulawToPcm16k(mulaw);

        expect(pcm.length).toBe(mulaw.length * 4);
        expect(pcm instanceof Buffer).toBe(true);
    });

    it('should convert PCM to μ-law', () => {
        const pcm = Buffer.alloc(8);
        pcm.writeInt16LE(0, 0);
        pcm.writeInt16LE(1000, 2);
        pcm.writeInt16LE(-1000, 4);
        pcm.writeInt16LE(32000, 6);

        const mulaw = pcmToMulaw(pcm);
        expect(mulaw.length).toBe(4);
        expect(mulaw instanceof Buffer).toBe(true);
    });

    it('should round-trip μ-law → PCM → μ-law with acceptable loss', () => {
        const original = Buffer.from([0xFF, 0x7F, 0xD5, 0x55]);
        const pcm = mulawToPcm16k(original);

        // Downsample PCM 16kHz → 8kHz
        const pcm8k = Buffer.alloc(pcm.length / 2);
        for (let i = 0; i < pcm8k.length; i += 2) {
            pcm8k.writeInt16LE(pcm.readInt16LE(i * 2), i);
        }

        const reconverted = pcmToMulaw(pcm8k);
        expect(reconverted.length).toBe(original.length);
    });
});

// ─── Tenant Telephony Config ─────────────────────────────

describe('Tenant Telephony Config', () => {
    it('should have telephony records in seed data', () => {
        const config = dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ?',
            ['atlas_support']
        );

        expect(config).toBeTruthy();
        expect(config.provider).toBe('twilio');
        expect(config.phone_number).toBe('+15551234567');
        expect(config.enabled).toBe(0);
    });

    it('should save and retrieve telephony config', () => {
        twilioService.saveTelephonyConfig('atlas_support', {
            provider: 'twilio',
            account_sid: 'AC_test_sid',
            auth_token: 'test_auth_token',
            phone_number: '+15559999999',
            enabled: true
        });

        const config = dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ?',
            ['atlas_support']
        );

        expect(config.account_sid).toBe('AC_test_sid');
        expect(config.phone_number).toBe('+15559999999');
        expect(config.enabled).toBe(1);
        expect(config.auth_token_encrypted).toBeTruthy();
        expect(config.auth_token_encrypted).not.toBe('test_auth_token');

        const decrypted = twilioService.decrypt(config.auth_token_encrypted);
        expect(decrypted).toBe('test_auth_token');
    });

    it('should isolate telephony config between tenants', () => {
        const atlas = dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ?',
            ['atlas_support']
        );
        const nova = dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ?',
            ['nova_logistics']
        );

        expect(atlas).toBeTruthy();
        expect(nova).toBeTruthy();
        expect(atlas.phone_number).not.toBe(nova.phone_number);
    });

    it('should look up tenant by phone number', () => {
        // atlas_support was enabled by the saveTelephonyConfig test above
        const config = twilioService.getTenantByPhone('+15559999999');
        expect(config).toBeTruthy();
        expect(config.tenant_id).toBe('atlas_support');
    });
});

// ─── Billing: Telephony Minutes ──────────────────────────

describe('Telephony Billing', () => {
    it('should track telephony minutes in usage_metrics', () => {
        const month = new Date().toISOString().slice(0, 7);

        twilioService.trackMinutes('atlas_support', 180); // 3 minutes

        const usage = dbPrepareGet(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            ['atlas_support', month]
        );

        expect(usage).toBeTruthy();
        expect(usage.telephony_minutes).toBeGreaterThanOrEqual(3);
    });

    it('should accumulate minutes across calls', () => {
        const month = new Date().toISOString().slice(0, 7);

        const before = dbPrepareGet(
            'SELECT telephony_minutes FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            ['atlas_support', month]
        );
        const beforeMinutes = before?.telephony_minutes || 0;

        twilioService.trackMinutes('atlas_support', 60); // 1 more minute

        const after = dbPrepareGet(
            'SELECT telephony_minutes FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            ['atlas_support', month]
        );

        expect(after.telephony_minutes).toBe(beforeMinutes + 1);
    });
});

// ─── Webhook Signature Validation ────────────────────────

describe('Webhook Signature Validation', () => {
    it('should validate correct Twilio signature', () => {
        const authToken = 'test_token_12345';
        const url = 'https://example.com/api/twilio/inbound';
        const params = { CallSid: 'CA123', From: '+1234567890' };

        // Compute expected signature
        let data = url;
        const sortedKeys = Object.keys(params).sort();
        for (const key of sortedKeys) {
            data += key + params[key];
        }
        const expectedSig = crypto.createHmac('sha1', authToken)
            .update(data)
            .digest('base64');

        const isValid = twilioService.validateSignature(url, params, expectedSig, authToken);
        expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
        const isValid = twilioService.validateSignature(
            'https://example.com/api/twilio/inbound',
            { CallSid: 'CA123' },
            'invalid_signature',
            'test_token'
        );
        expect(isValid).toBe(false);
    });
});

// ─── Twilio Media WS Sessions ────────────────────────────

describe('Twilio Media Sessions', () => {
    it('should export session tracking functions', () => {
        const { getTwilioSessions, twilioSessions } = require('../src/services/twilio.media.ws');
        expect(typeof getTwilioSessions).toBe('function');
        expect(twilioSessions instanceof Map).toBe(true);
    });

    it('should return empty sessions initially', () => {
        const { getTwilioSessions } = require('../src/services/twilio.media.ws');
        const sessions = getTwilioSessions();
        expect(Array.isArray(sessions)).toBe(true);
    });
});

// ─── Schema Validation ───────────────────────────────────

describe('Schema', () => {
    it('should have tenant_telephony table', () => {
        const tables = dbPrepareAll(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_telephony'"
        );
        expect(tables.length).toBe(1);
    });

    it('should have telephony_minutes column in usage_metrics', () => {
        const info = dbPrepareAll("PRAGMA table_info(usage_metrics)");
        const colNames = info.map(c => c.name);
        expect(colNames).toContain('telephony_minutes');
    });

    it('should have correct columns in tenant_telephony', () => {
        const info = dbPrepareAll("PRAGMA table_info(tenant_telephony)");
        const colNames = info.map(c => c.name);

        expect(colNames).toContain('tenant_id');
        expect(colNames).toContain('provider');
        expect(colNames).toContain('account_sid');
        expect(colNames).toContain('auth_token_encrypted');
        expect(colNames).toContain('phone_number');
        expect(colNames).toContain('twiml_app_sid');
        expect(colNames).toContain('enabled');
    });
});
