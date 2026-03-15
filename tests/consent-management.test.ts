/**
 * Consent Management Tests
 *
 * Tests for:
 * - hashPhone produces consistent SHA256
 * - isConsentValid: granted/denied/expired/withdrawn
 * - Consent with expired date returns false
 * - Consent API requires auth (401 without)
 * - ToS acceptance API requires auth
 * - runOutboundComplianceCheck blocks when no consent
 * - runOutboundComplianceCheck blocks when calling hours invalid
 * - runOutboundComplianceCheck passes when both consent + hours valid
 * - i18n: compliance namespace has all keys in 4 languages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Unit Tests: hashPhone
// =============================================

describe('Consent Management — hashPhone', () => {
    it('produces consistent SHA256 for the same phone number', async () => {
        const { hashPhone } = await import('@/lib/compliance/consent-manager');

        const hash1 = hashPhone('+905551234567');
        const hash2 = hashPhone('+905551234567');
        expect(hash1).toBe(hash2);
    });

    it('produces a 64-character hex string', async () => {
        const { hashPhone } = await import('@/lib/compliance/consent-manager');

        const hash = hashPhone('+14155551234');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different hashes for different numbers', async () => {
        const { hashPhone } = await import('@/lib/compliance/consent-manager');

        const hash1 = hashPhone('+905551234567');
        const hash2 = hashPhone('+905559999999');
        expect(hash1).not.toBe(hash2);
    });
});

// =============================================
// Unit Tests: isConsentValid
// =============================================

describe('Consent Management — isConsentValid', () => {
    it('returns true for granted consent', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'granted',
            consentSource: 'manual',
            consentDate: '2025-01-01T00:00:00Z',
            country: 'TR',
            updatedAt: '2025-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(true);
    });

    it('returns false for denied consent', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'denied',
            consentSource: 'manual',
            consentDate: '2025-01-01T00:00:00Z',
            country: 'TR',
            updatedAt: '2025-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(false);
    });

    it('returns false for withdrawn consent', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'withdrawn',
            consentSource: 'manual',
            consentDate: '2025-01-01T00:00:00Z',
            country: 'TR',
            updatedAt: '2025-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(false);
    });

    it('returns false for expired consent status', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'expired',
            consentSource: 'manual',
            consentDate: '2025-01-01T00:00:00Z',
            country: 'TR',
            updatedAt: '2025-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(false);
    });

    it('returns false for pending consent', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'pending',
            consentSource: 'manual',
            consentDate: '2025-01-01T00:00:00Z',
            country: 'TR',
            updatedAt: '2025-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(false);
    });

    it('returns false for null consent', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');
        expect(isConsentValid(null)).toBe(false);
    });

    it('returns false for granted consent with past expiry date', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'granted',
            consentSource: 'manual',
            consentDate: '2024-01-01T00:00:00Z',
            expiryDate: '2024-06-01T00:00:00Z', // past
            country: 'TR',
            updatedAt: '2024-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(false);
    });

    it('returns true for granted consent with future expiry date', async () => {
        const { isConsentValid } = await import('@/lib/compliance/consent-manager');

        expect(isConsentValid({
            phoneNumber: '+905551234567',
            consentStatus: 'granted',
            consentSource: 'manual',
            consentDate: '2025-01-01T00:00:00Z',
            expiryDate: '2099-12-31T00:00:00Z', // far future
            country: 'TR',
            updatedAt: '2025-01-01T00:00:00Z',
            updatedBy: 'user1',
        })).toBe(true);
    });
});

// =============================================
// API Auth Tests — Consent
// =============================================

describe('Consent API — requires auth', () => {
    it('GET /api/compliance/consent returns 401 without auth', async () => {
        const { GET } = await import('@/app/api/compliance/consent/route');
        const req = new Request('http://localhost:3009/api/compliance/consent?phone=%2B905551234567', {
            method: 'GET',
        });

        // @ts-expect-error - NextRequest typing
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('POST /api/compliance/consent returns 401 without auth', async () => {
        const { POST } = await import('@/app/api/compliance/consent/route');
        const req = new Request('http://localhost:3009/api/compliance/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '+905551234567', consentStatus: 'granted', consentSource: 'manual' }),
        });

        // @ts-expect-error - NextRequest typing
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('DELETE /api/compliance/consent returns 401 without auth', async () => {
        const { DELETE } = await import('@/app/api/compliance/consent/route');
        const req = new Request('http://localhost:3009/api/compliance/consent?phone=%2B905551234567', {
            method: 'DELETE',
        });

        // @ts-expect-error - NextRequest typing
        const res = await DELETE(req);
        expect(res.status).toBe(401);
    });
});

// =============================================
// API Auth Tests — ToS
// =============================================

describe('ToS Acceptance API — requires auth', () => {
    it('GET /api/compliance/tos-acceptance returns 401 without auth', async () => {
        const { GET } = await import('@/app/api/compliance/tos-acceptance/route');
        const req = new Request('http://localhost:3009/api/compliance/tos-acceptance', {
            method: 'GET',
        });

        // @ts-expect-error - NextRequest typing
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('POST /api/compliance/tos-acceptance returns 401 without auth', async () => {
        const { POST } = await import('@/app/api/compliance/tos-acceptance/route');
        const req = new Request('http://localhost:3009/api/compliance/tos-acceptance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accepted: true, version: '1.0' }),
        });

        // @ts-expect-error - NextRequest typing
        const res = await POST(req);
        expect(res.status).toBe(401);
    });
});

// =============================================
// Unit Tests: runOutboundComplianceCheck
// =============================================

describe('Consent Management — runOutboundComplianceCheck', () => {
    it('blocks when no consent (no db)', async () => {
        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const result = await runOutboundComplianceCheck('tenant1', '+14155551234', 'en');
        // Without db, consent is always invalid
        expect(result.consentValid).toBe(false);
        expect(result.overallAllowed).toBe(false);
        expect(result.reasons).toContain('consentRequired');
    });

    it('blocks when calling hours invalid (mocked)', async () => {
        // Mock isCallingAllowed to return blocked
        vi.doMock('@/lib/compliance/calling-hours', () => ({
            isCallingAllowed: () => ({
                allowed: false,
                reason: 'Outside calling hours for TR (9:00-18:00 local time)',
                country: 'TR',
                localTime: 'Monday, 23:00',
            }),
        }));

        // Clear cached module
        vi.resetModules();

        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');
        const result = await runOutboundComplianceCheck('tenant1', '+905551234567', 'tr');

        expect(result.callingHoursValid).toBe(false);
        expect(result.overallAllowed).toBe(false);

        // Restore
        vi.doUnmock('@/lib/compliance/calling-hours');
        vi.resetModules();
    });

    it('passes when both consent + hours valid (mocked)', async () => {
        // Mock calling hours as allowed
        vi.doMock('@/lib/compliance/calling-hours', () => ({
            isCallingAllowed: () => ({
                allowed: true,
                country: 'US',
                localTime: 'Monday, 10:00',
            }),
        }));

        // Mock consent check to return valid consent
        vi.doMock('@/lib/compliance/consent-manager', async () => {
            const actual = await vi.importActual('@/lib/compliance/consent-manager');
            return {
                ...actual,
                checkOutboundConsent: async () => ({
                    phoneNumber: '+14155551234',
                    consentStatus: 'granted',
                    consentSource: 'manual',
                    consentDate: '2025-01-01T00:00:00Z',
                    country: 'US',
                    updatedAt: '2025-01-01T00:00:00Z',
                    updatedBy: 'user1',
                }),
            };
        });

        vi.resetModules();

        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        // Pass a mock db object
        const mockDb = {} as FirebaseFirestore.Firestore;
        const result = await runOutboundComplianceCheck('tenant1', '+14155551234', 'en', mockDb);

        expect(result.consentValid).toBe(true);
        expect(result.callingHoursValid).toBe(true);
        expect(result.overallAllowed).toBe(true);
        expect(result.reasons).toHaveLength(0);

        // Restore
        vi.doUnmock('@/lib/compliance/calling-hours');
        vi.doUnmock('@/lib/compliance/consent-manager');
        vi.resetModules();
    });
});

// =============================================
// i18n Tests: compliance namespace
// =============================================

describe('i18n — compliance namespace', () => {
    const REQUIRED_KEYS = [
        'consentRequired',
        'consentGranted',
        'consentDenied',
        'consentExpired',
        'callingHoursBlocked',
        'weekendBlocked',
        'lunchBreakBlocked',
        'tosRequired',
        'tosAccepted',
        'complianceScore',
        'allChecksPass',
        'consentConfirmation',
        'iysCheck',
        'iysApproved',
        'iysRejected',
    ];

    const languages = ['en', 'tr', 'de', 'fr'] as const;

    for (const lang of languages) {
        it(`${lang}.json has all compliance keys`, async () => {
            const messages = await import(`@/messages/${lang}.json`);
            const compliance = messages.compliance || messages.default?.compliance;

            expect(compliance).toBeDefined();
            for (const key of REQUIRED_KEYS) {
                expect(compliance).toHaveProperty(key);
                expect(typeof compliance[key]).toBe('string');
                expect(compliance[key].length).toBeGreaterThan(0);
            }
        });
    }

    it('all 4 languages have the same compliance keys', async () => {
        const allKeys: Record<string, string[]> = {};

        for (const lang of languages) {
            const messages = await import(`@/messages/${lang}.json`);
            const compliance = messages.compliance || messages.default?.compliance;
            allKeys[lang] = Object.keys(compliance).sort();
        }

        // All languages should have the same set of keys
        expect(allKeys.en).toEqual(allKeys.tr);
        expect(allKeys.en).toEqual(allKeys.de);
        expect(allKeys.en).toEqual(allKeys.fr);
    });
});
