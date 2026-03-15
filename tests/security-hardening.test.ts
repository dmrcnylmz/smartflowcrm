/**
 * Security Hardening Tests
 *
 * Verifies:
 * 1. Tenant API uses strict auth (Firebase Admin SDK, not header spoofing)
 * 2. Cron endpoints reject unauthenticated requests in production
 * 3. Public endpoints have rate limiting
 * 4. Input validation (XSS, length limits)
 * 5. i18n components use useTranslations
 * 6. Accessibility aria-labels
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';

// ─── 1. Tenant API — Strict Auth ───

describe('Tenant API Strict Authentication', () => {
    let content: string;

    beforeAll(() => {
        content = fs.readFileSync('app/api/tenants/route.ts', 'utf-8');
    });

    it('POST uses requireStrictAuth (not weak requireAuth)', () => {
        expect(content).toContain('requireStrictAuth(request)');
        // The old weak pattern should NOT be in POST handler
        // requireStrictAuth is the correct pattern used in GET and PUT
    });

    it('GET uses requireStrictAuth', () => {
        expect(content).toContain('requireStrictAuth(request)');
    });

    it('PUT uses requireStrictAuth', () => {
        // Both GET and PUT already used it, verify it's still there
        const strictAuthCount = (content.match(/requireStrictAuth/g) || []).length;
        expect(strictAuthCount).toBeGreaterThanOrEqual(3); // POST + GET + PUT
    });

    it('has input length validation for companyName', () => {
        expect(content).toContain('companyName.length > 100');
    });

    it('has input length validation for sector', () => {
        expect(content).toContain('sector.length > 50');
    });

    it('strips HTML tags from companyName (XSS prevention)', () => {
        expect(content).toContain('sanitizedCompanyName');
        expect(content).toContain('replace(/<[^>]*>/g');
    });

    it('uses sanitized company name in tenant data', () => {
        expect(content).toContain('companyName: sanitizedCompanyName');
    });
});

// ─── 2. Cron Endpoints — Secret Validation ───

describe('Cron Endpoint Security', () => {
    it('webhook-retry rejects missing CRON_SECRET in production', () => {
        const content = fs.readFileSync('app/api/cron/webhook-retry/route.ts', 'utf-8');
        expect(content).toContain('isProduction && !cronSecret');
        expect(content).toContain('503');
        expect(content).toContain('Cron security not configured');
    });

    it('webhook-retry validates bearer token', () => {
        const content = fs.readFileSync('app/api/cron/webhook-retry/route.ts', 'utf-8');
        expect(content).toContain('Bearer ${cronSecret}');
        expect(content).toContain('401');
    });

    it('appointment-reminders rejects missing CRON_SECRET in production', () => {
        const content = fs.readFileSync('app/api/cron/appointment-reminders/route.ts', 'utf-8');
        expect(content).toContain('isProduction && !cronSecret');
        expect(content).toContain('503');
    });

    it('appointment-reminders validates bearer token', () => {
        const content = fs.readFileSync('app/api/cron/appointment-reminders/route.ts', 'utf-8');
        expect(content).toContain('Bearer ${cronSecret}');
    });
});

// ─── 3. Public Endpoint Rate Limiting ───

describe('Public Endpoint Rate Limiting', () => {
    it('/api/leads has rate limiting', () => {
        const content = fs.readFileSync('app/api/leads/route.ts', 'utf-8');
        expect(content).toContain('checkSensitiveLimit');
        expect(content).toContain('rateResult.success');
        expect(content).toContain('429');
    });

    it('/api/leads validates email format', () => {
        const content = fs.readFileSync('app/api/leads/route.ts', 'utf-8');
        expect(content).toContain('isValidEmail');
    });

    it('/api/chat/support uses distributed rate limiter', () => {
        const content = fs.readFileSync('app/api/chat/support/route.ts', 'utf-8');
        expect(content).toContain('checkSensitiveLimit');
        // Should NOT have in-memory rateLimitMap anymore
        expect(content).not.toContain('rateLimitMap');
    });
});

// ─── 4. i18n — Components Use Translations ───

describe('i18n Component Integration', () => {
    it('AuthGuard uses useTranslations for loading text', () => {
        const content = fs.readFileSync('components/auth/AuthGuard.tsx', 'utf-8');
        expect(content).toContain("useTranslations('common')");
        expect(content).toContain("t('loading')");
    });

    it('ClientLayout uses useTranslations for skip-to-content', () => {
        const content = fs.readFileSync('components/layout/ClientLayout.tsx', 'utf-8');
        expect(content).toContain("useTranslations('common')");
        expect(content).toContain("t('skipToContent')");
    });

    it('DashboardCharts uses useTranslations for chart titles', () => {
        const content = fs.readFileSync('components/dashboard/DashboardCharts.tsx', 'utf-8');
        expect(content).toContain("useTranslations('charts')");
        expect(content).toContain("t('callTrend')");
        expect(content).toContain("t('complaintCategories')");
        expect(content).toContain("t('appointmentStatuses')");
    });

    it('LoginPage uses useTranslations for all user-facing text', () => {
        const content = fs.readFileSync('app/login/page.tsx', 'utf-8');
        expect(content).toContain("useTranslations('auth')");
        expect(content).toContain("t('login')");
        expect(content).toContain("t('register')");
        expect(content).toContain("t('email')");
        expect(content).toContain("t('password')");
        expect(content).toContain("t('rememberMe')");
        expect(content).toContain("t('forgotPassword')");
        expect(content).toContain("t('loginWithGoogle')");
        expect(content).toContain("t('resetPassword')");
        expect(content).toContain("t('platformSubtitle')");
        expect(content).toContain("t('fillAllFields')");
        expect(content).toContain("t('passwordsDoNotMatch')");
    });
});

// ─── 5. Translation Files Consistency ───

describe('Translation Files — New Keys', () => {
    const langs = ['tr', 'en', 'de', 'fr'];

    it('all 4 languages have "charts" namespace', () => {
        for (const lang of langs) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            expect(content.charts, `${lang}.json missing "charts"`).toBeDefined();
            expect(content.charts.callTrend, `${lang}.json missing "charts.callTrend"`).toBeTruthy();
            expect(content.charts.complaintCategories, `${lang}.json missing "charts.complaintCategories"`).toBeTruthy();
            expect(content.charts.appointmentStatuses, `${lang}.json missing "charts.appointmentStatuses"`).toBeTruthy();
        }
    });

    it('all 4 languages have "closeMenu" in nav', () => {
        for (const lang of langs) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            expect(content.nav.closeMenu, `${lang}.json missing "nav.closeMenu"`).toBeTruthy();
        }
    });

    it('all 4 languages have "common" namespace with key fields', () => {
        for (const lang of langs) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            expect(content.common, `${lang}.json missing "common"`).toBeDefined();
        }
    });

    it('all 4 languages have auth login page keys', () => {
        const requiredKeys = ['login', 'register', 'fullName', 'confirmPassword', 'rememberMe', 'forgotPassword', 'loginWithGoogle', 'resetPassword', 'platformSubtitle', 'emailPlaceholder', 'passwordVeryWeak', 'passwordStrong'];
        for (const lang of langs) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            for (const key of requiredKeys) {
                expect(content.auth[key], `${lang}.json missing "auth.${key}"`).toBeTruthy();
            }
        }
    });
});

// ─── 6. Error Handling Improvements ───

describe('Error Handling Improvements', () => {
    it('CookieConsent wraps localStorage in try-catch', () => {
        const content = fs.readFileSync('components/layout/CookieConsent.tsx', 'utf-8');
        // Both getItem and setItem should be wrapped
        expect(content).toContain('catch');
        expect(content).toContain('Private browsing');
    });

    it('EmailVerificationBanner shows error state', () => {
        const content = fs.readFileSync('components/layout/EmailVerificationBanner.tsx', 'utf-8');
        expect(content).toContain('setError(true)');
        expect(content).toContain('Gönderilemedi');
    });
});
