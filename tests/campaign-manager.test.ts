/**
 * Campaign Manager Tests
 *
 * Tests for:
 * - Compliance score calculation (green/yellow/red)
 * - Campaign summary aggregation
 * - Compliance level colors and icons
 * - i18n key parity for campaigns namespace
 * - CSV parsing
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    calculateComplianceScore,
    calculateCampaignSummary,
    getComplianceLevelColor,
    getComplianceLevelIcon,
    type CampaignContact,
} from '@/lib/compliance/compliance-score';

// =============================================
// calculateComplianceScore
// =============================================

describe('calculateComplianceScore', () => {
    it('returns green (100) when consent valid and hours valid', () => {
        const result = calculateComplianceScore(true, true, true);
        expect(result.score).toBe(100);
        expect(result.level).toBe('green');
        expect(result.actionable).toBe('call_now');
        expect(result.consentValid).toBe(true);
        expect(result.callingHoursValid).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });

    it('returns yellow (70) when consent valid but hours invalid and schedulable', () => {
        const result = calculateComplianceScore(true, false, true);
        expect(result.score).toBe(70);
        expect(result.level).toBe('yellow');
        expect(result.actionable).toBe('schedule');
        expect(result.reasons).toContain('outsideHours');
    });

    it('returns red (0) when no consent', () => {
        const result = calculateComplianceScore(false, true, true);
        expect(result.score).toBe(0);
        expect(result.level).toBe('red');
        expect(result.actionable).toBe('blocked');
        expect(result.reasons).toContain('noConsent');
    });

    it('returns red (0) when no consent even with valid hours', () => {
        const result = calculateComplianceScore(false, true, false);
        expect(result.score).toBe(0);
        expect(result.level).toBe('red');
        expect(result.actionable).toBe('blocked');
    });

    it('returns blocked (30) when consent valid but hours invalid and not schedulable', () => {
        const result = calculateComplianceScore(true, false, false);
        expect(result.score).toBe(30);
        expect(result.level).toBe('red');
        expect(result.actionable).toBe('blocked');
    });
});

// =============================================
// calculateCampaignSummary
// =============================================

describe('calculateCampaignSummary', () => {
    it('returns zeroes for empty contacts array', () => {
        const summary = calculateCampaignSummary([]);
        expect(summary.totalContacts).toBe(0);
        expect(summary.greenCount).toBe(0);
        expect(summary.yellowCount).toBe(0);
        expect(summary.redCount).toBe(0);
        expect(summary.overallScore).toBe(0);
        expect(summary.overallLevel).toBe('red');
    });

    it('correctly counts mixed contacts', () => {
        const contacts: CampaignContact[] = [
            {
                phoneNumber: '+905321234567',
                complianceScore: calculateComplianceScore(true, true, true),
            },
            {
                phoneNumber: '+4915112345678',
                complianceScore: calculateComplianceScore(true, false, true),
            },
            {
                phoneNumber: '+33612345678',
                complianceScore: calculateComplianceScore(false, true, true),
            },
        ];

        const summary = calculateCampaignSummary(contacts);
        expect(summary.totalContacts).toBe(3);
        expect(summary.greenCount).toBe(1);
        expect(summary.yellowCount).toBe(1);
        expect(summary.redCount).toBe(1);
        expect(summary.overallScore).toBe(57); // (100 + 70 + 0) / 3 = 56.67 ~ 57
        expect(summary.overallLevel).toBe('yellow');
    });

    it('handles all green contacts', () => {
        const contacts: CampaignContact[] = [
            {
                phoneNumber: '+905321234567',
                complianceScore: calculateComplianceScore(true, true, true),
            },
            {
                phoneNumber: '+905321234568',
                complianceScore: calculateComplianceScore(true, true, true),
            },
        ];

        const summary = calculateCampaignSummary(contacts);
        expect(summary.greenCount).toBe(2);
        expect(summary.yellowCount).toBe(0);
        expect(summary.redCount).toBe(0);
        expect(summary.overallScore).toBe(100);
        expect(summary.overallLevel).toBe('green');
    });

    it('handles contacts without compliance score as red', () => {
        const contacts: CampaignContact[] = [
            { phoneNumber: '+905321234567' },
            { phoneNumber: '+905321234568' },
        ];

        const summary = calculateCampaignSummary(contacts);
        expect(summary.redCount).toBe(2);
        expect(summary.overallScore).toBe(0);
    });
});

// =============================================
// getComplianceLevelColor
// =============================================

describe('getComplianceLevelColor', () => {
    it('returns green-500 for green level', () => {
        expect(getComplianceLevelColor('green')).toBe('green-500');
    });

    it('returns yellow-500 for yellow level', () => {
        expect(getComplianceLevelColor('yellow')).toBe('yellow-500');
    });

    it('returns red-500 for red level', () => {
        expect(getComplianceLevelColor('red')).toBe('red-500');
    });
});

// =============================================
// getComplianceLevelIcon
// =============================================

describe('getComplianceLevelIcon', () => {
    it('returns CheckCircle for green', () => {
        expect(getComplianceLevelIcon('green')).toBe('CheckCircle');
    });

    it('returns Clock for yellow', () => {
        expect(getComplianceLevelIcon('yellow')).toBe('Clock');
    });

    it('returns XCircle for red', () => {
        expect(getComplianceLevelIcon('red')).toBe('XCircle');
    });
});

// =============================================
// i18n: campaigns namespace exists in all 4 languages
// =============================================

describe('Campaign i18n keys', () => {
    const LOCALES = ['tr', 'en', 'de', 'fr'] as const;
    const MESSAGES_DIR = path.resolve('messages');

    const REQUIRED_KEYS = [
        'title', 'newCampaign', 'campaignName', 'selectAgent', 'selectFromNumber',
        'uploadCsv', 'dragDropCsv', 'orClickToSelect', 'addManually',
        'consentConfirmation', 'consentRequired', 'createCampaign',
        'complianceScore', 'callable', 'schedulable', 'blocked',
        'startCampaign', 'pauseCampaign', 'resumeCampaign', 'deleteCampaign',
        'status', 'draft', 'running', 'paused', 'completed',
        'totalContacts', 'progress', 'reason', 'callNow', 'schedule',
        'noConsent', 'outsideHours', 'weekendBlocked', 'lunchBreak',
        'contactName', 'phoneNumber', 'country', 'overallScore',
        'noCampaigns', 'createFirst',
    ];

    for (const locale of LOCALES) {
        it(`${locale}.json has all campaigns keys`, () => {
            const content = fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf-8');
            const messages = JSON.parse(content);

            expect(messages.campaigns).toBeDefined();

            for (const key of REQUIRED_KEYS) {
                expect(messages.campaigns[key], `Missing key: campaigns.${key} in ${locale}`).toBeDefined();
                expect(typeof messages.campaigns[key]).toBe('string');
                expect(messages.campaigns[key].length).toBeGreaterThan(0);
            }
        });
    }

    it('all locales have the same campaigns keys', () => {
        const keysByLocale: Record<string, string[]> = {};

        for (const locale of LOCALES) {
            const content = fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf-8');
            const messages = JSON.parse(content);
            keysByLocale[locale] = Object.keys(messages.campaigns || {}).sort();
        }

        const referenceKeys = keysByLocale['tr'];
        for (const locale of LOCALES) {
            expect(keysByLocale[locale]).toEqual(referenceKeys);
        }
    });
});

// =============================================
// CSV Parsing
// =============================================

describe('CSV Parsing', () => {
    // Inline CSV parser matching the page component
    function parseCSV(text: string): Array<{ phoneNumber: string; name?: string; context?: string }> {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length === 0) return [];

        const separator = lines[0].includes(';') ? ';' : ',';
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('phone') || firstLine.includes('telefon') ||
            firstLine.includes('name') || firstLine.includes('isim') || firstLine.includes('number');

        const dataLines = hasHeader ? lines.slice(1) : lines;
        const results: Array<{ phoneNumber: string; name?: string; context?: string }> = [];

        for (const line of dataLines) {
            const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
            if (cols.length === 0 || !cols[0]) continue;

            results.push({
                phoneNumber: cols[0],
                name: cols[1] || undefined,
                context: cols[2] || undefined,
            });
        }

        return results;
    }

    it('parses comma-separated CSV with header', () => {
        const csv = `phone,name,context
+905321234567,Ali Yilmaz,VIP customer
+4915112345678,Hans Mueller,New lead`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(2);
        expect(result[0].phoneNumber).toBe('+905321234567');
        expect(result[0].name).toBe('Ali Yilmaz');
        expect(result[0].context).toBe('VIP customer');
        expect(result[1].phoneNumber).toBe('+4915112345678');
    });

    it('parses semicolon-separated CSV', () => {
        const csv = `telefon;isim
+905321234567;Ali
+33612345678;Pierre`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(2);
        expect(result[0].phoneNumber).toBe('+905321234567');
        expect(result[1].name).toBe('Pierre');
    });

    it('parses CSV without header', () => {
        const csv = `+905321234567,Ali
+4915112345678,Hans`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(2);
        expect(result[0].phoneNumber).toBe('+905321234567');
        expect(result[0].name).toBe('Ali');
    });

    it('handles quoted values', () => {
        const csv = `phone,name
"+905321234567","Ali Yilmaz"`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(1);
        expect(result[0].phoneNumber).toBe('+905321234567');
        expect(result[0].name).toBe('Ali Yilmaz');
    });

    it('handles empty lines', () => {
        const csv = `phone,name

+905321234567,Ali

+4915112345678,Hans
`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
        expect(parseCSV('')).toHaveLength(0);
        expect(parseCSV('   ')).toHaveLength(0);
    });

    it('parses phone-only CSV', () => {
        const csv = `+905321234567
+4915112345678
+33612345678`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(3);
        expect(result[0].phoneNumber).toBe('+905321234567');
        expect(result[0].name).toBeUndefined();
    });

    it('detects number header keyword', () => {
        const csv = `number,contact
+905321234567,Ali`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(1);
        expect(result[0].phoneNumber).toBe('+905321234567');
    });
});
