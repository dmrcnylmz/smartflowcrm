/**
 * Usage API — Tenant Usage Dashboard
 *
 * GET: Retrieve usage statistics and cost estimates
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getUsage, getUsageHistory, estimateCost } from '@/lib/billing/metering';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        const period = request.nextUrl.searchParams.get('period') || undefined;
        const includeHistory = request.nextUrl.searchParams.get('history') === 'true';
        const tier = request.nextUrl.searchParams.get('tier') || 'starter';

        // Get current usage
        const usage = await getUsage(getDb(), tenantId, period);

        // Estimate cost
        const cost = estimateCost(usage, tier);

        // Get history if requested
        let history = undefined;
        if (includeHistory) {
            history = await getUsageHistory(getDb(), tenantId, 6);
        }

        return NextResponse.json({
            usage,
            cost,
            ...(history ? { history } : {}),
        });

    } catch (error) {
        console.error('[Usage API] Error:', error);
        return NextResponse.json(
            { error: 'Usage fetch failed', details: String(error) },
            { status: 500 },
        );
    }
}
