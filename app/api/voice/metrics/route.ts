/**
 * Voice Metrics API — Pipeline Latency Analytics
 *
 * GET: Returns aggregated latency statistics from call logs.
 *      Query params: ?days=7 (default 7, max 90)
 *
 * Response: { avgTtftMs, avgSttMs, avgLlmMs, avgTtsMs, avgRagMs,
 *             p95TtftMs, totalCalls, dailyBreakdown[] }
 *
 * Data source: tenants/{tenantId}/calls collection → voiceMetrics field
 *
 * Auth: Requires x-user-tenant header (set by middleware)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// Types
// =============================================

interface LatencyStats {
    avgTtftMs: number;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
    avgRagMs: number;
    avgPipelineMs: number;
    p95TtftMs: number;
    totalCalls: number;
    dailyBreakdown: DailyBreakdown[];
}

interface DailyBreakdown {
    date: string; // YYYY-MM-DD
    callCount: number;
    avgTtftMs: number;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
}

// =============================================
// GET Handler
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const days = Math.min(
            parseInt(request.nextUrl.searchParams.get('days') || '7', 10),
            90,
        );

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        // Query call logs with voice metrics
        const snapshot = await getDb()
            .collection('tenants').doc(auth.tenantId)
            .collection('calls')
            .where('timestamp', '>=', cutoffDate)
            .orderBy('timestamp', 'desc')
            .limit(500) // Cap to prevent excessive reads
            .get();

        if (snapshot.empty) {
            return NextResponse.json({
                stats: emptyStats(),
                period: `${days}d`,
            });
        }

        // Aggregate metrics
        const stats = aggregateMetrics(snapshot.docs, days);

        return NextResponse.json({
            stats,
            period: `${days}d`,
        }, {
            headers: { 'Cache-Control': 'private, max-age=120' },
        });
    } catch (error) {
        return handleApiError(error, 'Voice Metrics GET');
    }
}

// =============================================
// Aggregation Logic
// =============================================

function aggregateMetrics(
    docs: FirebaseFirestore.QueryDocumentSnapshot[],
    _days: number,
): LatencyStats {
    const ttftValues: number[] = [];
    const sttValues: number[] = [];
    const llmValues: number[] = [];
    const ttsValues: number[] = [];
    const ragValues: number[] = [];
    const pipelineValues: number[] = [];

    // Daily buckets
    const dailyMap = new Map<string, {
        callCount: number;
        ttftSum: number;
        sttSum: number;
        llmSum: number;
        ttsSum: number;
    }>();

    for (const doc of docs) {
        const data = doc.data();
        const metrics = data.voiceMetrics as Record<string, unknown> | undefined;
        if (!metrics) continue;

        // Extract latency arrays and compute averages
        const sttArr = metrics.sttLatencyMs as number[] | undefined;
        const llmArr = metrics.llmLatencyMs as number[] | undefined;
        const ttsArr = metrics.ttsLatencyMs as number[] | undefined;
        const ragArr = metrics.ragRetrievalMs as number[] | undefined;
        const ttft = metrics.ttftMs as number | undefined;

        const avgStt = arrayAvg(sttArr);
        const avgLlm = arrayAvg(llmArr);
        const avgTts = arrayAvg(ttsArr);
        const avgRag = arrayAvg(ragArr);

        if (avgStt > 0) sttValues.push(avgStt);
        if (avgLlm > 0) llmValues.push(avgLlm);
        if (avgTts > 0) ttsValues.push(avgTts);
        if (avgRag > 0) ragValues.push(avgRag);
        if (typeof ttft === 'number' && ttft > 0) ttftValues.push(ttft);

        // Pipeline total
        const pipeline = avgStt + avgLlm + avgTts;
        if (pipeline > 0) pipelineValues.push(pipeline);

        // Daily breakdown
        const timestamp = data.timestamp;
        let dateStr: string | null = null;
        if (timestamp && typeof timestamp.toDate === 'function') {
            dateStr = timestamp.toDate().toISOString().split('T')[0];
        } else if (timestamp instanceof Date) {
            dateStr = timestamp.toISOString().split('T')[0];
        }

        if (dateStr) {
            const existing = dailyMap.get(dateStr) || {
                callCount: 0,
                ttftSum: 0,
                sttSum: 0,
                llmSum: 0,
                ttsSum: 0,
            };
            existing.callCount++;
            existing.ttftSum += typeof ttft === 'number' ? ttft : 0;
            existing.sttSum += avgStt;
            existing.llmSum += avgLlm;
            existing.ttsSum += avgTts;
            dailyMap.set(dateStr, existing);
        }
    }

    // Calculate P95
    const p95Ttft = percentile(ttftValues, 95);

    // Build daily breakdown (sorted by date)
    const dailyBreakdown: DailyBreakdown[] = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
            date,
            callCount: d.callCount,
            avgTtftMs: Math.round(d.ttftSum / d.callCount),
            avgSttMs: Math.round(d.sttSum / d.callCount),
            avgLlmMs: Math.round(d.llmSum / d.callCount),
            avgTtsMs: Math.round(d.ttsSum / d.callCount),
        }));

    return {
        avgTtftMs: Math.round(avg(ttftValues)),
        avgSttMs: Math.round(avg(sttValues)),
        avgLlmMs: Math.round(avg(llmValues)),
        avgTtsMs: Math.round(avg(ttsValues)),
        avgRagMs: Math.round(avg(ragValues)),
        avgPipelineMs: Math.round(avg(pipelineValues)),
        p95TtftMs: Math.round(p95Ttft),
        totalCalls: docs.length,
        dailyBreakdown,
    };
}

// =============================================
// Helpers
// =============================================

function arrayAvg(arr: number[] | undefined): number {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function emptyStats(): LatencyStats {
    return {
        avgTtftMs: 0,
        avgSttMs: 0,
        avgLlmMs: 0,
        avgTtsMs: 0,
        avgRagMs: 0,
        avgPipelineMs: 0,
        p95TtftMs: 0,
        totalCalls: 0,
        dailyBreakdown: [],
    };
}
