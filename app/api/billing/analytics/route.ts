/**
 * Voice Pipeline Analytics API
 *
 * GET /api/billing/analytics?range=7d|30d|90d&type=latency|cost|providers|summary|daily
 *
 * Returns formatted data for dashboard charts (recharts compatible).
 * Requires authentication (x-user-tenant header via middleware).
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getTenantFromRequest } from '@/lib/firebase/admin-db';
import {
    getLatencyStats,
    getProviderBreakdown,
    getCostTrend,
    getDailyMetrics,
    getPipelineSummary,
} from '@/lib/billing/analytics';

let _db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!_db) { initAdmin(); _db = getFirestore(); }
    return _db;
}

export async function GET(request: NextRequest) {
    try {
        const tenantId = getTenantFromRequest(request);
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const range = searchParams.get('range') || '7d';
        const type = searchParams.get('type') || 'summary';

        // Parse range to days
        const days = parseRange(range);
        const db = getDb();

        switch (type) {
            case 'latency': {
                const stats = await getLatencyStats(db, tenantId, days);
                return NextResponse.json(stats);
            }

            case 'cost': {
                const months = Math.max(1, Math.ceil(days / 30));
                const trend = await getCostTrend(db, tenantId, months);
                return NextResponse.json(trend);
            }

            case 'providers': {
                const breakdown = await getProviderBreakdown(db, tenantId, days);
                return NextResponse.json(breakdown);
            }

            case 'daily': {
                const metrics = await getDailyMetrics(db, tenantId, days);
                return NextResponse.json({ metrics, range, days });
            }

            case 'summary':
            default: {
                // Return all data for dashboard
                const [latency, providers, costTrend, summary] = await Promise.all([
                    getLatencyStats(db, tenantId, days),
                    getProviderBreakdown(db, tenantId, days),
                    getCostTrend(db, tenantId, Math.max(1, Math.ceil(days / 30))),
                    getPipelineSummary(db, tenantId, days),
                ]);

                return NextResponse.json({
                    summary,
                    latency,
                    providers,
                    costTrend,
                    range,
                    days,
                });
            }
        }
    } catch (error) {
        console.error('[Analytics API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics' },
            { status: 500 },
        );
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseRange(range: string): number {
    const match = range.match(/^(\d+)d$/);
    if (match) return parseInt(match[1], 10);

    switch (range) {
        case '7d': return 7;
        case '30d': return 30;
        case '90d': return 90;
        default: return 7;
    }
}
