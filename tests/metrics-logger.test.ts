/**
 * MetricsLogger Tests — Non-Blocking Metrics Buffer & Firestore Flush
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── Firestore mocks ──
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockDoc = vi.fn().mockReturnValue({ id: 'auto-id' });
const mockCollection = vi.fn();

const mockDb = {
    collection: mockCollection,
    batch: vi.fn(() => mockBatch),
};

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
        increment: vi.fn((n: number) => ({ _increment: n })),
    },
}));

// ── Helper: configure collection mock ──
function setupCollectionMock() {
    mockCollection.mockImplementation(() => {
        return {
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockReturnValue({
                    doc: mockDoc,
                }),
            }),
        };
    });
}

// ── Helper: create a full CallMetricRecord ──
function makeCallMetricRecord(overrides: Record<string, unknown> = {}) {
    return {
        sessionId: 'sess-1',
        timestamp: new Date('2026-03-09T12:00:00Z'),
        sttLatencyMs: 100,
        llmLatencyMs: 200,
        ttsLatencyMs: 150,
        totalPipelineMs: 450,
        sttProvider: 'deepgram',
        llmProvider: 'openai',
        ttsProvider: 'elevenlabs',
        ttsModel: 'turbo-v2',
        ttsCharCount: 80,
        isGreeting: false,
        language: 'tr',
        intent: 'appointment',
        cached: false,
        ...overrides,
    };
}

describe('MetricsLogger', () => {
    let metricsLogger: any;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.resetModules();
        setupCollectionMock();

        // Reset mockBatchCommit to default resolved behavior
        mockBatchCommit.mockResolvedValue(undefined);

        const mod = await import('@/lib/billing/metrics-logger');
        metricsLogger = mod.metricsLogger;
    });

    afterEach(() => {
        metricsLogger?.destroy();
        vi.useRealTimers();
    });

    // ─── Buffer & Logging ────────────────────────────────────────────────

    describe('Buffer & Logging', () => {
        it('logSttMetric adds entry to buffer', () => {
            metricsLogger.logSttMetric('tenant-1', 150, 'deepgram');
            expect(metricsLogger.getStats().bufferSize).toBe(1);
        });

        it('logLlmMetric adds entry with intent and cached', async () => {
            metricsLogger.logLlmMetric('tenant-1', 200, 'openai', 'sess-1', 'appointment', true);
            expect(metricsLogger.getStats().bufferSize).toBe(1);

            // Flush and inspect data written
            await metricsLogger.forceFlush();

            const setCallData = mockBatchSet.mock.calls[0][1];
            expect(setCallData).toMatchObject({
                type: 'llm',
                provider: 'openai',
                intent: 'appointment',
                cached: true,
                sessionId: 'sess-1',
            });
        });

        it('logTtsMetric adds entry with charCount and provider-keyed daily increment', async () => {
            metricsLogger.logTtsMetric('tenant-1', 300, 'elevenlabs', 'turbo-v2', 42, false);
            await metricsLogger.forceFlush();

            // Daily aggregate set call is the second batch.set call
            const dailySetCall = mockBatchSet.mock.calls[1];
            const dailyData = dailySetCall[1];

            // Should contain ttsProvider_ keyed increment
            expect(dailyData).toHaveProperty('ttsProvider_elevenlabs');
            expect(dailyData.totalTtsChars).toEqual({ _increment: 42 });
        });

        it('logFullCallMetric adds entry with callCount increment', async () => {
            const record = makeCallMetricRecord();
            metricsLogger.logFullCallMetric('tenant-1', record);
            await metricsLogger.forceFlush();

            // Daily aggregate should have callCount: 1
            const dailySetCall = mockBatchSet.mock.calls[1];
            const dailyData = dailySetCall[1];
            expect(dailyData.callCount).toEqual({ _increment: 1 });
        });

        it('getStats returns buffer size and flushing state', () => {
            const stats = metricsLogger.getStats();
            expect(stats).toEqual({ bufferSize: 0, isFlushing: false });
        });

        it('buffer drops oldest when MAX_BUFFER_SIZE exceeded', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // Start a flush that never resolves — this locks flushing=true
            // so auto-flush at threshold is skipped, entries stay in buffer
            metricsLogger.logSttMetric('tenant-1', 1, 'deepgram');
            mockBatchCommit.mockImplementation(() => new Promise(() => {})); // never resolves
            metricsLogger.forceFlush(); // sets flushing=true; buffer cleared to entries local var

            // Now flushing=true, buffer is empty.
            // Add 1001 entries — auto-flush will be called at threshold but
            // flush() returns early because flushing is true.
            for (let i = 0; i < 1001; i++) {
                metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            }

            // Buffer should be capped at 1000 (overflow drops oldest)
            expect(metricsLogger.getStats().bufferSize).toBe(1000);
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('latencyMs is rounded to integer', async () => {
            metricsLogger.logSttMetric('tenant-1', 123.456, 'deepgram');
            await metricsLogger.forceFlush();

            const setCallData = mockBatchSet.mock.calls[0][1];
            expect(setCallData.latencyMs).toBe(123);
        });

        it('default language is tr for TTS when not specified', async () => {
            metricsLogger.logTtsMetric('tenant-1', 200, 'elevenlabs', 'turbo-v2', 50, false);
            await metricsLogger.forceFlush();

            const setCallData = mockBatchSet.mock.calls[0][1];
            expect(setCallData.language).toBe('tr');
        });
    });

    // ─── Flush ───────────────────────────────────────────────────────────

    describe('Flush', () => {
        it('forceFlush writes all buffered entries to Firestore', async () => {
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            metricsLogger.logSttMetric('tenant-1', 120, 'deepgram');
            metricsLogger.logSttMetric('tenant-2', 130, 'whisper');
            await metricsLogger.forceFlush();

            // 3 per-call docs + 2 daily aggregates (tenant-1 and tenant-2)
            expect(mockBatchSet).toHaveBeenCalledTimes(5);
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
        });

        it('flush creates per-call metric documents under tenants/{tenantId}/call_metrics', async () => {
            metricsLogger.logSttMetric('tenant-abc', 100, 'deepgram');
            await metricsLogger.forceFlush();

            // Verify collection chain: tenants -> doc(tenantId) -> call_metrics -> doc()
            expect(mockCollection).toHaveBeenCalledWith('tenants');
            const tenantDocFn = mockCollection.mock.results[0].value.doc;
            expect(tenantDocFn).toHaveBeenCalledWith('tenant-abc');

            const subCollectionFn = tenantDocFn.mock.results[0].value.collection;
            expect(subCollectionFn).toHaveBeenCalledWith('call_metrics');
        });

        it('flush creates daily aggregate documents with merge option', async () => {
            metricsLogger.logSttMetric('tenant-abc', 100, 'deepgram');
            await metricsLogger.forceFlush();

            // Second batch.set call is the daily aggregate, should have merge: true
            const dailySetCall = mockBatchSet.mock.calls[1];
            expect(dailySetCall[2]).toEqual({ merge: true });
        });

        it('flush aggregates daily increments per tenant across multiple entries', async () => {
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            metricsLogger.logSttMetric('tenant-1', 200, 'deepgram');
            await metricsLogger.forceFlush();

            // Two per-call docs + 1 daily aggregate (same tenant, same day)
            expect(mockBatchSet).toHaveBeenCalledTimes(3);

            // Daily aggregate should have summed values
            const dailyData = mockBatchSet.mock.calls[2][1];
            expect(dailyData.totalSttMs).toEqual({ _increment: 300 });
            expect(dailyData.sttCount).toEqual({ _increment: 2 });
        });

        it('flush clears buffer after successful write', async () => {
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            expect(metricsLogger.getStats().bufferSize).toBe(1);
            await metricsLogger.forceFlush();
            expect(metricsLogger.getStats().bufferSize).toBe(0);
        });

        it('flush re-buffers entries on Firestore error', async () => {
            mockBatchCommit.mockRejectedValueOnce(new Error('Firestore write failed'));
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            metricsLogger.logSttMetric('tenant-1', 200, 'deepgram');
            expect(metricsLogger.getStats().bufferSize).toBe(2);

            await metricsLogger.forceFlush();

            // Entries should be re-buffered
            expect(metricsLogger.getStats().bufferSize).toBe(2);
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it('concurrent flush prevented by flushing flag', async () => {
            // Make commit hang so the first flush stays in progress
            let resolveCommit: (() => void) | undefined;
            mockBatchCommit.mockImplementationOnce(
                () => new Promise<void>((resolve) => { resolveCommit = resolve; }),
            );

            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');

            // Start first flush (won't resolve yet)
            const flush1 = metricsLogger.forceFlush();

            // Second entry + second flush should be no-op because flushing is true
            metricsLogger.logSttMetric('tenant-1', 200, 'deepgram');
            const flush2 = metricsLogger.forceFlush();

            // Let first flush complete
            resolveCommit!();
            await flush1;
            await flush2;

            // batch.commit was only called once (second flush was skipped)
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);

            // The second entry is still in the buffer because flush2 was a no-op
            expect(metricsLogger.getStats().bufferSize).toBe(1);
        });

        it('auto-flush triggers when buffer hits threshold of 10', async () => {
            // Add 9 entries — should NOT trigger flush yet
            for (let i = 0; i < 9; i++) {
                metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            }
            expect(mockBatchCommit).not.toHaveBeenCalled();

            // 10th entry triggers auto-flush
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');

            // flush is fire-and-forget, need to allow microtasks to run
            await vi.advanceTimersByTimeAsync(0);

            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
            expect(metricsLogger.getStats().bufferSize).toBe(0);
        });
    });

    // ─── Lifecycle ───────────────────────────────────────────────────────

    describe('Lifecycle', () => {
        it('destroy clears timer and buffer', () => {
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            metricsLogger.logSttMetric('tenant-1', 200, 'deepgram');
            expect(metricsLogger.getStats().bufferSize).toBe(2);

            metricsLogger.destroy();

            expect(metricsLogger.getStats().bufferSize).toBe(0);
        });

        it('timer auto-flush fires every 15 seconds', async () => {
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            expect(mockBatchCommit).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(15_000);

            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
            expect(metricsLogger.getStats().bufferSize).toBe(0);
        });

        it('timer does not flush when buffer is empty', async () => {
            await vi.advanceTimersByTimeAsync(15_000);
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        it('handles missing sessionId gracefully', async () => {
            // Log without sessionId — should not throw
            metricsLogger.logSttMetric('tenant-1', 100, 'deepgram');
            await metricsLogger.forceFlush();

            const setCallData = mockBatchSet.mock.calls[0][1];
            expect(setCallData.sessionId).toBe('');
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
        });
    });
});
