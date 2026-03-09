/**
 * Usage API — Tenant Usage Dashboard
 *
 * GET: Retrieve usage statistics and cost estimates
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getUsage, getUsageHistory, estimateCost, checkUsageLimits, estimatePerCallCost, SUBSCRIPTION_TIERS } from '@/lib/billing/metering';
import { handleApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const period = request.nextUrl.searchParams.get('period') || undefined;
        const includeHistory = request.nextUrl.searchParams.get('history') === 'true';
        const tier = request.nextUrl.searchParams.get('tier') || 'starter';

        // Get current usage
        const usage = await getUsage(getDb(), auth.tenantId, period);

        // Detailed cost breakdown
        const cost = estimateCost(usage, tier);

        // Usage limits check
        const limits = checkUsageLimits(usage, tier);

        // Per-call cost estimate (3-min average)
        const perCallCost = estimatePerCallCost(3);

        // Tier info
        const tierInfo = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.starter;

        // Get history if requested
        let history = undefined;
        if (includeHistory) {
            history = await getUsageHistory(getDb(), auth.tenantId, 6);
        }

        return NextResponse.json({
            usage,
            cost,
            limits,
            perCallCost,
            tierInfo: { name: tierInfo.name, includedMinutes: tierInfo.includedMinutes, includedCalls: tierInfo.includedCalls },
            ...(history ? { history } : {}),
        }, {
            headers: cacheHeaders('SHORT'),
        });

    } catch (error) {
        return handleApiError(error, 'BillingUsage');
    }
}
