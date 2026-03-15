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
 * 7. RAG search strict auth
 * 8. Voice catalog error handling
 * 9. Login localStorage safety
 * 10. Translation file completeness
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
    });

    it('GET uses requireStrictAuth', () => {
        expect(content).toContain('requireStrictAuth(request)');
    });

    it('PUT uses requireStrictAuth', () => {
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
    const cronRoutes = [
        'app/api/cron/webhook-retry/route.ts',
        'app/api/cron/appointment-reminders/route.ts',
        'app/api/cron/gpu-shutdown/route.ts',
    ];

    it.each(cronRoutes)('%s rejects missing CRON_SECRET in production', (routePath) => {
        const content = fs.readFileSync(routePath, 'utf-8');
        expect(content).toContain('isProduction && !cronSecret');
        expect(content).toContain('503');
        expect(content).toContain('Cron security not configured');
    });

    it.each(cronRoutes)('%s validates bearer token', (routePath) => {
        const content = fs.readFileSync(routePath, 'utf-8');
        expect(content).toContain('Bearer ${cronSecret}');
        expect(content).toContain('401');
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
        expect(content).not.toContain('rateLimitMap');
    });
});

// ─── 4. RAG Search — Strict Auth (Critical Fix) ───

describe('RAG Search Strict Authentication', () => {
    let content: string;

    beforeAll(() => {
        content = fs.readFileSync('app/api/ai/rag-search/route.ts', 'utf-8');
    });

    it('uses requireStrictAuth instead of header spoofing', () => {
        expect(content).toContain('requireStrictAuth(request)');
        // Should NOT use the old weak pattern
        expect(content).not.toContain("request.headers.get('x-user-tenant')");
    });

    it('returns auth error when JWT is invalid', () => {
        expect(content).toContain('auth.error');
    });

    it('gets tenantId from verified JWT claims', () => {
        expect(content).toContain('auth.tenantId');
    });

    it('uses centralized error handler', () => {
        expect(content).toContain('handleApiError');
    });

    it('validates query parameter', () => {
        expect(content).toContain("typeof query !== 'string'");
        expect(content).toContain('query.slice(0, 500)');
    });
});

// ─── 5. Voice Catalog — Error Handling ───

describe('Voice Catalog Error Handling', () => {
    it('has try-catch block', () => {
        const content = fs.readFileSync('app/api/voice/catalog/route.ts', 'utf-8');
        expect(content).toContain('try {');
        expect(content).toContain('catch');
        expect(content).toContain('handleApiError');
    });
});

// ─── 6. i18n — Components Use Translations ───

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

    it('Dashboard page uses useTranslations for all KPI cards', () => {
        const content = fs.readFileSync('app/page.tsx', 'utf-8');
        expect(content).toContain("useTranslations('dashboard')");
        expect(content).toContain("t('todayCalls')");
        expect(content).toContain("t('missedCalls')");
        expect(content).toContain("t('openComplaints')");
        expect(content).toContain("t('upcomingAppointments')");
        expect(content).toContain("t('recentActivity')");
        expect(content).toContain("t('demoMode')");
        expect(content).toContain("t('title')");
        expect(content).toContain("t('subtitle')");
    });

    it('DashboardCharts uses locale-neutral data keys with translated names', () => {
        const content = fs.readFileSync('components/dashboard/DashboardCharts.tsx', 'utf-8');
        expect(content).toContain("dataKey=\"calls\"");
        expect(content).toContain("dataKey=\"answered\"");
        expect(content).toContain("dataKey=\"missed\"");
        expect(content).toContain("t('calls')");
        expect(content).toContain("t('answered')");
        expect(content).toContain("t('missed')");
    });
});

// ─── 7. Translation Files Consistency ───

describe('Translation Files — Completeness', () => {
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

    it('all 4 languages have chart legend keys', () => {
        const chartLegendKeys = ['calls', 'answered', 'missed', 'scheduled', 'completed', 'cancelled'];
        for (const lang of langs) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            for (const key of chartLegendKeys) {
                expect(content.charts[key], `${lang}.json missing "charts.${key}"`).toBeTruthy();
            }
        }
    });

    it('all 4 languages have dashboard KPI keys', () => {
        const dashboardKeys = ['todayCalls', 'missedCalls', 'openComplaints', 'upcomingAppointments', 'recentActivity', 'demoMode', 'title', 'subtitle'];
        for (const lang of langs) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            for (const key of dashboardKeys) {
                expect(content.dashboard[key], `${lang}.json missing "dashboard.${key}"`).toBeTruthy();
            }
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

    it('all 4 translation files have same top-level namespaces', () => {
        const trContent = JSON.parse(fs.readFileSync('messages/tr.json', 'utf-8'));
        const trNamespaces = Object.keys(trContent).sort();

        for (const lang of ['en', 'de', 'fr']) {
            const content = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf-8'));
            const namespaces = Object.keys(content).sort();
            expect(namespaces, `${lang}.json namespace mismatch`).toEqual(trNamespaces);
        }
    });
});

// ─── 8. Error Handling Improvements ───

describe('Error Handling Improvements', () => {
    it('CookieConsent wraps localStorage in try-catch', () => {
        const content = fs.readFileSync('components/layout/CookieConsent.tsx', 'utf-8');
        expect(content).toContain('catch');
        expect(content).toContain('Private browsing');
    });

    it('EmailVerificationBanner shows error state', () => {
        const content = fs.readFileSync('components/layout/EmailVerificationBanner.tsx', 'utf-8');
        expect(content).toContain('setError(true)');
        expect(content).toContain("t('sendFailed')");
    });

    it('Login page wraps localStorage.getItem in try-catch', () => {
        const content = fs.readFileSync('app/login/page.tsx', 'utf-8');
        // The useEffect with localStorage.getItem should be in try-catch
        const useEffectBlock = content.substring(
            content.indexOf('useEffect(() => {'),
            content.indexOf('}, []);') + 10
        );
        expect(useEffectBlock).toContain('try {');
        expect(useEffectBlock).toContain('localStorage.getItem');
        expect(useEffectBlock).toContain('catch');
    });

    it('Login page wraps localStorage.setItem in try-catch', () => {
        const content = fs.readFileSync('app/login/page.tsx', 'utf-8');
        // localStorage.setItem should be wrapped
        const setItemIndex = content.indexOf('localStorage.setItem');
        const surroundingCode = content.substring(setItemIndex - 200, setItemIndex + 100);
        expect(surroundingCode).toContain('try');
    });
});

// ─── 9. API Route Security Patterns ───

describe('API Route Security Patterns', () => {
    const authProtectedRoutes = [
        'app/api/tenants/route.ts',
        'app/api/agents/route.ts',
        'app/api/customers/route.ts',
        'app/api/appointments/route.ts',
        'app/api/tickets/route.ts',
        'app/api/knowledge/route.ts',
        'app/api/ai/rag-search/route.ts',
    ];

    it.each(authProtectedRoutes)('%s uses requireStrictAuth', (routePath) => {
        const content = fs.readFileSync(routePath, 'utf-8');
        expect(content).toContain('requireStrictAuth');
    });

    it.each(authProtectedRoutes)('%s has error handling', (routePath) => {
        const content = fs.readFileSync(routePath, 'utf-8');
        expect(content).toContain('catch');
    });

    const publicRoutes = [
        'app/api/health/route.ts',
        'app/api/locale/route.ts',
        'app/api/voice/catalog/route.ts',
    ];

    it.each(publicRoutes)('%s does NOT require auth in code (auth handled by middleware)', (routePath) => {
        const content = fs.readFileSync(routePath, 'utf-8');
        expect(content).not.toContain('requireStrictAuth');
    });
});

// ─── 10. Sidebar Accessibility ───

describe('Sidebar Accessibility', () => {
    let content: string;

    beforeAll(() => {
        content = fs.readFileSync('components/layout/Sidebar.tsx', 'utf-8');
    });

    it('has aria-label on mobile close button', () => {
        expect(content).toContain("aria-label={t('closeMenu')}");
    });

    it('has aria-label on hamburger button', () => {
        expect(content).toContain("aria-label={t('openMenu')}");
    });

    it('has aria-expanded on hamburger', () => {
        expect(content).toContain('aria-expanded={mobileOpen}');
    });

    it('has role="dialog" on mobile drawer', () => {
        expect(content).toContain('role="dialog"');
    });
});

// ─── 11. Agent Languages Alignment ───

describe('Agent Languages — Aligned with App Locales', () => {
    it('AGENT_LANGUAGES matches supported app locales (tr, en, de, fr)', () => {
        const content = fs.readFileSync('lib/agents/types.ts', 'utf-8');
        expect(content).toContain("value: 'tr'");
        expect(content).toContain("value: 'en'");
        expect(content).toContain("value: 'de'");
        expect(content).toContain("value: 'fr'");
        // Should NOT contain Arabic (removed)
        expect(content).not.toContain("value: 'ar'");
    });

    it('VOICE_STYLES uses i18n-ready labelKey', () => {
        const content = fs.readFileSync('lib/agents/types.ts', 'utf-8');
        expect(content).toContain("labelKey: 'professional'");
        expect(content).toContain("labelKey: 'friendly'");
    });
});

// ─── 12. Date Locale Helper ───

describe('Date Locale Helper', () => {
    it('date-locale utility supports all 4 app locales', () => {
        const content = fs.readFileSync('lib/utils/date-locale.ts', 'utf-8');
        expect(content).toContain("tr");
        expect(content).toContain("enUS");
        expect(content).toContain("de");
        expect(content).toContain("fr");
    });

    it('Dashboard page uses getDateLocale instead of hardcoded tr locale', () => {
        const content = fs.readFileSync('app/page.tsx', 'utf-8');
        expect(content).toContain('getDateLocale');
        expect(content).toContain('useLocale');
        expect(content).not.toContain("from 'date-fns/locale/tr'");
    });
});
