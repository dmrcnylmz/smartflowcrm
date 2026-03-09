/**
 * Error Monitoring API
 *
 * GET  /api/monitoring/errors — List recent errors (admin/owner only)
 * POST /api/monitoring/errors — Report client-side error
 */

import { NextRequest, NextResponse } from 'next/server';
import { captureError, getRecentErrors, getErrorStats } from '@/lib/monitoring/error-tracker';
import { requireAuth, errorResponse, createApiError, handleApiError, rateLimitResponse } from '@/lib/utils/error-handler';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

// --- Per-IP Rate Limiting for POST ---

const IP_RATE_LIMIT = 50; // max errors per minute per IP
const IP_WINDOW_MS = 60_000; // 1 minute window

const ipErrorCounts = new Map<string, { count: number; windowStart: number }>();

function checkIpRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = ipErrorCounts.get(ip);

    if (!entry || now - entry.windowStart > IP_WINDOW_MS) {
        ipErrorCounts.set(ip, { count: 1, windowStart: now });
        return true;
    }

    entry.count++;
    return entry.count <= IP_RATE_LIMIT;
}

// Periodic cleanup of stale IP entries (every 2 minutes)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of ipErrorCounts.entries()) {
            if (now - entry.windowStart > IP_WINDOW_MS * 2) {
                ipErrorCounts.delete(ip);
            }
        }
    }, 120_000);
}

// --- Helpers ---

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        'unknown'
    );
}

// POST: Report a client-side error
export async function POST(request: NextRequest) {
    try {
        // Per-IP rate limiting
        const clientIp = getClientIp(request);
        if (!checkIpRateLimit(clientIp)) {
            return rateLimitResponse(IP_WINDOW_MS);
        }

        const body = await request.json();
        const { source, message, stack, component, action, url, userAgent, extra } = body;

        if (!message) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'message gerekli'));
        }

        const userId = request.headers.get('x-user-uid') || undefined;
        const tenantId = request.headers.get('x-user-tenant') || undefined;

        const err = new Error(message);
        if (stack) err.stack = stack;

        const event = captureError(err, {
            userId,
            tenantId,
            component: source || component || 'client',
            action,
            url,
            userAgent,
            extra,
        });

        return NextResponse.json({
            captured: !!event,
            fingerprint: event?.fingerprint || null,
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'Monitoring POST');
    }
}

// GET: List recent errors (admin/owner only)
export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-uid');
        const role = request.headers.get('x-user-role');
        const authErr = requireAuth(userId);
        if (authErr) return errorResponse(authErr);

        // Only owner/admin can view errors
        if (!role || (role !== 'owner' && role !== 'admin')) {
            return errorResponse(createApiError('AUTH_ERROR', 'Yalnızca yöneticiler hata loglarını görebilir'));
        }

        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
        const errors = getRecentErrors(limit);
        const stats = getErrorStats();

        return NextResponse.json({
            errors,
            stats,
            timestamp: new Date().toISOString(),
        }, {
            headers: cacheHeaders('SHORT'),
        });

    } catch (error) {
        return handleApiError(error, 'Monitoring GET');
    }
}
