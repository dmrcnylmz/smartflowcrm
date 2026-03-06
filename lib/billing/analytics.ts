/**
 * Analytics Query Functions — Dashboard Data Provider
 *
 * Queries metrics_daily collection for fast aggregated stats.
 * Used by /api/billing/analytics endpoint to feed dashboard charts.
 *
 * Storage: tenants/{tenantId}/metrics_daily/{YYYY-MM-DD}
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DailyMetric {
    date: string;
    callCount: number;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
    avgPipelineMs: number;
    totalTtsChars: number;
    providerBreakdown: {
        stt: Record<string, number>;
        llm: Record<string, number>;
        tts: Record<string, number>;
    };
    estimatedCostUsd: number;
}

export interface LatencyStats {
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
    avgPipelineMs: number;
    totalCalls: number;
    period: string;
    dailyBreakdown: Array<{
        date: string;
        avgSttMs: number;
        avgLlmMs: number;
        avgTtsMs: number;
        avgPipelineMs: number;
        callCount: number;
    }>;
}

export interface CostTrend {
    months: Array<{
        period: string;
        ttsChars: number;
        ttsCostUsd: number;
        llmCalls: number;
        llmCostUsd: number;
        totalCostUsd: number;
    }>;
}

export interface ProviderBreakdown {
    stt: Record<string, number>;
    llm: Record<string, number>;
    tts: Record<string, number>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COST_ELEVENLABS_PER_1000 = 0.15;
const COST_OPENAI_TTS_PER_1000 = 0.015;
const COST_LLM_PER_CALL = 0.02;

// ─── Query Functions ─────────────────────────────────────────────────────────

/**
 * Get latency statistics for the last N days.
 * Returns averages + daily breakdown for charts.
 */
export async function getLatencyStats(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    days: number = 7,
): Promise<LatencyStats> {
    const docs = await getRecentDailyDocs(db, tenantId, days);

    let totalSttMs = 0, totalLlmMs = 0, totalTtsMs = 0, totalPipelineMs = 0;
    let totalCalls = 0;
    const dailyBreakdown: LatencyStats['dailyBreakdown'] = [];

    for (const doc of docs) {
        const data = doc.data();
        const callCount = data.callCount || 0;
        const sttCount = data.sttCount || callCount || 1;
        const llmCount = data.llmCount || callCount || 1;
        const ttsCount = data.ttsCount || callCount || 1;

        totalSttMs += data.totalSttMs || 0;
        totalLlmMs += data.totalLlmMs || 0;
        totalTtsMs += data.totalTtsMs || 0;
        totalPipelineMs += data.totalPipelineMs || 0;
        totalCalls += callCount;

        dailyBreakdown.push({
            date: data.date || doc.id,
            avgSttMs: sttCount > 0 ? Math.round((data.totalSttMs || 0) / sttCount) : 0,
            avgLlmMs: llmCount > 0 ? Math.round((data.totalLlmMs || 0) / llmCount) : 0,
            avgTtsMs: ttsCount > 0 ? Math.round((data.totalTtsMs || 0) / ttsCount) : 0,
            avgPipelineMs: callCount > 0 ? Math.round((data.totalPipelineMs || 0) / callCount) : 0,
            callCount,
        });
    }

    // Sort by date ascending for chart display
    dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date));

    return {
        avgSttMs: totalCalls > 0 ? Math.round(totalSttMs / totalCalls) : 0,
        avgLlmMs: totalCalls > 0 ? Math.round(totalLlmMs / totalCalls) : 0,
        avgTtsMs: totalCalls > 0 ? Math.round(totalTtsMs / totalCalls) : 0,
        avgPipelineMs: totalCalls > 0 ? Math.round(totalPipelineMs / totalCalls) : 0,
        totalCalls,
        period: `${days}d`,
        dailyBreakdown,
    };
}

/**
 * Get provider usage breakdown for the last N days.
 */
export async function getProviderBreakdown(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    days: number = 30,
): Promise<ProviderBreakdown> {
    const docs = await getRecentDailyDocs(db, tenantId, days);

    const stt: Record<string, number> = {};
    const llm: Record<string, number> = {};
    const tts: Record<string, number> = {};

    for (const doc of docs) {
        const data = doc.data();

        // Extract provider counts from fields like sttProvider_deepgram, llmProvider_groq-llama
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('sttProvider_') && typeof value === 'number') {
                const provider = key.replace('sttProvider_', '');
                stt[provider] = (stt[provider] || 0) + value;
            }
            if (key.startsWith('llmProvider_') && typeof value === 'number') {
                const provider = key.replace('llmProvider_', '');
                llm[provider] = (llm[provider] || 0) + value;
            }
            if (key.startsWith('ttsProvider_') && typeof value === 'number') {
                const provider = key.replace('ttsProvider_', '');
                tts[provider] = (tts[provider] || 0) + value;
            }
        }
    }

    return { stt, llm, tts };
}

/**
 * Get monthly cost trend for the last N months.
 */
export async function getCostTrend(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    months: number = 6,
): Promise<CostTrend> {
    // Query usage collection for monthly periods
    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');
    const snap = await usageRef
        .where('period', '!=', 'current')
        .orderBy('period', 'desc')
        .limit(months)
        .get();

    const monthlyData: CostTrend['months'] = [];

    for (const doc of snap.docs) {
        const data = doc.data();
        const ttsChars = data.ttsChars || 0;
        const totalCalls = data.totalCalls || 0;

        const ttsCost = (ttsChars / 1000) * COST_ELEVENLABS_PER_1000;
        const llmCost = totalCalls * COST_LLM_PER_CALL;

        monthlyData.push({
            period: data.period || doc.id,
            ttsChars,
            ttsCostUsd: round2(ttsCost),
            llmCalls: totalCalls,
            llmCostUsd: round2(llmCost),
            totalCostUsd: round2(ttsCost + llmCost),
        });
    }

    // Sort ascending for chart display
    monthlyData.sort((a, b) => a.period.localeCompare(b.period));

    return { months: monthlyData };
}

/**
 * Get daily metrics for the last N days (full detail).
 */
export async function getDailyMetrics(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    days: number = 7,
): Promise<DailyMetric[]> {
    const docs = await getRecentDailyDocs(db, tenantId, days);

    return docs.map(doc => {
        const data = doc.data();
        const callCount = data.callCount || 0;
        const sttCount = data.sttCount || callCount || 1;
        const llmCount = data.llmCount || callCount || 1;
        const ttsCount = data.ttsCount || callCount || 1;
        const totalTtsChars = data.totalTtsChars || 0;

        // Build provider breakdowns
        const providerBreakdown: DailyMetric['providerBreakdown'] = { stt: {}, llm: {}, tts: {} };
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('sttProvider_') && typeof value === 'number') {
                providerBreakdown.stt[key.replace('sttProvider_', '')] = value;
            }
            if (key.startsWith('llmProvider_') && typeof value === 'number') {
                providerBreakdown.llm[key.replace('llmProvider_', '')] = value;
            }
            if (key.startsWith('ttsProvider_') && typeof value === 'number') {
                providerBreakdown.tts[key.replace('ttsProvider_', '')] = value;
            }
        }

        return {
            date: data.date || doc.id,
            callCount,
            avgSttMs: sttCount > 0 ? Math.round((data.totalSttMs || 0) / sttCount) : 0,
            avgLlmMs: llmCount > 0 ? Math.round((data.totalLlmMs || 0) / llmCount) : 0,
            avgTtsMs: ttsCount > 0 ? Math.round((data.totalTtsMs || 0) / ttsCount) : 0,
            avgPipelineMs: callCount > 0 ? Math.round((data.totalPipelineMs || 0) / callCount) : 0,
            totalTtsChars,
            providerBreakdown,
            estimatedCostUsd: round2((totalTtsChars / 1000) * COST_ELEVENLABS_PER_1000 + callCount * COST_LLM_PER_CALL),
        };
    }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get summary stats for dashboard KPI cards.
 */
export async function getPipelineSummary(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    days: number = 30,
): Promise<{
    totalCalls: number;
    avgPipelineMs: number;
    totalTtsChars: number;
    estimatedCostUsd: number;
    emergencyModeActive: boolean;
    callsTrend: number; // % change vs previous period
}> {
    const docs = await getRecentDailyDocs(db, tenantId, days);

    let totalCalls = 0, totalPipelineMs = 0, totalTtsChars = 0;
    for (const doc of docs) {
        const data = doc.data();
        totalCalls += data.callCount || 0;
        totalPipelineMs += data.totalPipelineMs || 0;
        totalTtsChars += data.totalTtsChars || 0;
    }

    // Get previous period for trend calculation
    const prevDocs = await getRecentDailyDocs(db, tenantId, days, days);
    let prevCalls = 0;
    for (const doc of prevDocs) {
        prevCalls += doc.data().callCount || 0;
    }

    const callsTrend = prevCalls > 0
        ? Math.round(((totalCalls - prevCalls) / prevCalls) * 100)
        : 0;

    // Check emergency mode
    let emergencyModeActive = false;
    try {
        const configDoc = await db
            .collection('tenants').doc(tenantId)
            .collection('config').doc('cost_monitoring')
            .get();
        emergencyModeActive = configDoc.data()?.emergencyModeActive || false;
    } catch {
        // Ignore
    }

    return {
        totalCalls,
        avgPipelineMs: totalCalls > 0 ? Math.round(totalPipelineMs / totalCalls) : 0,
        totalTtsChars,
        estimatedCostUsd: round2((totalTtsChars / 1000) * COST_ELEVENLABS_PER_1000 + totalCalls * COST_LLM_PER_CALL),
        emergencyModeActive,
        callsTrend,
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get recent daily metric documents.
 * @param offsetDays - skip N days before the range (for trend comparison)
 */
async function getRecentDailyDocs(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    days: number,
    offsetDays: number = 0,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - offsetDays);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    const snap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('metrics_daily')
        .where('date', '>=', startStr)
        .where('date', '<=', endStr)
        .orderBy('date', 'desc')
        .get();

    return snap.docs;
}

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
