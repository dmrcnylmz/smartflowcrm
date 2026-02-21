/**
 * Monitoring Metrics API
 * 
 * GET /api/metrics
 * 
 * Returns application health metrics, error counts, and
 * performance data from the monitoring singleton.
 * Protected — requires auth.
 */

import { NextResponse } from 'next/server';
import { monitor } from '@/lib/utils/monitoring';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const summary = monitor.getHealthSummary();
        const metrics = monitor.getMetrics();

        // Build system info
        const memUsage = process.memoryUsage?.() || {};

        return NextResponse.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            health: summary,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                memoryMB: {
                    rss: Math.round((memUsage.rss || 0) / 1024 / 1024),
                    heapUsed: Math.round((memUsage.heapUsed || 0) / 1024 / 1024),
                    heapTotal: Math.round((memUsage.heapTotal || 0) / 1024 / 1024),
                },
                uptime: Math.round(process.uptime?.() || 0),
            },
            recentMetrics: metrics.slice(-20), // Last 20 performance entries
        });
    } catch (error) {
        console.error('[Metrics API] Error:', error);
        return NextResponse.json(
            { error: 'Metrics unavailable' },
            { status: 500 },
        );
    }
}
