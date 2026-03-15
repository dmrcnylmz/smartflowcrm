/**
 * Tests for Pricing Page, i18n pricing namespace, and middleware error messages.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Pricing Page', () => {
    const pricingPagePath = path.join(ROOT, 'app/pricing/page.tsx');
    const pricingPageContent = fs.readFileSync(pricingPagePath, 'utf-8');

    it('pricing page file exists', () => {
        expect(fs.existsSync(pricingPagePath)).toBe(true);
    });

    it('imports PLANS from lemonsqueezy', () => {
        expect(pricingPageContent).toContain("from '@/lib/billing/lemonsqueezy'");
        expect(pricingPageContent).toContain('PLANS');
    });

    it('imports formatPrice from currency', () => {
        expect(pricingPageContent).toContain("from '@/lib/billing/currency'");
        expect(pricingPageContent).toContain('formatPrice');
    });

    it("uses useTranslations('pricing')", () => {
        expect(pricingPageContent).toContain("useTranslations('pricing')");
    });

    it('is a client component', () => {
        expect(pricingPageContent).toContain("'use client'");
    });

    it('uses useLocale for currency defaults', () => {
        expect(pricingPageContent).toContain('useLocale');
    });

    it('renders plan cards for all 3 plans', () => {
        expect(pricingPageContent).toContain('starter');
        expect(pricingPageContent).toContain('professional');
        expect(pricingPageContent).toContain('enterprise');
    });

    it('has billing interval toggle (monthly/yearly)', () => {
        expect(pricingPageContent).toContain("'monthly'");
        expect(pricingPageContent).toContain("'yearly'");
        expect(pricingPageContent).toContain("setInterval");
    });

    it('has currency selector', () => {
        expect(pricingPageContent).toContain('SUPPORTED_CURRENCIES');
        expect(pricingPageContent).toContain('setCurrency');
    });

    it('highlights professional plan as most popular', () => {
        expect(pricingPageContent).toContain('mostPopular');
        expect(pricingPageContent).toContain('isProfessional');
    });

    it('has FAQ section', () => {
        expect(pricingPageContent).toContain('faqTitle');
        expect(pricingPageContent).toContain('faq1q');
        expect(pricingPageContent).toContain('faq1a');
    });
});

describe('i18n - pricing namespace', () => {
    const languages = ['tr', 'en', 'de', 'fr'];
    const requiredKeys = [
        'title', 'subtitle', 'monthly', 'yearly',
        'perMonth', 'perYear', 'savings', 'getStarted',
        'mostPopular', 'enterprise', 'contactUs',
        'faqTitle', 'faq1q', 'faq1a', 'faq2q', 'faq2a',
        'faq3q', 'faq3a', 'faq4q', 'faq4a',
        'includedFeatures', 'allPlansInclude',
    ];

    for (const lang of languages) {
        it(`${lang}.json has pricing namespace with all ${requiredKeys.length} keys`, () => {
            const msgPath = path.join(ROOT, `messages/${lang}.json`);
            const messages = JSON.parse(fs.readFileSync(msgPath, 'utf-8'));
            expect(messages.pricing).toBeDefined();

            for (const key of requiredKeys) {
                expect(messages.pricing[key], `Missing key: pricing.${key} in ${lang}.json`).toBeDefined();
                expect(typeof messages.pricing[key]).toBe('string');
                expect(messages.pricing[key].length).toBeGreaterThan(0);
            }

            // At least 15 keys
            expect(Object.keys(messages.pricing).length).toBeGreaterThanOrEqual(15);
        });
    }
});

describe('Middleware error messages', () => {
    const middlewarePath = path.join(ROOT, 'middleware.ts');
    const middlewareContent = fs.readFileSync(middlewarePath, 'utf-8');

    // Extract only JSON response message strings (inside message: '...' patterns)
    const messageMatches = middlewareContent.match(/message:\s*['"`]([^'"`]+)['"`]/g) || [];
    const messages = messageMatches.map(m => {
        const match = m.match(/message:\s*['"`]([^'"`]+)['"`]/);
        return match ? match[1] : '';
    }).filter(Boolean);

    it('has no Turkish strings in error responses', () => {
        const turkishPatterns = [
            'fazla istek',
            'kimlik doğrulaması',
            'Geçersiz kimlik',
            'istek limiti aşıldı',
            'Lütfen bekleyin',
            'Bu endpoint',
            'Bu hesap',
        ];

        for (const pattern of turkishPatterns) {
            expect(middlewareContent).not.toContain(pattern);
        }
    });

    it('error messages are in English', () => {
        // All extracted messages should contain only ASCII characters (English)
        for (const msg of messages) {
            // Allow result.error fallback which is dynamic
            if (msg.includes('result.error')) continue;
            // Check that the message doesn't contain Turkish special chars
            expect(msg).not.toMatch(/[çğıöşüÇĞİÖŞÜ]/);
        }
    });

    it('rate limit responses use English messages', () => {
        expect(middlewareContent).toContain("'Too many requests. Please wait.'");
    });

    it('auth error responses use English messages', () => {
        expect(middlewareContent).toContain("'Authentication is required for this endpoint.'");
        expect(middlewareContent).toContain("'Invalid credentials.'");
    });

    it('tenant rate limit uses English message', () => {
        expect(middlewareContent).toContain("'Tenant rate limit exceeded. Please wait.'");
    });

    it('pricing page is in PUBLIC_PAGE_PATHS', () => {
        expect(middlewareContent).toContain("'/pricing'");
    });
});
