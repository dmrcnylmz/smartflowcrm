/**
 * Voice Feedback API — Call Rating & Quality Tracking
 *
 * POST: Submit manual feedback for a call (1-5 stars + optional comment)
 * GET:  Get feedback statistics for the tenant
 *
 * Auth: Requires x-user-tenant header (set by middleware)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    updateCallFeedback,
    getCallFeedback,
    getCallFeedbackStats,
} from '@/lib/voice/feedback';
import { handleApiError, requireAuth, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

// =============================================
// POST: Submit / Update feedback
// =============================================

export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const validation = requireFields(body, ['callId', 'rating']);
        if (validation) return errorResponse(validation);

        const { callId, rating, comment } = body;

        // Validate rating
        const numRating = Number(rating);
        if (isNaN(numRating) || numRating < 1 || numRating > 5) {
            return NextResponse.json(
                { error: 'Rating must be between 1 and 5' },
                { status: 400 },
            );
        }

        await updateCallFeedback(tenantId!, callId, {
            rating: numRating,
            comment: comment || undefined,
        });

        return NextResponse.json({
            success: true,
            message: 'Feedback saved',
        });
    } catch (error) {
        return handleApiError(error, 'Voice Feedback POST');
    }
}

// =============================================
// GET: Feedback stats or specific call feedback
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const callId = request.nextUrl.searchParams.get('callId');
        const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

        // If callId specified, return specific call feedback
        if (callId) {
            const feedback = await getCallFeedback(tenantId!, callId);
            return NextResponse.json({ feedback });
        }

        // Otherwise return aggregated stats
        const stats = await getCallFeedbackStats(tenantId!, days);

        return NextResponse.json({
            stats,
            period: `${days}d`,
        }, {
            headers: { 'Cache-Control': 'private, max-age=60' },
        });
    } catch (error) {
        return handleApiError(error, 'Voice Feedback GET');
    }
}
