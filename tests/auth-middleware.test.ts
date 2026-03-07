/**
 * Auth Middleware Test Suite
 *
 * Tests for:
 * - Rate limiting (per-IP and per-tenant)
 * - Protected route auth enforcement
 * - Public route bypass
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - CORS origin validation
 * - Tenant header forwarding from JWT claims
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock token-verify BEFORE importing middleware ---

const mockVerifyToken = vi.fn();
const mockExtractBearerToken = vi.fn();

vi.mock('@/lib/auth/token-verify', () => ({
    verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
    extractBearerToken: (...args: unknown[]) => mockExtractBearerToken(...args),
}));

// --- Import middleware after mocks are set ---

import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

// --- Helpers ---

/** Create a NextRequest for testing */
function createRequest(
    path: string,
    options?: {
        method?: string;
        headers?: Record<string, string>;
        ip?: string;
    },
): NextRequest {
    const { method = 'GET', headers = {}, ip } = options || {};
    const url = new URL(path, 'http://localhost:3000');

    const allHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
    };

    // Simulate client IP via x-forwarded-for
    if (ip) {
        allHeaders['x-forwarded-for'] = ip;
    }

    return new NextRequest(url, {
        method,
        headers: allHeaders,
    });
}

/** Build a fake JWT token with a given payload */
function buildFakeToken(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    const sig = 'fakesig';
    return `${header}.${body}.${sig}`;
}

// --- Setup ---

beforeEach(() => {
    vi.clearAllMocks();

    // Default: extractBearerToken returns the token after "Bearer "
    mockExtractBearerToken.mockImplementation((header: string | null) => {
        if (!header || !header.startsWith('Bearer ')) return null;
        const token = header.slice(7).trim();
        return token.length > 0 ? token : null;
    });

    // Default: verifyToken returns invalid (tests override as needed)
    mockVerifyToken.mockResolvedValue({ valid: false, error: 'No token' });
});

// ============================================
// 1. Rate Limiting
// ============================================

describe('Rate Limiting', () => {
    it('allows requests within the rate limit', async () => {
        // Use a unique IP to avoid collision with other tests
        const ip = '10.0.0.1';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        expect(response.status).toBe(200);
        expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });

    it('returns 429 when rate limit is exceeded for general API routes', async () => {
        const ip = '10.99.99.99';
        let response;

        // Send 101 requests (limit is 100/min for general)
        for (let i = 0; i < 101; i++) {
            const req = createRequest('/api/health', { ip });
            response = await middleware(req);
        }

        expect(response!.status).toBe(429);
        const body = await response!.json();
        expect(body.error).toBe('Rate limit exceeded');
        expect(response!.headers.get('Retry-After')).toBeDefined();
        expect(response!.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('applies stricter rate limit (10/min) to sensitive paths', async () => {
        const ip = '10.88.88.88';
        let response;

        // Sensitive path: /api/voice/connect
        // This is a protected route, so mock valid auth
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: { uid: 'user-1', sub: 'user-1', email: 'test@test.com' },
        });

        for (let i = 0; i < 11; i++) {
            const req = createRequest('/api/voice/connect', {
                ip,
                headers: { Authorization: 'Bearer valid-token' },
            });
            response = await middleware(req);
        }

        expect(response!.status).toBe(429);
    });

    it('includes rate limit headers on successful responses', async () => {
        const ip = '10.0.0.5';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
        expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
        expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
});

// ============================================
// 2. Protected Routes
// ============================================

describe('Protected Routes', () => {
    it('returns 401 when no Authorization header is provided on protected route', async () => {
        const ip = '10.1.1.1';
        const req = createRequest('/api/contacts', { ip });
        const response = await middleware(req);

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when token is invalid', async () => {
        const ip = '10.1.1.2';
        mockVerifyToken.mockResolvedValue({ valid: false, error: 'Token expired' });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer expired-token' },
        });
        const response = await middleware(req);

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toBe('Unauthorized');
    });

    it('allows access with a valid token on protected route', async () => {
        const ip = '10.1.1.3';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: {
                uid: 'user-123',
                sub: 'user-123',
                email: 'user@example.com',
            },
        });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await middleware(req);

        expect(response.status).toBe(200);
    });

    it('forwards user UID header on authenticated request', async () => {
        const ip = '10.1.1.4';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: {
                uid: 'user-456',
                sub: 'user-456',
                email: 'user@callception.com',
            },
        });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await middleware(req);

        expect(response.headers.get('x-user-uid')).toBe('user-456');
        expect(response.headers.get('x-user-email')).toBe('user@callception.com');
    });

    it('returns 401 when Authorization header has no Bearer prefix', async () => {
        const ip = '10.1.1.5';
        // extractBearerToken will return null for non-Bearer headers
        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Basic abc123' },
        });
        const response = await middleware(req);

        expect(response.status).toBe(401);
    });
});

// ============================================
// 3. Public Routes
// ============================================

describe('Public Routes', () => {
    const publicPaths = [
        '/api/webhook',
        '/api/health',
        '/api/voice/health',
        '/api/ai/status',
        '/api/twilio/incoming',
        '/api/twilio/status',
        '/api/twilio/gather',
        '/api/twilio/recording',
        '/api/billing/webhook',
        '/api/cron/appointment-reminders',
        '/api/voice/test-e2e',
        '/api/voice/infer',
        '/api/voice/tts',
        '/api/voice/stt',
        '/api/twilio/test',
        '/api/billing/alert-test',
        '/api/system/go-live-check',
    ];

    it.each(publicPaths)(
        'allows unauthenticated access to %s',
        async (path) => {
            // Use unique IP per path to avoid rate limit collisions
            const ip = `10.2.${publicPaths.indexOf(path)}.1`;
            const req = createRequest(path, { ip });
            const response = await middleware(req);

            expect(response.status).not.toBe(401);
        },
    );

    it('allows subpaths of public routes without auth', async () => {
        const ip = '10.2.100.1';
        const req = createRequest('/api/webhook/stripe', { ip });
        const response = await middleware(req);

        expect(response.status).not.toBe(401);
    });
});

// ============================================
// 4. Security Headers
// ============================================

describe('Security Headers', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
        const ip = '10.3.0.1';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('sets X-Frame-Options: DENY', async () => {
        const ip = '10.3.0.2';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('sets X-XSS-Protection header', async () => {
        const ip = '10.3.0.3';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('sets Referrer-Policy header', async () => {
        const ip = '10.3.0.4';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        expect(response.headers.get('Referrer-Policy')).toBe(
            'strict-origin-when-cross-origin',
        );
    });

    it('sets Permissions-Policy header', async () => {
        const ip = '10.3.0.5';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        const pp = response.headers.get('Permissions-Policy');
        expect(pp).toContain('camera=()');
        expect(pp).toContain('microphone=(self)');
    });

    it('sets Content-Security-Policy header', async () => {
        const ip = '10.3.0.6';
        const req = createRequest('/api/health', { ip });
        const response = await middleware(req);

        const csp = response.headers.get('Content-Security-Policy');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
    });

    it('includes security headers on authenticated API responses', async () => {
        const ip = '10.3.0.7';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: { uid: 'u1', sub: 'u1' },
        });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await middleware(req);

        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
});

// ============================================
// 5. CORS
// ============================================

describe('CORS', () => {
    it('returns 204 with CORS headers on OPTIONS preflight', async () => {
        const req = createRequest('/api/contacts', {
            method: 'OPTIONS',
            headers: {
                origin: 'http://localhost:3000',
            },
            ip: '10.4.0.1',
        });
        const response = await middleware(req);

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
        expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });

    it('sets correct origin for allowed localhost origins in non-production', async () => {
        const req = createRequest('/api/contacts', {
            method: 'OPTIONS',
            headers: {
                origin: 'http://localhost:3000',
            },
            ip: '10.4.0.2',
        });
        const response = await middleware(req);

        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
            'http://localhost:3000',
        );
    });

    it('sets correct origin for callception.com', async () => {
        const req = createRequest('/api/contacts', {
            method: 'OPTIONS',
            headers: {
                origin: 'https://callception.com',
            },
            ip: '10.4.0.3',
        });
        const response = await middleware(req);

        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://callception.com',
        );
    });

    it('falls back to first allowed origin for disallowed origin', async () => {
        const req = createRequest('/api/contacts', {
            method: 'OPTIONS',
            headers: {
                origin: 'https://evil.com',
            },
            ip: '10.4.0.4',
        });
        const response = await middleware(req);

        // Should NOT echo back the evil origin
        expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe(
            'https://evil.com',
        );
    });

    it('includes security headers on preflight responses', async () => {
        const req = createRequest('/api/contacts', {
            method: 'OPTIONS',
            headers: {
                origin: 'http://localhost:3000',
            },
            ip: '10.4.0.5',
        });
        const response = await middleware(req);

        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
});

// ============================================
// 6. Tenant Header (x-user-tenant)
// ============================================

describe('Tenant Header', () => {
    it('forwards x-user-tenant when JWT contains tenantId', async () => {
        const ip = '10.5.0.1';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: {
                uid: 'user-t1',
                sub: 'user-t1',
                email: 'admin@tenant.com',
                tenantId: 'tenant-abc-123',
                role: 'admin',
            },
        });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await middleware(req);

        expect(response.status).toBe(200);
        expect(response.headers.get('x-user-tenant')).toBe('tenant-abc-123');
    });

    it('forwards x-user-role when JWT contains role', async () => {
        const ip = '10.5.0.2';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: {
                uid: 'user-t2',
                sub: 'user-t2',
                tenantId: 'tenant-xyz',
                role: 'member',
            },
        });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await middleware(req);

        expect(response.headers.get('x-user-role')).toBe('member');
    });

    it('does not set x-user-tenant when JWT has no tenantId', async () => {
        const ip = '10.5.0.3';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: {
                uid: 'user-notenant',
                sub: 'user-notenant',
                email: 'solo@user.com',
            },
        });

        const req = createRequest('/api/contacts', {
            ip,
            headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await middleware(req);

        expect(response.status).toBe(200);
        expect(response.headers.get('x-user-tenant')).toBeNull();
    });

    it('applies per-tenant rate limiting (500/min per tenant)', async () => {
        const ip = '10.5.0.4';
        const tenantId = 'tenant-ratelimit-test';
        mockVerifyToken.mockResolvedValue({
            valid: true,
            payload: {
                uid: 'user-rl',
                sub: 'user-rl',
                tenantId,
            },
        });

        let response;
        for (let i = 0; i < 501; i++) {
            // Vary IP to avoid per-IP rate limit triggering first
            const req = createRequest('/api/contacts', {
                ip: `10.5.${Math.floor(i / 100)}.${i % 100}`,
                headers: { Authorization: 'Bearer valid-token' },
            });
            response = await middleware(req);
        }

        expect(response!.status).toBe(429);
        const body = await response!.json();
        expect(body.error).toBe('Tenant rate limit exceeded');
    });
});

// ============================================
// 7. Static Assets & Page Routes
// ============================================

describe('Static & Page Routes', () => {
    it('skips middleware for /_next paths', async () => {
        const req = createRequest('/_next/static/chunk.js');
        const response = await middleware(req);

        // Should pass through with no auth check
        expect(response.status).toBe(200);
    });

    it('skips middleware for paths with file extensions', async () => {
        const req = createRequest('/favicon.ico');
        const response = await middleware(req);

        expect(response.status).toBe(200);
    });

    it('allows page routes through (handled by client-side AuthGuard)', async () => {
        const req = createRequest('/dashboard');
        const response = await middleware(req);

        // Page routes are not blocked by middleware
        expect(response.status).toBe(200);
    });
});
