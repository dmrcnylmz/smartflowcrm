/**
 * Upstream Service Monitor — External API Call Tracking
 *
 * Tracks latency, error rates, and availability of external services
 * (Deepgram, OpenAI, Cartesia, Twilio, etc.) without external dependencies.
 *
 * In-memory ring buffer with configurable window size.
 * Used by /api/health to report service health alongside circuit breaker states.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServiceCallRecord {
    service: string;
    operation: string;
    durationMs: number;
    success: boolean;
    statusCode?: number;
    errorType?: string;
    timestamp: number;
}

export interface ServiceHealthSummary {
    service: string;
    totalCalls: number;
    successCount: number;
    errorCount: number;
    successRate: number;      // 0-100
    avgLatencyMs: number;
    p95LatencyMs: number;
    lastCallAt: string | null;
    lastError: string | null;
}

// ─── Ring Buffer ─────────────────────────────────────────────────────────────

const MAX_RECORDS = 500;
const records: ServiceCallRecord[] = [];

/**
 * Record an external service call outcome.
 * Fire-and-forget — never throws.
 */
export function recordServiceCall(record: Omit<ServiceCallRecord, 'timestamp'>): void {
    records.push({ ...record, timestamp: Date.now() });
    if (records.length > MAX_RECORDS) {
        records.splice(0, records.length - MAX_RECORDS);
    }
}

/**
 * Helper: Wrap an async external call with automatic monitoring.
 *
 * @example
 * const result = await withServiceMonitoring('deepgram', 'stt', async () => {
 *     return await deepgramClient.transcribe(audio);
 * });
 */
export async function withServiceMonitoring<T>(
    service: string,
    operation: string,
    fn: () => Promise<T>,
): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        recordServiceCall({
            service,
            operation,
            durationMs: Date.now() - start,
            success: true,
        });
        return result;
    } catch (error) {
        recordServiceCall({
            service,
            operation,
            durationMs: Date.now() - start,
            success: false,
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        });
        throw error;
    }
}

/**
 * Get health summary for all tracked services (or a specific one).
 * Only considers records within the specified time window.
 */
export function getServiceHealth(
    windowMs: number = 5 * 60 * 1000, // 5 minutes default
    serviceName?: string,
): ServiceHealthSummary[] {
    const cutoff = Date.now() - windowMs;
    const recent = records.filter(r =>
        r.timestamp >= cutoff &&
        (!serviceName || r.service === serviceName)
    );

    // Group by service
    const grouped = new Map<string, ServiceCallRecord[]>();
    for (const record of recent) {
        const list = grouped.get(record.service) || [];
        list.push(record);
        grouped.set(record.service, list);
    }

    const summaries: ServiceHealthSummary[] = [];
    for (const [service, serviceRecords] of grouped) {
        const total = serviceRecords.length;
        const successes = serviceRecords.filter(r => r.success).length;
        const errors = total - successes;
        const latencies = serviceRecords.map(r => r.durationMs).sort((a, b) => a - b);
        const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / total;
        const p95Index = Math.min(Math.floor(total * 0.95), total - 1);

        const lastRecord = serviceRecords[serviceRecords.length - 1];
        const lastErrorRecord = serviceRecords.filter(r => !r.success).pop();

        summaries.push({
            service,
            totalCalls: total,
            successCount: successes,
            errorCount: errors,
            successRate: total > 0 ? Math.round((successes / total) * 100) : 100,
            avgLatencyMs: Math.round(avgLatency),
            p95LatencyMs: latencies[p95Index] || 0,
            lastCallAt: lastRecord ? new Date(lastRecord.timestamp).toISOString() : null,
            lastError: lastErrorRecord?.errorType || null,
        });
    }

    return summaries.sort((a, b) => a.service.localeCompare(b.service));
}

/**
 * Get raw record count (for metrics/debugging).
 */
export function getRecordCount(): number {
    return records.length;
}

/**
 * Clear all records (for testing).
 */
export function clearRecords(): void {
    records.length = 0;
}
