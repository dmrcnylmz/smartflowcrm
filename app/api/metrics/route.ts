/**
 * Monitoring Metrics API
 *
 * GET /api/metrics
 *
 * Returns application health metrics, error counts, and
 * performance data from the monitoring singleton.
 * Protected — requires strict auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitor } from '@/lib/utils/monitoring';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Require authentication — metrics are internal-only
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const summary = monitor.getHealthSummary();
        const metrics = monitor.getMetrics();

        // Build system info — exclude nodeVersion/platform to prevent fingerprinting
        const memUsage = process.memoryUsage?.() || {};

        return NextResponse.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            health: summary,
            system: {
                memoryMB: {
                    rss: Math.round((memUsage.rss || 0) / 1024 / 1024),
                    heapUsed: Math.round((memUsage.heapUsed || 0) / 1024 / 1024),
                    heapTotal: Math.round((memUsage.heapTotal || 0) / 1024 / 1024),
                },
                uptime: Math.round(process.uptime?.() || 0),
            },
            recentMetrics: metrics.slice(-20), // Last 20 performance entries
        }, {
            headers: cacheHeaders('SHORT'),
        });
    } catch {
        return NextResponse.json(
            { error: 'Metrics unavailable' },
            { status: 500 },
        );
    }
}
