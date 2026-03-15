/**
 * Outbound UI Tests
 *
 * Tests for:
 * - OutboundCallModal component exists and uses useTranslations
 * - ComplianceStatusBadge component exists
 * - CompliancePreflightCard component exists
 * - Calls page imports OutboundCallModal and has trigger button
 * - Sidebar has campaigns link
 * - i18n: all new call keys in 4 languages
 * - i18n: campaigns nav key in 4 languages
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relativePath: string): string {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

function readJson(relativePath: string): Record<string, unknown> {
    return JSON.parse(readFile(relativePath));
}

// =============================================
// Component Existence Tests
// =============================================

describe('Outbound UI — Component Files', () => {
    it('OutboundCallModal component file exists and exports default', () => {
        const filePath = path.join(ROOT, 'components/calls/OutboundCallModal.tsx');
        expect(fs.existsSync(filePath)).toBe(true);

        const content = readFile('components/calls/OutboundCallModal.tsx');
        expect(content).toContain('export default');
    });

    it('OutboundCallModal uses useTranslations(\'calls\')', () => {
        const content = readFile('components/calls/OutboundCallModal.tsx');
        expect(content).toContain("useTranslations('calls')");
    });

    it('ComplianceStatusBadge component file exists', () => {
        const filePath = path.join(ROOT, 'components/compliance/ComplianceStatusBadge.tsx');
        expect(fs.existsSync(filePath)).toBe(true);

        const content = readFile('components/compliance/ComplianceStatusBadge.tsx');
        expect(content).toContain('export default');
    });

    it('CompliancePreflightCard component file exists', () => {
        const filePath = path.join(ROOT, 'components/compliance/CompliancePreflightCard.tsx');
        expect(fs.existsSync(filePath)).toBe(true);

        const content = readFile('components/compliance/CompliancePreflightCard.tsx');
        expect(content).toContain('export default');
    });
});

// =============================================
// Calls Page Integration Tests
// =============================================

describe('Outbound UI — Calls Page Integration', () => {
    const callsPage = readFile('app/calls/page.tsx');

    it('Calls page imports OutboundCallModal', () => {
        expect(callsPage).toContain('OutboundCallModal');
        expect(callsPage).toContain("from '@/components/calls/OutboundCallModal'");
    });

    it('Calls page has outbound call button/trigger', () => {
        expect(callsPage).toContain('showOutboundModal');
        expect(callsPage).toContain('setShowOutboundModal');
        expect(callsPage).toContain("t('newCall')");
    });

    it('Calls page renders OutboundCallModal with isOpen/onClose', () => {
        expect(callsPage).toContain('<OutboundCallModal');
        expect(callsPage).toContain('isOpen={showOutboundModal}');
        expect(callsPage).toContain('onClose={');
    });
});

// =============================================
// Sidebar Navigation Tests
// =============================================

describe('Outbound UI — Sidebar Navigation', () => {
    const sidebar = readFile('components/layout/Sidebar.tsx');

    it('Sidebar has campaigns link pointing to /campaigns', () => {
        expect(sidebar).toContain("'/campaigns'");
        expect(sidebar).toContain("'campaigns'");
    });

    it('Sidebar uses Megaphone icon for campaigns', () => {
        expect(sidebar).toContain('Megaphone');
    });

    it('Campaigns link is positioned after Calls', () => {
        const callsIdx = sidebar.indexOf("labelKey: 'calls'");
        const campaignsIdx = sidebar.indexOf("labelKey: 'campaigns'");
        expect(callsIdx).toBeGreaterThan(-1);
        expect(campaignsIdx).toBeGreaterThan(-1);
        expect(campaignsIdx).toBeGreaterThan(callsIdx);
    });
});

// =============================================
// i18n Tests — Calls Namespace
// =============================================

const CALL_KEYS = [
    'newCall',
    'initiateCall',
    'callNotes',
    'preflightCheck',
    'checking',
    'callable',
    'notCallable',
    'scheduleAt',
    'localTime',
    'destinationCountry',
    'callStarted',
    'callFailed',
] as const;

const LANGUAGES = ['tr', 'en', 'de', 'fr'] as const;

describe('Outbound UI — i18n Calls Keys', () => {
    for (const lang of LANGUAGES) {
        describe(`${lang}.json`, () => {
            const messages = readJson(`messages/${lang}.json`) as Record<string, Record<string, string>>;

            for (const key of CALL_KEYS) {
                it(`has calls.${key}`, () => {
                    expect(messages.calls).toBeDefined();
                    expect(messages.calls[key]).toBeDefined();
                    expect(typeof messages.calls[key]).toBe('string');
                    expect(messages.calls[key].length).toBeGreaterThan(0);
                });
            }
        });
    }
});

// =============================================
// i18n Tests — Nav Campaigns Key
// =============================================

describe('Outbound UI — i18n Nav Campaigns Key', () => {
    for (const lang of LANGUAGES) {
        it(`${lang}.json has nav.campaigns`, () => {
            const messages = readJson(`messages/${lang}.json`) as Record<string, Record<string, string>>;
            expect(messages.nav).toBeDefined();
            expect(messages.nav.campaigns).toBeDefined();
            expect(typeof messages.nav.campaigns).toBe('string');
            expect(messages.nav.campaigns.length).toBeGreaterThan(0);
        });
    }
});
