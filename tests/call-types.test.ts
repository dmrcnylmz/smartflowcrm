/**
 * Call Type Classification Tests
 *
 * Verifies call purpose classification, exemption texts, compliance integration,
 * and i18n key coverage for call types.
 */

import { describe, it, expect } from 'vitest';
import {
    classifyCallPurpose,
    getExemptionText,
    getAllCallPurposes,
    type CallPurpose,
} from '@/lib/compliance/call-types';

// =============================================
// classifyCallPurpose
// =============================================

describe('classifyCallPurpose', () => {
    it('appointment_reminder returns transactional, no consent required', () => {
        const rules = classifyCallPurpose('appointment_reminder');
        expect(rules.category).toBe('transactional');
        expect(rules.consentRequired).toBe(false);
        expect(rules.iysRequired).toBe(false);
        expect(rules.dncCheckRequired).toBe(false);
        expect(rules.frequencyLimitApplies).toBe(false);
    });

    it('payment_reminder returns transactional', () => {
        const rules = classifyCallPurpose('payment_reminder');
        expect(rules.category).toBe('transactional');
        expect(rules.consentRequired).toBe(false);
        expect(rules.iysRequired).toBe(false);
    });

    it('delivery_notification returns transactional', () => {
        const rules = classifyCallPurpose('delivery_notification');
        expect(rules.category).toBe('transactional');
        expect(rules.consentRequired).toBe(false);
    });

    it('marketing returns marketing, consent required', () => {
        const rules = classifyCallPurpose('marketing');
        expect(rules.category).toBe('marketing');
        expect(rules.consentRequired).toBe(true);
        expect(rules.iysRequired).toBe(true);
        expect(rules.dncCheckRequired).toBe(true);
        expect(rules.frequencyLimitApplies).toBe(true);
    });

    it('b2b_outreach returns marketing, no consent (B2B exempt)', () => {
        const rules = classifyCallPurpose('b2b_outreach');
        expect(rules.category).toBe('marketing');
        expect(rules.consentRequired).toBe(false);
        expect(rules.dncCheckRequired).toBe(true);
    });

    it('custom defaults to marketing (strictest rules)', () => {
        const rules = classifyCallPurpose('custom');
        expect(rules.category).toBe('marketing');
        expect(rules.consentRequired).toBe(true);
        expect(rules.iysRequired).toBe(true);
        expect(rules.dncCheckRequired).toBe(true);
        expect(rules.frequencyLimitApplies).toBe(true);
    });

    it('survey_feedback has frequency limit', () => {
        const rules = classifyCallPurpose('survey_feedback');
        expect(rules.category).toBe('service');
        expect(rules.consentRequired).toBe(false);
        expect(rules.frequencyLimitApplies).toBe(true);
    });

    it('service_followup returns service category, no consent', () => {
        const rules = classifyCallPurpose('service_followup');
        expect(rules.category).toBe('service');
        expect(rules.consentRequired).toBe(false);
        expect(rules.dncCheckRequired).toBe(false);
    });

    it('contract_renewal returns service category, no consent', () => {
        const rules = classifyCallPurpose('contract_renewal');
        expect(rules.category).toBe('service');
        expect(rules.consentRequired).toBe(false);
    });
});

// =============================================
// getExemptionText
// =============================================

describe('getExemptionText', () => {
    const countries = ['TR', 'DE', 'FR', 'US', 'UK'];

    it('returns text for all 5 countries for transactional calls', () => {
        for (const country of countries) {
            const text = getExemptionText('appointment_reminder', country);
            expect(text).toBeTruthy();
            expect(typeof text).toBe('string');
            expect(text.length).toBeGreaterThan(5);
        }
    });

    it('returns text for all 5 countries for service calls', () => {
        for (const country of countries) {
            const text = getExemptionText('service_followup', country);
            expect(text).toBeTruthy();
            expect(typeof text).toBe('string');
        }
    });

    it('returns text for all 5 countries for marketing calls', () => {
        for (const country of countries) {
            const text = getExemptionText('marketing', country);
            expect(text).toBeTruthy();
            expect(typeof text).toBe('string');
        }
    });

    it('TR exemption text is in Turkish', () => {
        const text = getExemptionText('appointment_reminder', 'TR');
        expect(text).toContain('6563');
    });

    it('DE exemption text references UWG', () => {
        const text = getExemptionText('service_followup', 'DE');
        expect(text).toContain('UWG');
    });

    it('FR exemption text references Code de la consommation', () => {
        const text = getExemptionText('service_followup', 'FR');
        expect(text).toContain('Code de la consommation');
    });

    it('US exemption text references TCPA', () => {
        const text = getExemptionText('appointment_reminder', 'US');
        expect(text).toContain('TCPA');
    });

    it('UK exemption text references PECR', () => {
        const text = getExemptionText('appointment_reminder', 'UK');
        expect(text).toContain('PECR');
    });

    it('falls back to US text for unknown country', () => {
        const text = getExemptionText('appointment_reminder', 'XX');
        const usText = getExemptionText('appointment_reminder', 'US');
        expect(text).toBe(usText);
    });
});

// =============================================
// getAllCallPurposes
// =============================================

describe('getAllCallPurposes', () => {
    it('returns all 9 purposes', () => {
        const purposes = getAllCallPurposes();
        expect(purposes).toHaveLength(9);
    });

    it('each purpose has value, labelKey, and category', () => {
        const purposes = getAllCallPurposes();
        for (const p of purposes) {
            expect(p.value).toBeTruthy();
            expect(p.labelKey).toBeTruthy();
            expect(['transactional', 'service', 'marketing']).toContain(p.category);
        }
    });

    it('includes all expected purpose values', () => {
        const purposes = getAllCallPurposes();
        const values = purposes.map(p => p.value);
        expect(values).toContain('appointment_reminder');
        expect(values).toContain('payment_reminder');
        expect(values).toContain('delivery_notification');
        expect(values).toContain('service_followup');
        expect(values).toContain('survey_feedback');
        expect(values).toContain('contract_renewal');
        expect(values).toContain('b2b_outreach');
        expect(values).toContain('marketing');
        expect(values).toContain('custom');
    });

    it('transactional purposes have correct category', () => {
        const purposes = getAllCallPurposes();
        const transactional = purposes.filter(p => p.category === 'transactional');
        expect(transactional.length).toBe(3);
        const values = transactional.map(p => p.value);
        expect(values).toContain('appointment_reminder');
        expect(values).toContain('payment_reminder');
        expect(values).toContain('delivery_notification');
    });
});

// =============================================
// Compliance integration (purpose-aware checks)
// =============================================

describe('Compliance integration with call types', () => {
    it('transactional calls skip consent — consentRequired is false', () => {
        const transactionalPurposes: CallPurpose[] = [
            'appointment_reminder',
            'payment_reminder',
            'delivery_notification',
        ];
        for (const purpose of transactionalPurposes) {
            const rules = classifyCallPurpose(purpose);
            expect(rules.consentRequired).toBe(false);
        }
    });

    it('marketing calls require consent — consentRequired is true', () => {
        const rules = classifyCallPurpose('marketing');
        expect(rules.consentRequired).toBe(true);
    });

    it('custom calls require consent — consentRequired is true', () => {
        const rules = classifyCallPurpose('custom');
        expect(rules.consentRequired).toBe(true);
    });

    it('service calls skip consent', () => {
        const servicePurposes: CallPurpose[] = [
            'service_followup',
            'survey_feedback',
            'contract_renewal',
        ];
        for (const purpose of servicePurposes) {
            const rules = classifyCallPurpose(purpose);
            expect(rules.consentRequired).toBe(false);
        }
    });

    it('transactional calls skip IYS', () => {
        const rules = classifyCallPurpose('appointment_reminder');
        expect(rules.iysRequired).toBe(false);
    });

    it('marketing calls require IYS for Turkey', () => {
        const rules = classifyCallPurpose('marketing');
        expect(rules.iysRequired).toBe(true);
    });

    it('b2b_outreach skips IYS', () => {
        const rules = classifyCallPurpose('b2b_outreach');
        expect(rules.iysRequired).toBe(false);
    });
});

// =============================================
// Campaign purpose field
// =============================================

describe('Campaign creation accepts purpose field', () => {
    it('all purpose values are valid CallPurpose types', () => {
        const validPurposes: CallPurpose[] = [
            'appointment_reminder',
            'payment_reminder',
            'delivery_notification',
            'service_followup',
            'survey_feedback',
            'contract_renewal',
            'b2b_outreach',
            'marketing',
            'custom',
        ];
        for (const purpose of validPurposes) {
            const rules = classifyCallPurpose(purpose);
            expect(rules).toBeDefined();
            expect(rules.category).toBeDefined();
        }
    });

    it('purpose classification returns exemptionBasis string', () => {
        const validPurposes: CallPurpose[] = [
            'appointment_reminder',
            'payment_reminder',
            'delivery_notification',
            'service_followup',
            'survey_feedback',
            'contract_renewal',
            'b2b_outreach',
            'marketing',
            'custom',
        ];
        for (const purpose of validPurposes) {
            const rules = classifyCallPurpose(purpose);
            expect(typeof rules.exemptionBasis).toBe('string');
            expect(rules.exemptionBasis.length).toBeGreaterThan(0);
        }
    });
});

// =============================================
// i18n: all call purpose keys in 4 languages
// =============================================

describe('i18n: call purpose keys exist in all 4 languages', () => {
    const requiredKeys = [
        'callPurpose',
        'appointmentReminder',
        'paymentReminder',
        'deliveryNotification',
        'serviceFollowup',
        'surveyFeedback',
        'contractRenewal',
        'b2bOutreach',
        'marketingCall',
        'customCall',
        'transactional',
        'service',
        'marketing',
        'noConsentNeeded',
        'consentNeeded',
        'exemptionBasis',
        'serviceCallExemption',
    ];

    const languages = ['tr', 'en', 'de', 'fr'];

    for (const lang of languages) {
        it(`${lang}.json has all call purpose keys`, async () => {
            // Dynamic import of JSON messages
            const messages = await import(`@/messages/${lang}.json`);
            const campaigns = messages.default?.campaigns || messages.campaigns;
            expect(campaigns).toBeDefined();

            for (const key of requiredKeys) {
                expect(campaigns[key], `Missing key: campaigns.${key} in ${lang}.json`).toBeDefined();
                expect(typeof campaigns[key]).toBe('string');
                expect(campaigns[key].length, `Empty value for campaigns.${key} in ${lang}.json`).toBeGreaterThan(0);
            }
        });
    }
});
