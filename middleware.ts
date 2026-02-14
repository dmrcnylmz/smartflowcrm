import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth/token-verify';

// Simple in-memory rate limit store for API routes
const apiRateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup stale entries every 2 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of apiRateLimitStore.entries()) {
            if (entry.resetTime < now) {
                apiRateLimitStore.delete(key);
            }
        }
    }, 120_000);
}

// --- Configuration ---

/** API routes that do NOT require authentication */
const PUBLIC_API_PATHS = [
    '/api/webhook',
    '/api/voice/health',
    '/api/voice/pipeline',
    '/api/voice/test',
    '/api/voice/mock',
    '/api/voice/infer',
    '/api/voice/ws-proxy',
    '/api/voice/connect',
    '/api/voice/tts',
    '/api/ai/status',
];

/** Page routes that are public (no login required) */
const PUBLIC_PAGE_PATHS = ['/login'];

/** Rate limit: 100 req/min for general API, 10 req/min for auth-sensitive */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_GENERAL = 100;
const RATE_LIMIT_MAX_SENSITIVE = 10;

// Sensitive endpoints get stricter limits
const SENSITIVE_PREFIXES = ['/api/voice/connect', '/api/voice/session'];

// --- Helpers ---

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

function checkApiRateLimit(
    key: string,
    maxRequests: number,
): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    let entry = apiRateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
        entry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
        apiRateLimitStore.set(key, entry);
    }

    entry.count++;

    return {
        allowed: entry.count <= maxRequests,
        remaining: Math.max(0, maxRequests - entry.count),
        resetTime: entry.resetTime,
    };
}

function isSensitivePath(pathname: string): boolean {
    return SENSITIVE_PREFIXES.some((p) => pathname.startsWith(p));
}

// --- Middleware ---

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // 1. Skip non-API and non-page routes (static assets, _next, etc.)
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // 2. API route handling
    if (pathname.startsWith('/api')) {
        const isPublicApi = PUBLIC_API_PATHS.some(
            (p) => pathname === p || pathname.startsWith(p + '/'),
        );

        // Rate limiting for all API routes
        const ip = getClientIp(req);
        const maxReqs = isSensitivePath(pathname)
            ? RATE_LIMIT_MAX_SENSITIVE
            : RATE_LIMIT_MAX_GENERAL;
        const rateLimitKey = `mw:${ip}:${isSensitivePath(pathname) ? 'sensitive' : 'general'}`;
        const { allowed, remaining, resetTime } = checkApiRateLimit(
            rateLimitKey,
            maxReqs,
        );

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

            // Forward verified user info to API routes via headers
            const response = NextResponse.next();
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
