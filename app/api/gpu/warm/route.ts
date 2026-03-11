/**
 * GPU Pre-Warm API
 * POST /api/gpu/warm — Start/check GPU pod for enterprise tenants
 * Called when admin toggles AI Assistant ON
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError } from '@/lib/utils/error-handler';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { checkSubscriptionActive } from '@/lib/billing/subscription-guard';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const action = body.action as string;

        if (!action || !['start', 'stop'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Check pod configured
        if (!gpuManager.isPodConfigured()) {
            return NextResponse.json({ skipped: true, reason: 'Pod not configured' });
        }

        // Enterprise check
        const guard = await checkSubscriptionActive(getDb(), auth.tenantId);
        if (!guard.active || guard.planId !== 'enterprise') {
            return NextResponse.json({ skipped: true, reason: 'Enterprise plan required' });
        }

        if (action === 'start') {
            // Fire-and-forget: don't await the full boot
            gpuManager.ensureReady().catch((err) => {
                console.error('[GPU Warm] Pre-warm failed:', err);
            });
            return NextResponse.json({
                success: true,
                message: 'GPU pod pre-warming started',
                podConfigured: true
            });
        } else {
            // action === 'stop' — just acknowledge, auto-shutdown handles it
            return NextResponse.json({
                success: true,
                message: 'Pod will auto-shutdown after idle timeout'
            });
        }

    } catch (error) {
        return handleApiError(error, 'GPU Warm');
    }
}
