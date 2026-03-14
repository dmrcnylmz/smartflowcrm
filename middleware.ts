import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth/token-verify';
import { checkGeneralLimit, checkSensitiveLimit, checkTenantLimit } from '@/lib/utils/rate-limiter';

// --- Configuration ---

/** API routes that do NOT require authentication.
 *
 * SECURITY NOTE: Every path listed here is accessible WITHOUT a Bearer token.
 * Only add routes that genuinely need unauthenticated access (webhooks,
 * health checks, Twilio callbacks with their own signature verification).
 *
 * Voice/TTS/STT endpoints are intentionally NOT public — they call paid
 * third-party APIs (Cartesia, OpenAI, Deepgram) and must be gated.
 */
const PUBLIC_API_PATHS = [
    '/api/webhook',
    '/api/health',
    '/api/voice/health',
    '/api/ai/status',
    '/api/twilio/incoming',
    '/api/twilio/status',
    '/api/twilio/gather',
    '/api/twilio/recording',
    '/api/voice/tts/phone',  // Twilio <Play> fetches this without auth — HMAC imzayla korumalı
    '/api/billing/webhook',
    '/api/cron/appointment-reminders',
    '/api/cron/gpu-shutdown',
    '/api/cron/webhook-retry',
    '/api/chat/support',
    '/api/chat/support/tts',
    '/api/leads',
    // Security: test & diagnostic endpoints moved behind auth
    // '/api/voice/test-e2e', '/api/twilio/test', '/api/billing/alert-test', '/api/system/go-live-check'
];

/** Server-to-server endpoints (webhooks, cron, etc.) legitimately have no Origin */
const SERVER_TO_SERVER_PATHS = ['/api/webhook', '/api/twilio/', '/api/cron/', '/api/billing/webhook'];

/** Validate that a string is a proper HTTPS URL suitable for CORS origin */
function isValidCorsOrigin(url: string | undefined): url is string {
    if (!url) return false;
    if (!url.startsWith('https://')) return false;
    try {
        const parsed = new URL(url);
        // Must be https, must have a valid hostname, no path/query/fragment beyond origin
        return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
        return false;
    }
}

/** Allowed origins for CORS */
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const ALLOWED_ORIGINS = [
    ...(process.env.NODE_ENV !== 'production' ? [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3009',
        'http://127.0.0.1:3009',
    ] : []),
    'https://callception.com',
    'https://www.callception.com',
    ...(isValidCorsOrigin(appUrl) ? [new URL(appUrl).origin] : []),
].filter(Boolean) as string[];

/** Security headers applied to all responses */
const isDev = process.env.NODE_ENV === 'development';
const scriptSrc = isDev
    ? "'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.googletagmanager.com"
    : "'self' 'unsafe-inline' https://apis.google.com https://www.googletagmanager.com";

const SECURITY_HEADERS: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
    'X-DNS-Prefetch-Control': 'on',
    'Content-Security-Policy': [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://*.google.com https://*.sentry.io https://www.google-analytics.com https://www.googletagmanager.com",
        "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
        "frame-ancestors 'none'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
    ].join('; '),
};

/** Page routes that are public (no login required) */
const PUBLIC_PAGE_PATHS = ['/login', '/landing', '/privacy'];

// Sensitive endpoints get stricter limits
const SENSITIVE_PREFIXES = ['/api/voice/connect', '/api/voice/session'];

// --- Helpers ---

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

function isSensitivePath(pathname: string): boolean {
    return SENSITIVE_PREFIXES.some((p) => pathname.startsWith(p));
}

// --- Middleware ---

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Generate or forward request ID for correlation (tracing across logs)
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    // 1. Skip non-API and non-page routes (static assets, _next, etc.)
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // 2. CORS handling for API routes
    if (pathname.startsWith('/api')) {
        const origin = req.headers.get('origin') || '';
        // Server-to-server endpoints (webhooks, cron, etc.) legitimately have no Origin
        const isServerPath = SERVER_TO_SERVER_PATHS.some(p => pathname.startsWith(p));
        const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || (!origin && isServerPath);

        // Handle preflight
        if (req.method === 'OPTIONS') {
            return new NextResponse(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : ALLOWED_ORIGINS[0],
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
                    'Access-Control-Max-Age': '86400',
                    ...SECURITY_HEADERS,
                },
            });
        }
    }

    // 3. API route handling
    if (pathname.startsWith('/api')) {
        const isPublicApi = PUBLIC_API_PATHS.some(
            (p) => pathname === p || pathname.startsWith(p + '/'),
        );

        // Rate limiting for all API routes (Upstash Redis with in-memory fallback)
        const ip = getClientIp(req);
        const isSensitive = isSensitivePath(pathname);
        const rateResult = await (isSensitive
            ? checkSensitiveLimit(ip)
            : checkGeneralLimit(ip));
        const maxReqs = isSensitive ? 10 : 100;
        const { success: allowed, remaining, reset: resetTime } = rateResult;

        if (!allowed) {
            const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
            return NextResponse.json(
                {
                    error: 'Rate limit exceeded',
                    message: 'Çok fazla istek gönderdiniz. Lütfen bekleyin.',
                    retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        'x-request-id': requestId,
                        'Retry-After': retryAfter.toString(),
                        'X-RateLimit-Limit': maxReqs.toString(),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
                    },
                },
            );
        }

        // Auth check for non-public API routes
        if (!isPublicApi) {
            const authHeader = req.headers.get('Authorization');
            const sessionCookie = req.cookies.get('session')?.value;
            const token = extractBearerToken(authHeader) || sessionCookie;

            if (!token) {
                return NextResponse.json(
                    {
                        error: 'Unauthorized',
                        message: 'Bu endpoint için kimlik doğrulaması gereklidir.',
                    },
                    { status: 401 },
                );
            }

            // Validate token (lightweight decode in dev, Admin SDK in prod)
            const result = await verifyToken(token);

            if (!result.valid) {
                return NextResponse.json(
                    {
                        error: 'Unauthorized',
                        message: result.error || 'Geçersiz kimlik bilgisi.',
                    },
                    { status: 401 },
                );
            }

            // Per-tenant rate limiting (500 req/min per tenant, separate from per-IP)
            if (result.payload?.tenantId) {
                const tenantRateResult = await checkTenantLimit(result.payload.tenantId);
                if (!tenantRateResult.success) {
                    const retryAfter = Math.ceil((tenantRateResult.reset - Date.now()) / 1000);
                    return NextResponse.json(
                        {
                            error: 'Tenant rate limit exceeded',
                            message: 'Bu hesap için istek limiti aşıldı. Lütfen bekleyin.',
                            retryAfter,
                        },
                        {
                            status: 429,
                            headers: {
                                'Retry-After': retryAfter.toString(),
                                'X-RateLimit-Limit': '500',
                                'X-RateLimit-Remaining': '0',
                                'X-RateLimit-Reset': Math.ceil(tenantRateResult.reset / 1000).toString(),
                            },
                        },
                    );
                }
            }

            // Forward verified user info to API routes via headers
            const response = NextResponse.next();
            // Security headers + request ID
            response.headers.set('x-request-id', requestId);
            for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
                response.headers.set(key, value);
            }
            response.headers.set('X-RateLimit-Limit', maxReqs.toString());
            response.headers.set('X-RateLimit-Remaining', remaining.toString());
            response.headers.set(
                'X-RateLimit-Reset',
                Math.ceil(resetTime / 1000).toString(),
            );
            if (result.payload) {
                response.headers.set('x-user-uid', result.payload.uid);
                if (result.payload.email) {
                    response.headers.set('x-user-email', result.payload.email);
                }
                // Forward tenant context from JWT custom claims
                if (result.payload.tenantId) {
                    response.headers.set('x-user-tenant', result.payload.tenantId);
                }
                if (result.payload.role) {
                    response.headers.set('x-user-role', result.payload.role);
                }
            }
            return response;
        }

        // Add rate limit headers to successful responses
        const response = NextResponse.next();
        // Add security headers + request ID
        response.headers.set('x-request-id', requestId);
        for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
            response.headers.set(key, value);
        }
        response.headers.set('X-RateLimit-Limit', maxReqs.toString());
        response.headers.set('X-RateLimit-Remaining', remaining.toString());
        response.headers.set(
            'X-RateLimit-Reset',
            Math.ceil(resetTime / 1000).toString(),
        );
        return response;
    }

    // 3. Page routes — let AuthGuard handle client-side
    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all API routes
        '/api/:path*',
        // Match pages (but not static files or _next)
        '/((?!_next/static|_next/image|favicon.ico|.*\\.).*)',
    ],
};
