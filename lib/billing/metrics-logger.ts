/**
 * Non-Blocking Metrics Logger — Fire-and-Forget Pipeline Metrics
 *
 * Logs per-call voice pipeline metrics to Firestore WITHOUT adding
 * latency to the voice pipeline itself.
 *
 * Architecture:
 * - In-memory buffer collects metrics
 * - Auto-flush every 30 seconds OR when buffer hits 10 entries
 * - Uses Firestore batch writes for efficiency
 * - Daily aggregate doc updated via FieldValue.increment() (atomic)
 * - All errors silently caught — metric logging NEVER breaks the pipeline
 *
 * Storage:
 * - Per-call: tenants/{tenantId}/call_metrics/{autoId}
 * - Daily:   tenants/{tenantId}/metrics_daily/{YYYY-MM-DD}
 */

import { FieldValue } from 'firebase-admin/firestore';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CallMetricRecord {
    sessionId: string;
    timestamp: Date;
    sttLatencyMs: number;
    llmLatencyMs: number;
    ttsLatencyMs: number;
    totalPipelineMs: number;
    sttProvider: string;
    llmProvider: string;
    ttsProvider: string;
    ttsModel: string;
    ttsCharCount: number;
    isGreeting: boolean;
    language: string;
    intent: string;
    cached: boolean;
}

export interface PartialMetric {
    tenantId: string;
    sessionId?: string;
    type: 'stt' | 'llm' | 'tts' | 'full_call';
    latencyMs: number;
    provider: string;
    model?: string;
    charCount?: number;
    isGreeting?: boolean;
    language?: string;
    intent?: string;
    cached?: boolean;
    extraData?: Record<string, unknown>;
}

interface BufferEntry {
    tenantId: string;
    data: Record<string, unknown>;
    dailyIncrements: Record<string, number>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BUFFER_SIZE_THRESHOLD = 10;
const FLUSH_INTERVAL_MS = 15_000; // 15 seconds (was 30s — reduced for less data loss risk)
const MAX_BUFFER_SIZE = 1000;      // Safety cap — drop old entries if exceeded (was 200)

// ─── Firestore singleton (lazy) ──────────────────────────────────────────────

let _db: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore {
    if (!_db) {
        initAdmin();
        _db = getFirestore();
    }
    return _db;
}

// ─── MetricsLogger Class ─────────────────────────────────────────────────────

class MetricsLogger {
    private buffer: BufferEntry[] = [];
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private flushing = false;

    constructor() {
        this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
        if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
            this.flushTimer.unref();
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Log a STT metric (fire-and-forget).
     */
    logSttMetric(tenantId: string, latencyMs: number, provider: string, sessionId?: string): void {
        this.pushToBuffer({
            tenantId,
            data: {
                type: 'stt',
                sessionId: sessionId || '',
                latencyMs: Math.round(latencyMs),
                provider,
                timestamp: new Date(),
            },
            dailyIncrements: {
                callCount: 0, // Don't increment call count for partial metrics
                totalSttMs: Math.round(latencyMs),
                sttCount: 1,
            },
        });
    }

    /**
     * Log a LLM metric (fire-and-forget).
     */
    logLlmMetric(
        tenantId: string,
        latencyMs: number,
        provider: string,
        sessionId?: string,
        intent?: string,
        cached?: boolean,
    ): void {
        this.pushToBuffer({
            tenantId,
            data: {
                type: 'llm',
                sessionId: sessionId || '',
                latencyMs: Math.round(latencyMs),
                provider,
                intent: intent || 'unknown',
                cached: cached || false,
                timestamp: new Date(),
            },
            dailyIncrements: {
                totalLlmMs: Math.round(latencyMs),
                llmCount: 1,
                ...(cached ? { cachedResponses: 1 } : {}),
                [`llmProvider_${provider}`]: 1,
            },
        });
    }

    /**
     * Log a TTS metric (fire-and-forget).
     */
    logTtsMetric(
        tenantId: string,
        latencyMs: number,
        provider: string,
        model: string,
        charCount: number,
        isGreeting: boolean,
        language?: string,
    ): void {
        this.pushToBuffer({
            tenantId,
            data: {
                type: 'tts',
                latencyMs: Math.round(latencyMs),
                provider,
                model,
                charCount,
                isGreeting,
                language: language || 'tr',
                timestamp: new Date(),
            },
            dailyIncrements: {
                totalTtsMs: Math.round(latencyMs),
                ttsCount: 1,
                totalTtsChars: charCount,
                [`ttsProvider_${provider}`]: 1,
                ...(isGreeting ? { greetingTtsCount: 1 } : { bodyTtsCount: 1 }),
            },
        });
    }

    /**
     * Log a full pipeline call metric (called at session end).
     * This represents the complete STT→LLM→TTS cycle.
     */
    logFullCallMetric(tenantId: string, metric: CallMetricRecord): void {
        this.pushToBuffer({
            tenantId,
            data: {
                type: 'full_call',
                ...metric,
                timestamp: metric.timestamp || new Date(),
            },
            dailyIncrements: {
                callCount: 1,
                totalPipelineMs: Math.round(metric.totalPipelineMs),
                totalSttMs: Math.round(metric.sttLatencyMs),
                totalLlmMs: Math.round(metric.llmLatencyMs),
                totalTtsMs: Math.round(metric.ttsLatencyMs),
                totalTtsChars: metric.ttsCharCount,
                [`sttProvider_${metric.sttProvider}`]: 1,
                [`llmProvider_${metric.llmProvider}`]: 1,
                [`ttsProvider_${metric.ttsProvider}`]: 1,
            },
        });
    }

    /**
     * Get buffer stats for monitoring.
     */
    getStats(): { bufferSize: number; isFlushing: boolean } {
        return {
            bufferSize: this.buffer.length,
            isFlushing: this.flushing,
        };
    }

    /**
     * Force flush (e.g., on shutdown).
     */
    async forceFlush(): Promise<void> {
        await this.flush();
    }

    /**
     * Destroy (for testing/shutdown).
     */
    destroy(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.buffer = [];
    }

    // ─── Internal ────────────────────────────────────────────────────────

    private pushToBuffer(entry: BufferEntry): void {
        // Safety cap: drop oldest if buffer too large
        if (this.buffer.length >= MAX_BUFFER_SIZE) {
            this.buffer.shift();
            // Log in production — this indicates a flush backlog
            console.warn(`[MetricsLogger] Buffer overflow (${MAX_BUFFER_SIZE}), dropping oldest entry`);
        }

        this.buffer.push(entry);

        // Auto-flush if buffer threshold reached
        if (this.buffer.length >= BUFFER_SIZE_THRESHOLD) {
            // Fire-and-forget — don't await
            this.flush().catch(() => {});
        }
    }

    private async flush(): Promise<void> {
        if (this.flushing || this.buffer.length === 0) return;

        this.flushing = true;
        const entries = [...this.buffer];
        this.buffer = [];

        try {
            const db = getDb();
            const batch = db.batch();
            const dailyUpdates: Map<string, Record<string, number>> = new Map();

            const today = getToday();

            for (const entry of entries) {
                // 1. Write per-call metric document
                const metricRef = db
                    .collection('tenants')
                    .doc(entry.tenantId)
                    .collection('call_metrics')
                    .doc(); // auto-ID

                batch.set(metricRef, {
                    ...entry.data,
                    createdAt: FieldValue.serverTimestamp(),
                });

                // 2. Accumulate daily increments per tenant
                const dailyKey = `${entry.tenantId}::${today}`;
                const existing = dailyUpdates.get(dailyKey) || {};
                for (const [field, value] of Object.entries(entry.dailyIncrements)) {
                    existing[field] = (existing[field] || 0) + value;
                }
                dailyUpdates.set(dailyKey, existing);
            }

            // 3. Apply daily aggregates (one update per tenant-day)
            for (const [key, increments] of dailyUpdates) {
                const [tenantId, date] = key.split('::');
                const dailyRef = db
                    .collection('tenants')
                    .doc(tenantId)
                    .collection('metrics_daily')
                    .doc(date);

                const updateData: Record<string, unknown> = {
                    date,
                    lastUpdated: FieldValue.serverTimestamp(),
                };

                for (const [field, value] of Object.entries(increments)) {
                    updateData[field] = FieldValue.increment(value);
                }

                batch.set(dailyRef, updateData, { merge: true });
            }

            await batch.commit();

            if (process.env.NODE_ENV === 'development') {
                console.debug(
                    `[MetricsLogger] Flushed ${entries.length} metrics, ` +
                    `${dailyUpdates.size} daily aggregates`
                );
            }
        } catch (error) {
            // NEVER throw — metrics logging must not break the pipeline.
            // Put entries back at the front of the buffer for retry.
            this.buffer = [...entries, ...this.buffer].slice(0, MAX_BUFFER_SIZE);

            // Always log flush failures — they indicate Firestore permission or network issues
            console.error(`[MetricsLogger] Flush failed (${entries.length} entries re-buffered):`,
                error instanceof Error ? error.message : error);
        } finally {
            this.flushing = false;
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToday(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const metricsLogger = new MetricsLogger();

// ─── Graceful Shutdown — flush buffer before process exits ──────────────────

if (typeof process !== 'undefined' && process.on) {
    const gracefulFlush = () => {
        if (metricsLogger.getStats().bufferSize > 0) {
            console.info(`[MetricsLogger] Graceful shutdown — flushing ${metricsLogger.getStats().bufferSize} buffered metrics...`);
            metricsLogger.forceFlush().catch(() => {
                console.error('[MetricsLogger] Graceful flush failed — metrics lost');
            });
        }
    };
    process.on('SIGTERM', gracefulFlush);
    process.on('SIGINT', gracefulFlush);
}
