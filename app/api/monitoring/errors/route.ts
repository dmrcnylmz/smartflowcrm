/**
 * Error Monitoring API
 *
 * GET  /api/monitoring/errors — List recent errors (admin only)
 * POST /api/monitoring/errors — Report client-side error
 */

import { NextRequest, NextResponse } from 'next/server';
import { captureError, getRecentErrors, getErrorStats } from '@/lib/monitoring/error-tracker';
import { requireAuth, errorResponse, createApiError, handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

// POST: Report a client-side error
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, stack, component, action, url, userAgent, extra } = body;

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
            component: component || 'client',
            action,
            url,
            userAgent,
            extra,
        });

        return NextResponse.json({
            captured: !!event,
            eventId: event?.id || null,
        });

    } catch (error) {
        return handleApiError(error, 'Monitoring POST');
    }
}

// GET: List recent errors (admin only)
export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-uid');
        const role = request.headers.get('x-user-role');
        const authErr = requireAuth(userId);
        if (authErr) return errorResponse(authErr);

        // Only owner/admin can view errors
        if (role && role !== 'owner' && role !== 'admin') {
            return errorResponse(createApiError('AUTH_ERROR', 'Yalnızca yöneticiler hata loglarını görebilir'));
        }

        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
        const errors = getRecentErrors(limit);
        const stats = getErrorStats();

        return NextResponse.json({
            errors,
            stats,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        return handleApiError(error, 'Monitoring GET');
    }
}
