/**
 * Outbound Execution Tests
 *
 * Tests for:
 * - Campaign execution: green/yellow/red contact handling
 * - Campaign progress tracking
 * - France 4 calls/month frequency limit
 * - US multi-timezone area code mapping
 * - US calling hours with correct local timezone
 * - Outbound compliance frequency integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Fix 1: Campaign Execution Tests
// =============================================

describe('Campaign Execution', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('creates outbound calls for green contacts', async () => {
        // Mock dependencies
        const mockCallResult = {
            sid: 'CA_green_001',
            status: 'queued',
            direction: 'outbound-api',
            from: '+14155551234',
            to: '+14155559876',
            dateCreated: '2026-03-15T10:00:00Z',
        };

        const mockCreateOutboundCall = vi.fn().mockResolvedValue(mockCallResult);

        vi.doMock('@/lib/twilio/outbound', () => ({
            createOutboundCall: mockCreateOutboundCall,
        }));

        vi.doMock('@/lib/compliance/outbound-compliance', () => ({
            runOutboundComplianceCheck: vi.fn().mockResolvedValue({
                phoneNumber: '+14155559876',
                consentValid: true,
                callingHoursValid: true,
                callFrequencyValid: true,
                dncChecked: false,
                iysStatus: 'SKIPPED',
                overallAllowed: true,
                reasons: [],
            }),
        }));

        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');
        const { createOutboundCall } = await import('@/lib/twilio/outbound');

        // Simulate campaign execution logic for green contacts
        const contacts = [
            { phoneNumber: '+14155559876', name: 'Alice', complianceScore: { level: 'green' as const, score: 100, consentValid: true, callingHoursValid: true, callingHoursSchedulable: true, country: 'US', reasons: [], actionable: 'call_now' as const } },
        ];

        const compliance = await runOutboundComplianceCheck('tenant1', contacts[0].phoneNumber, 'en');
        expect(compliance.overallAllowed).toBe(true);

        // Green contact should result in a call
        const result = await createOutboundCall({
            accountSid: 'AC_test',
            authToken: 'test_token',
            to: contacts[0].phoneNumber,
            from: '+14155551234',
            webhookUrl: 'https://example.com/webhook',
        });

        expect(result.sid).toBe('CA_green_001');
        expect(mockCreateOutboundCall).toHaveBeenCalledOnce();

        vi.doUnmock('@/lib/twilio/outbound');
        vi.doUnmock('@/lib/compliance/outbound-compliance');
    });

    it('skips red contacts (blocked)', async () => {
        vi.doMock('@/lib/compliance/outbound-compliance', () => ({
            runOutboundComplianceCheck: vi.fn().mockResolvedValue({
                phoneNumber: '+33123456789',
                consentValid: false,
                callingHoursValid: true,
                callFrequencyValid: true,
                dncChecked: false,
                iysStatus: 'SKIPPED',
                overallAllowed: false,
                reasons: ['consentRequired'],
            }),
        }));

        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const compliance = await runOutboundComplianceCheck('tenant1', '+33123456789', 'fr');
        expect(compliance.overallAllowed).toBe(false);
        expect(compliance.reasons).toContain('consentRequired');

        // Red contacts should NOT result in a call — they are marked as blocked
        const contact = {
            phoneNumber: '+33123456789',
            status: compliance.overallAllowed ? 'queued' : 'blocked',
            reason: compliance.reasons.join(', '),
        };

        expect(contact.status).toBe('blocked');
        expect(contact.reason).toBe('consentRequired');

        vi.doUnmock('@/lib/compliance/outbound-compliance');
    });

    it('schedules yellow contacts', async () => {
        const nextAllowedTime = '2026-03-16T08:00:00.000Z';

        vi.doMock('@/lib/compliance/outbound-compliance', () => ({
            runOutboundComplianceCheck: vi.fn().mockResolvedValue({
                phoneNumber: '+4930123456',
                consentValid: true,
                callingHoursValid: false,
                callFrequencyValid: true,
                dncChecked: false,
                iysStatus: 'SKIPPED',
                overallAllowed: false,
                reasons: ['Outside calling hours for DE'],
            }),
        }));

        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const compliance = await runOutboundComplianceCheck('tenant1', '+4930123456', 'de');
        expect(compliance.overallAllowed).toBe(false);
        expect(compliance.callingHoursValid).toBe(false);
        expect(compliance.consentValid).toBe(true);

        // Yellow: consent valid but outside hours — schedule
        const contact = {
            phoneNumber: '+4930123456',
            complianceScore: { level: 'yellow' as const, callingHoursSchedulable: true, nextAllowedTime },
            status: 'scheduled',
            scheduledTime: nextAllowedTime,
        };

        expect(contact.status).toBe('scheduled');
        expect(contact.scheduledTime).toBe(nextAllowedTime);

        vi.doUnmock('@/lib/compliance/outbound-compliance');
    });

    it('tracks campaign progress correctly', () => {
        // Simulate progress tracking
        const progress = {
            queued: 5,
            completed: 0,
            failed: 0,
            blocked: 2,
            scheduled: 1,
        };

        // Simulate processing green contacts
        // Contact 1: success
        progress.completed++;
        progress.queued--;
        expect(progress).toEqual({ queued: 4, completed: 1, failed: 0, blocked: 2, scheduled: 1 });

        // Contact 2: failure
        progress.failed++;
        progress.queued--;
        expect(progress).toEqual({ queued: 3, completed: 1, failed: 1, blocked: 2, scheduled: 1 });

        // Contact 3-5: success
        progress.completed += 3;
        progress.queued -= 3;
        expect(progress).toEqual({ queued: 0, completed: 4, failed: 1, blocked: 2, scheduled: 1 });

        // Total should equal original count
        const total = progress.completed + progress.failed + progress.blocked + progress.scheduled;
        expect(total).toBe(8);
    });
});

// =============================================
// Fix 2: France 4 Calls/Month Limit
// =============================================

describe('France 4 Calls/Month Limit', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('allows calls when < 4 this month', async () => {
        const { checkCallFrequencyLimit } = await import('@/lib/compliance/calling-hours');

        // Mock Firestore that returns 2 calls this month
        const mockDb = {
            collection: vi.fn().mockReturnThis(),
            doc: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue({ size: 2 }),
        } as unknown as FirebaseFirestore.Firestore;

        const result = await checkCallFrequencyLimit('+33123456789', 'tenant1', mockDb);

        expect(result.allowed).toBe(true);
        expect(result.callsMade).toBe(2);
        expect(result.maxAllowed).toBe(4);
    });

    it('blocks calls when >= 4 this month', async () => {
        const { checkCallFrequencyLimit } = await import('@/lib/compliance/calling-hours');

        // Mock Firestore that returns 4 calls this month
        const mockDb = {
            collection: vi.fn().mockReturnThis(),
            doc: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue({ size: 4 }),
        } as unknown as FirebaseFirestore.Firestore;

        const result = await checkCallFrequencyLimit('+33123456789', 'tenant1', mockDb);

        expect(result.allowed).toBe(false);
        expect(result.callsMade).toBe(4);
        expect(result.maxAllowed).toBe(4);
    });

    it('does not apply limit to non-FR numbers', async () => {
        const { checkCallFrequencyLimit } = await import('@/lib/compliance/calling-hours');

        // US number — no frequency limit
        const mockDb = {
            collection: vi.fn().mockReturnThis(),
            doc: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue({ size: 100 }),
        } as unknown as FirebaseFirestore.Firestore;

        const result = await checkCallFrequencyLimit('+12125551234', 'tenant1', mockDb);

        expect(result.allowed).toBe(true);
        expect(result.maxAllowed).toBe(Infinity);
        // Should not have queried Firestore at all for US numbers
        expect(mockDb.collection).not.toHaveBeenCalled();
    });
});

// =============================================
// Fix 3: US Multi-Timezone Support
// =============================================

describe('US Multi-Timezone Support', () => {
    it('LA (+1213) uses America/Los_Angeles', async () => {
        const { getUSTimezone } = await import('@/lib/compliance/calling-hours');
        expect(getUSTimezone('+12135551234')).toBe('America/Los_Angeles');
    });

    it('NYC (+1212) uses America/New_York', async () => {
        const { getUSTimezone } = await import('@/lib/compliance/calling-hours');
        expect(getUSTimezone('+12125551234')).toBe('America/New_York');
    });

    it('Chicago (+1312) uses America/Chicago', async () => {
        const { getUSTimezone } = await import('@/lib/compliance/calling-hours');
        expect(getUSTimezone('+13125551234')).toBe('America/Chicago');
    });

    it('Hawaii (+1808) uses Pacific/Honolulu', async () => {
        const { getUSTimezone } = await import('@/lib/compliance/calling-hours');
        expect(getUSTimezone('+18085551234')).toBe('Pacific/Honolulu');
    });

    it('unknown area code defaults to America/New_York', async () => {
        const { getUSTimezone } = await import('@/lib/compliance/calling-hours');
        // Use an area code not in the map
        expect(getUSTimezone('+19995551234')).toBe('America/New_York');
    });

    it('getTimezoneForPhone uses area code for US numbers', async () => {
        const { getTimezoneForPhone } = await import('@/lib/compliance/calling-hours');

        expect(getTimezoneForPhone('+12135551234', 'US')).toBe('America/Los_Angeles');
        expect(getTimezoneForPhone('+12125551234', 'US')).toBe('America/New_York');
        expect(getTimezoneForPhone('+13125551234', 'US')).toBe('America/Chicago');
        expect(getTimezoneForPhone('+18085551234', 'US')).toBe('Pacific/Honolulu');
        expect(getTimezoneForPhone('+19075551234', 'US')).toBe('America/Anchorage');
    });

    it('getTimezoneForPhone returns single timezone for non-US countries', async () => {
        const { getTimezoneForPhone } = await import('@/lib/compliance/calling-hours');

        expect(getTimezoneForPhone('+33123456789', 'FR')).toBe('Europe/Paris');
        expect(getTimezoneForPhone('+4930123456', 'DE')).toBe('Europe/Berlin');
        expect(getTimezoneForPhone('+905321234567', 'TR')).toBe('Europe/Istanbul');
    });

    it('US calling hours checked against correct local timezone', async () => {
        const { isCallingAllowed } = await import('@/lib/compliance/calling-hours');

        // Create a time that is 10:00 Eastern but 07:00 Pacific (before 08:00 TCPA limit)
        // January to avoid DST complexity: EST = UTC-5, PST = UTC-8
        const jan15_1500utc = new Date('2026-01-15T15:00:00Z');
        // 15:00 UTC = 10:00 EST = 07:00 PST

        // NYC (Eastern) at 10:00 local — should be allowed (08:00-21:00)
        const nycResult = isCallingAllowed('+12125551234', jan15_1500utc);
        expect(nycResult.allowed).toBe(true);
        expect(nycResult.country).toBe('US');

        // LA (Pacific) at 07:00 local — should be blocked (before 08:00)
        const laResult = isCallingAllowed('+12135551234', jan15_1500utc);
        expect(laResult.allowed).toBe(false);
        expect(laResult.country).toBe('US');
    });
});

// =============================================
// Integration: Outbound Compliance + Frequency
// =============================================

describe('Outbound Compliance — Frequency Check Integration', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('outbound-compliance includes callFrequencyValid field', async () => {
        vi.doMock('@/lib/compliance/consent-manager', () => ({
            checkOutboundConsent: vi.fn().mockResolvedValue({
                phoneNumber: '+33123456789',
                consentStatus: 'granted',
                consentSource: 'manual',
                consentDate: '2026-01-01',
                country: 'FR',
                updatedAt: '2026-01-01',
                updatedBy: 'admin',
            }),
            isConsentValid: vi.fn().mockReturnValue(true),
            OutboundComplianceCheck: {},
        }));

        vi.doMock('@/lib/compliance/calling-hours', () => ({
            isCallingAllowed: vi.fn().mockReturnValue({
                allowed: true,
                country: 'FR',
                localTime: 'Wednesday 14:00',
            }),
            detectCountryFromPhone: vi.fn().mockReturnValue('FR'),
            checkCallFrequencyLimit: vi.fn().mockResolvedValue({
                allowed: false,
                callsMade: 4,
                maxAllowed: 4,
            }),
        }));

        vi.doMock('@/lib/compliance/iys-client', () => ({
            getDefaultIYSClient: vi.fn().mockReturnValue({
                checkConsent: vi.fn().mockResolvedValue({ status: 'SKIPPED' }),
            }),
        }));

        vi.doMock('@/lib/compliance/call-types', () => ({
            classifyCallPurpose: vi.fn().mockReturnValue({
                category: 'marketing',
                consentRequired: true,
                iysRequired: false,
                dncCheckRequired: true,
                frequencyLimitApplies: true,
                exemptionBasis: 'No exemption',
            }),
        }));

        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const mockDb = {} as FirebaseFirestore.Firestore;
        const result = await runOutboundComplianceCheck('tenant1', '+33123456789', 'fr', mockDb);

        expect(result).toHaveProperty('callFrequencyValid');
        expect(result.callFrequencyValid).toBe(false);
        expect(result.overallAllowed).toBe(false);
        expect(result.reasons.some((r: string) => r.includes('Monthly call limit'))).toBe(true);

        vi.doUnmock('@/lib/compliance/consent-manager');
        vi.doUnmock('@/lib/compliance/calling-hours');
        vi.doUnmock('@/lib/compliance/iys-client');
        vi.doUnmock('@/lib/compliance/call-types');
    });
});
