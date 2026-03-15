/**
 * Pre-Launch Critical Fixes — Verification Tests
 *
 * Tests for:
 * 1. Rate Limiting Enhancement (auth + tenant creation tiers)
 * 2. Recording Consent (KVKK/GDPR) in voice pipeline
 * 3. Environment Validation & Feature Status
 * 4. Empty State UI component
 * 5. Middleware rate limiting integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';

// ─── 1. Rate Limiting Enhancement ───

describe('Rate Limiting Enhancement', () => {
    let rateLimiterContent: string;

    beforeAll(() => {
        rateLimiterContent = fs.readFileSync('lib/utils/rate-limiter.ts', 'utf-8');
    });

    it('exports checkAuthLimit helper (5 req/min)', () => {
        expect(rateLimiterContent).toContain('export function checkAuthLimit');
        expect(rateLimiterContent).toContain('limit: 5');
        expect(rateLimiterContent).toContain("tier: 'auth'");
    });

    it('exports checkTenantCreationLimit helper (3 req/hour)', () => {
        expect(rateLimiterContent).toContain('export function checkTenantCreationLimit');
        expect(rateLimiterContent).toContain('limit: 3');
        expect(rateLimiterContent).toContain('windowSeconds: 3600');
        expect(rateLimiterContent).toContain("tier: 'tenant-create'");
    });

    it('maintains existing rate limit tiers', () => {
        expect(rateLimiterContent).toContain('checkGeneralLimit');
        expect(rateLimiterContent).toContain('checkSensitiveLimit');
        expect(rateLimiterContent).toContain('checkTenantLimit');
        expect(rateLimiterContent).toContain('checkInferenceLimit');
    });

    it('has Upstash Redis primary with in-memory fallback', () => {
        expect(rateLimiterContent).toContain('@upstash/ratelimit');
        expect(rateLimiterContent).toContain('@upstash/redis');
        expect(rateLimiterContent).toContain('memoryRateLimit');
    });
});

describe('Middleware Rate Limiting Integration', () => {
    let middlewareContent: string;

    beforeAll(() => {
        middlewareContent = fs.readFileSync('middleware.ts', 'utf-8');
    });

    it('imports auth and tenant creation rate limiters', () => {
        expect(middlewareContent).toContain('checkAuthLimit');
        expect(middlewareContent).toContain('checkTenantCreationLimit');
    });

    it('defines AUTH_RATE_LIMITED_PATHS for tenant creation', () => {
        expect(middlewareContent).toContain('AUTH_RATE_LIMITED_PATHS');
        expect(middlewareContent).toContain('/api/tenants');
    });

    it('applies tenant creation rate limit for POST requests', () => {
        expect(middlewareContent).toContain('checkTenantCreationLimit(ip)');
        expect(middlewareContent).toContain("req.method === 'POST'");
    });

    it('uses auth rate limit tier for auth paths', () => {
        expect(middlewareContent).toContain('checkAuthLimit(ip)');
        expect(middlewareContent).toContain('isAuthPath');
    });

    it('returns 429 with retry-after for rate-limited signup attempts', () => {
        expect(middlewareContent).toContain('Too many signup attempts');
    });

    it('maintains CORS, security headers, and locale detection', () => {
        expect(middlewareContent).toContain('SECURITY_HEADERS');
        expect(middlewareContent).toContain('ALLOWED_ORIGINS');
        expect(middlewareContent).toContain('detectBrowserLocale');
        expect(middlewareContent).toContain('NEXT_LOCALE');
    });
});

// ─── 2. Recording Consent (KVKK/GDPR) ───

describe('Recording Consent (KVKK/GDPR)', () => {
    let incomingContent: string;

    beforeAll(() => {
        incomingContent = fs.readFileSync('app/api/twilio/incoming/route.ts', 'utf-8');
    });

    it('has RECORDING_CONSENT_MESSAGES for all 4 languages', () => {
        expect(incomingContent).toContain('RECORDING_CONSENT_MESSAGES');
        expect(incomingContent).toContain('kalite ve eğitim'); // Turkish
        expect(incomingContent).toContain('quality and training'); // English
        expect(incomingContent).toContain('Qualitäts- und Schulungszwecken'); // German
        expect(incomingContent).toContain('qualité et de formation'); // French
    });

    it('prepends consent message when recording is enabled', () => {
        expect(incomingContent).toContain('consentPrefix');
        expect(incomingContent).toContain('RECORDING_CONSENT_MESSAGES[resolvedLang]');
        expect(incomingContent).toContain('fullGreeting');
    });

    it('uses fullGreeting for TTS synthesis', () => {
        expect(incomingContent).toContain('synthesizeCartesiaTTS(fullGreeting');
    });

    it('uses fullGreeting in TwiML generation', () => {
        expect(incomingContent).toContain('message: fullGreeting');
    });

    it('only adds consent when callRecording is true', () => {
        expect(incomingContent).toContain("recordCall ? RECORDING_CONSENT_MESSAGES");
    });

    it('has empty string prefix when recording is disabled', () => {
        expect(incomingContent).toContain(": ''");
    });
});

// ─── 3. Environment Validation & Feature Status ───

describe('Environment Validation', () => {
    let envContent: string;

    beforeAll(() => {
        envContent = fs.readFileSync('lib/env.ts', 'utf-8');
    });

    it('has Zod schema validation', () => {
        expect(envContent).toContain('import { z }');
        expect(envContent).toContain('envSchema');
        expect(envContent).toContain('z.object');
    });

    it('validates required Firebase keys', () => {
        expect(envContent).toContain('NEXT_PUBLIC_FIREBASE_API_KEY');
        expect(envContent).toContain('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
        expect(envContent).toContain('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    });

    it('exports warnMissingOptionalKeys', () => {
        expect(envContent).toContain('export function warnMissingOptionalKeys');
    });

    it('exports getFeatureStatus function', () => {
        expect(envContent).toContain('export function getFeatureStatus');
        expect(envContent).toContain('FeatureStatus[]');
    });

    it('checks all critical service features', () => {
        expect(envContent).toContain('Voice Pipeline (STT)');
        expect(envContent).toContain('Voice Pipeline (TTS)');
        expect(envContent).toContain('LLM (Primary)');
        expect(envContent).toContain('Telephony');
        expect(envContent).toContain('Billing');
        expect(envContent).toContain('Email');
        expect(envContent).toContain('Error Tracking');
        expect(envContent).toContain('Distributed Cache');
        expect(envContent).toContain('Embeddings');
        expect(envContent).toContain('Cron Security');
    });

    it('returns ready/detail for each feature', () => {
        expect(envContent).toContain('ready:');
        expect(envContent).toContain('detail:');
    });
});

describe('Health Endpoint Feature Status', () => {
    let healthContent: string;

    beforeAll(() => {
        healthContent = fs.readFileSync('app/api/health/route.ts', 'utf-8');
    });

    it('imports getFeatureStatus from env', () => {
        expect(healthContent).toContain('getFeatureStatus');
    });

    it('includes features in health response', () => {
        expect(healthContent).toContain('features:');
        expect(healthContent).toContain('getFeatureStatus()');
    });

    it('has circuit breaker states in response', () => {
        expect(healthContent).toContain('circuitBreakers');
    });
});

// ─── 4. Empty State UI Component ───

describe('EmptyState UI Component', () => {
    let emptyStateContent: string;

    beforeAll(() => {
        emptyStateContent = fs.readFileSync('components/ui/empty-state.tsx', 'utf-8');
    });

    it('exports EmptyState component', () => {
        expect(emptyStateContent).toContain('export function EmptyState');
    });

    it('accepts icon, title, description props', () => {
        expect(emptyStateContent).toContain('icon: LucideIcon');
        expect(emptyStateContent).toContain('title: string');
        expect(emptyStateContent).toContain('description: string');
    });

    it('has optional action with label and onClick', () => {
        expect(emptyStateContent).toContain('action?:');
        expect(emptyStateContent).toContain('label: string');
        expect(emptyStateContent).toContain('onClick: () => void');
    });

    it('supports custom icon colors and backgrounds', () => {
        expect(emptyStateContent).toContain('iconColor?:');
        expect(emptyStateContent).toContain('iconBg?:');
    });

    it('renders Button component for action', () => {
        expect(emptyStateContent).toContain('<Button');
        expect(emptyStateContent).toContain('action.onClick');
    });
});

// ─── 5. Existing Empty States in Pages ───

describe('Page Empty States', () => {
    it('customers page has empty state for no data (i18n)', () => {
        const content = fs.readFileSync('app/customers/page.tsx', 'utf-8');
        expect(content).toContain("t('noCustomersYet')");
    });

    it('calls page has empty state for no calls (i18n)', () => {
        const content = fs.readFileSync('app/calls/page.tsx', 'utf-8');
        expect(content).toContain("t('noCallsTitle')");
    });

    it('appointments page has empty state (i18n)', () => {
        const content = fs.readFileSync('app/appointments/page.tsx', 'utf-8');
        expect(content).toContain("t('noAppointmentsTitle')");
        expect(content).toContain("t('newAppointment')");
    });

    it('knowledge page has empty state for no documents (i18n)', () => {
        const content = fs.readFileSync('app/knowledge/page.tsx', 'utf-8');
        expect(content).toContain("t('noSourcesYet')");
        expect(content).toContain("t('addFirstSource')");
    });

    it('customers page has search-aware empty state (i18n)', () => {
        const content = fs.readFileSync('app/customers/page.tsx', 'utf-8');
        expect(content).toContain("t('noCustomersFound')");
    });

    it('calls page has filter-aware empty state (i18n)', () => {
        const content = fs.readFileSync('app/calls/page.tsx', 'utf-8');
        expect(content).toContain("t('noResultsTitle')");
        expect(content).toContain("t('clearFilters')");
    });
});

// ─── 6. Tenant API Validation ───

describe('Tenant API Security', () => {
    let tenantContent: string;

    beforeAll(() => {
        tenantContent = fs.readFileSync('app/api/tenants/route.ts', 'utf-8');
    });

    it('validates language field against allowlist', () => {
        expect(tenantContent).toContain('VALID_LANGUAGES');
        expect(tenantContent).toContain("'tr', 'en', 'de', 'fr', 'tr-en'");
    });

    it('requires companyName field', () => {
        expect(tenantContent).toContain("requireFields(body, ['companyName'])");
    });

    it('requires strict auth for POST (Firebase Admin SDK verification)', () => {
        expect(tenantContent).toContain('requireStrictAuth(request)');
    });

    it('has tenant isolation on GET and PUT', () => {
        expect(tenantContent).toContain('Başka tenant verilerine erişim engellendi');
    });

    it('uses allowlist for update fields', () => {
        expect(tenantContent).toContain('ALLOWED_UPDATE_FIELDS');
    });

    it('has language-aware default agents for all 4 languages', () => {
        expect(tenantContent).toContain("case 'en':");
        expect(tenantContent).toContain("case 'de':");
        expect(tenantContent).toContain("case 'fr':");
        expect(tenantContent).toContain('Kundenberater');
        expect(tenantContent).toContain('Conseiller clientèle');
    });

    it('validates companyName length (max 100)', () => {
        expect(tenantContent).toContain('companyName.length > 100');
    });

    it('validates sector length (max 50)', () => {
        expect(tenantContent).toContain('sector.length > 50');
    });

    it('sanitizes companyName against XSS', () => {
        expect(tenantContent).toContain('replace(/<[^>]*>/g');
        expect(tenantContent).toContain('sanitizedCompanyName');
    });
});

// ─── 7. UX Improvements ───

describe('CookieConsent localStorage Error Handling', () => {
    let content: string;

    beforeAll(() => {
        content = fs.readFileSync('components/layout/CookieConsent.tsx', 'utf-8');
    });

    it('has try-catch around localStorage.getItem', () => {
        expect(content).toContain('try {');
        expect(content).toContain('localStorage.getItem(STORAGE_KEY)');
        expect(content).toContain('catch');
    });

    it('has try-catch around localStorage.setItem', () => {
        expect(content).toContain('localStorage.setItem(STORAGE_KEY, value)');
        // The setItem should also be wrapped in try-catch
        const setItemIndex = content.indexOf('localStorage.setItem');
        const surroundingCode = content.substring(setItemIndex - 100, setItemIndex + 200);
        expect(surroundingCode).toContain('try');
    });
});

describe('EmailVerificationBanner Error Feedback', () => {
    let content: string;

    beforeAll(() => {
        content = fs.readFileSync('components/layout/EmailVerificationBanner.tsx', 'utf-8');
    });

    it('has error state for failed resend', () => {
        expect(content).toContain('setError(true)');
        expect(content).toContain('setError(false)');
    });

    it('shows error message to user', () => {
        expect(content).toContain('Gönderilemedi');
    });

    it('clears error after timeout for retry', () => {
        expect(content).toContain('setTimeout(() => setError(false)');
    });
});

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

    it('has aria-modal on mobile drawer', () => {
        expect(content).toContain('aria-modal={mobileOpen}');
    });
});

describe('i18n closeMenu Translation', () => {
    it('has closeMenu in Turkish', () => {
        const content = fs.readFileSync('messages/tr.json', 'utf-8');
        expect(content).toContain('"closeMenu"');
    });

    it('has closeMenu in English', () => {
        const content = fs.readFileSync('messages/en.json', 'utf-8');
        expect(content).toContain('"closeMenu"');
    });

    it('has closeMenu in German', () => {
        const content = fs.readFileSync('messages/de.json', 'utf-8');
        expect(content).toContain('"closeMenu"');
    });

    it('has closeMenu in French', () => {
        const content = fs.readFileSync('messages/fr.json', 'utf-8');
        expect(content).toContain('"closeMenu"');
    });
});
