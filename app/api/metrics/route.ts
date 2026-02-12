// Metrics API Endpoint
// Exposes Prometheus-compatible metrics

import { NextRequest, NextResponse } from 'next/server';
import { metrics } from '@/lib/voice/logging';

// Basic auth check (optional, for production security)
function checkAuth(req: NextRequest): boolean {
    const authHeader = req.headers.get('authorization');
    const metricsToken = process.env.METRICS_TOKEN;

    if (!metricsToken) return true; // No auth configured

    if (!authHeader) return false;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token === metricsToken;
}

export async function GET(req: NextRequest) {
    // Check auth
    if (!checkAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const format = req.nextUrl.searchParams.get('format') || 'prometheus';

    if (format === 'json') {
        return NextResponse.json(metrics.getMetrics());
    }

    // Prometheus format
    const prometheusMetrics = metrics.getPrometheusMetrics();

    return new NextResponse(prometheusMetrics, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });
}
