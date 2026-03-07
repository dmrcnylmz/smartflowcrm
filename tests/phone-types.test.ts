/**
 * Phone Types Tests — getProviderForCountry & COUNTRY_ROUTING
 *
 * Covers:
 *   - Country → provider routing logic
 *   - Turkey (TR) → SIP_TRUNK
 *   - All other countries → TWILIO_NATIVE (default)
 *   - Case insensitivity
 *   - Unknown / invalid country codes
 */

import { describe, it, expect } from 'vitest';
import { getProviderForCountry, COUNTRY_ROUTING } from '@/lib/phone/types';
import type { ProviderType, SipCarrier, PortingStatus } from '@/lib/phone/types';

// =============================================
// getProviderForCountry
// =============================================

describe('getProviderForCountry', () => {
    it('should return SIP_TRUNK for Turkey (TR)', () => {
        expect(getProviderForCountry('TR')).toBe('SIP_TRUNK');
    });

    it('should handle lowercase country code (tr → SIP_TRUNK)', () => {
        expect(getProviderForCountry('tr')).toBe('SIP_TRUNK');
    });

    it('should handle mixed case (Tr → SIP_TRUNK)', () => {
        expect(getProviderForCountry('Tr')).toBe('SIP_TRUNK');
    });

    it('should return TWILIO_NATIVE for US', () => {
        expect(getProviderForCountry('US')).toBe('TWILIO_NATIVE');
    });

    it('should return TWILIO_NATIVE for GB', () => {
        expect(getProviderForCountry('GB')).toBe('TWILIO_NATIVE');
    });

    it('should return TWILIO_NATIVE for DE', () => {
        expect(getProviderForCountry('DE')).toBe('TWILIO_NATIVE');
    });

    it('should return TWILIO_NATIVE for NL', () => {
        expect(getProviderForCountry('NL')).toBe('TWILIO_NATIVE');
    });

    it('should return TWILIO_NATIVE for unknown country code', () => {
        expect(getProviderForCountry('XX')).toBe('TWILIO_NATIVE');
    });

    it('should return TWILIO_NATIVE for empty string', () => {
        expect(getProviderForCountry('')).toBe('TWILIO_NATIVE');
    });

    it('should return TWILIO_NATIVE for 3-letter code', () => {
        expect(getProviderForCountry('TUR')).toBe('TWILIO_NATIVE');
    });
});

// =============================================
// COUNTRY_ROUTING constant
// =============================================

describe('COUNTRY_ROUTING', () => {
    it('should have Turkey mapped to SIP_TRUNK', () => {
        expect(COUNTRY_ROUTING['TR']).toBe('SIP_TRUNK');
    });

    it('should only contain TR (no other countries mapped)', () => {
        expect(Object.keys(COUNTRY_ROUTING)).toEqual(['TR']);
    });

    it('should return undefined for non-mapped countries', () => {
        expect(COUNTRY_ROUTING['US']).toBeUndefined();
    });
});

// =============================================
// Type Assertion Tests (compile-time safety)
// =============================================

describe('Type definitions', () => {
    it('ProviderType should accept valid values', () => {
        const native: ProviderType = 'TWILIO_NATIVE';
        const sip: ProviderType = 'SIP_TRUNK';
        expect(native).toBe('TWILIO_NATIVE');
        expect(sip).toBe('SIP_TRUNK');
    });

    it('SipCarrier should accept valid values', () => {
        const carriers: SipCarrier[] = ['netgsm', 'bulutfon', 'other'];
        expect(carriers).toHaveLength(3);
        expect(carriers).toContain('netgsm');
        expect(carriers).toContain('bulutfon');
        expect(carriers).toContain('other');
    });

    it('PortingStatus should accept valid lifecycle values', () => {
        const statuses: PortingStatus[] = ['pending', 'submitted', 'in_progress', 'completed', 'rejected'];
        expect(statuses).toHaveLength(5);
    });
});
