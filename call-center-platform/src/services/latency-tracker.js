/**
 * Latency Tracker — Phase 13 Ultra Low Latency Optimization
 * 
 * Per-stage stopwatch for voice pipeline:
 *   stt_ms  → Speech-to-Text latency
 *   llm_ms  → LLM generation latency 
 *   tts_ms  → Text-to-Speech latency
 *   total_ms → End-to-end response time
 * 
 * Records to metrics service histograms.
 * Provides waterfall breakdown per session.
 */
const metrics = require('./metrics.service');
const { logger: rootLogger } = require('../utils/logger');

const logger = rootLogger.child({ component: 'latency' });

// In-memory recent latency samples (circular buffer)
const BUFFER_SIZE = 1000;
let latencyBuffer = [];
let bufferIndex = 0;

class LatencyTracker {
    /**
     * Create a new pipeline trace for a single utterance.
     * @param {string} sessionId
     * @param {string} tenantId
     * @returns {PipelineTrace}
     */
    createTrace(sessionId, tenantId) {
        return new PipelineTrace(sessionId, tenantId);
    }

    /**
     * Get recent latency statistics.
     * @param {number} [windowMs=60000] - Time window in ms (default 1 min)
     * @returns {object} Aggregate stats
     */
    getStats(windowMs = 60000) {
        const cutoff = Date.now() - windowMs;
        const recent = latencyBuffer.filter(s => s.ts >= cutoff);

        if (recent.length === 0) {
            return {
                count: 0,
                stt: { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 },
                llm: { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 },
                tts: { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 },
                total: { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 },
                target_hit_rate: { first_byte_150ms: 0, e2e_600ms: 0 }
            };
        }

        const calcPercentiles = (values) => {
            if (values.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
            const sorted = [...values].sort((a, b) => a - b);
            const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length * 100) / 100;
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            return {
                avg, p50: Math.round(p50 * 100) / 100,
                p95: Math.round(p95 * 100) / 100,
                p99: Math.round(p99 * 100) / 100,
                min: Math.round(Math.min(...sorted) * 100) / 100,
                max: Math.round(Math.max(...sorted) * 100) / 100
            };
        };

        const sttVals = recent.map(s => s.stt_ms).filter(v => v > 0);
        const llmVals = recent.map(s => s.llm_ms).filter(v => v > 0);
        const ttsVals = recent.map(s => s.tts_ms).filter(v => v > 0);
        const totalVals = recent.map(s => s.total_ms).filter(v => v > 0);

        // Target hit rates
        const firstByte150 = ttsVals.filter(v => v <= 150).length / Math.max(ttsVals.length, 1);
        const e2e600 = totalVals.filter(v => v <= 600).length / Math.max(totalVals.length, 1);

        return {
            count: recent.length,
            window_ms: windowMs,
            stt: calcPercentiles(sttVals),
            llm: calcPercentiles(llmVals),
            tts: calcPercentiles(ttsVals),
            total: calcPercentiles(totalVals),
            target_hit_rate: {
                first_byte_150ms: Math.round(firstByte150 * 10000) / 100,
                e2e_600ms: Math.round(e2e600 * 10000) / 100
            }
        };
    }

    /**
     * Get recent latency samples (for charting).
     * @param {number} [limit=50]
     */
    getRecentSamples(limit = 50) {
        const sorted = [...latencyBuffer].sort((a, b) => b.ts - a.ts);
        return sorted.slice(0, limit);
    }

    /**
     * Reset buffer (for testing).
     */
    reset() {
        latencyBuffer = [];
        bufferIndex = 0;
    }
}

class PipelineTrace {
    constructor(sessionId, tenantId) {
        this.sessionId = sessionId;
        this.tenantId = tenantId;
        this._stages = {};
        this._startTime = performance.now();
        this._firstByteTime = null;
    }

    /**
     * Start timing a stage.
     * @param {'stt'|'llm'|'tts'|'intent'} stage
     */
    startStage(stage) {
        this._stages[stage] = { start: performance.now(), end: null, duration: 0 };
    }

    /**
     * End timing a stage.
     * @param {'stt'|'llm'|'tts'|'intent'} stage
     * @returns {number} Duration in ms
     */
    endStage(stage) {
        if (!this._stages[stage]) return 0;
        this._stages[stage].end = performance.now();
        this._stages[stage].duration = this._stages[stage].end - this._stages[stage].start;
        return Math.round(this._stages[stage].duration * 100) / 100;
    }

    /**
     * Mark first audio byte sent to client.
     */
    markFirstByte() {
        if (!this._firstByteTime) {
            this._firstByteTime = performance.now();
        }
    }

    /**
     * Finalize the trace and record metrics.
     * @returns {object} Trace summary
     */
    finalize() {
        const totalMs = performance.now() - this._startTime;
        const sttMs = this._stages.stt?.duration || 0;
        const llmMs = this._stages.llm?.duration || 0;
        const ttsMs = this._stages.tts?.duration || 0;
        const intentMs = this._stages.intent?.duration || 0;
        const firstByteMs = this._firstByteTime
            ? this._firstByteTime - this._startTime : totalMs;

        // Record to metrics histograms
        metrics.observe('pipeline_stt_ms', sttMs, { tenant: this.tenantId });
        metrics.observe('pipeline_llm_ms', llmMs, { tenant: this.tenantId });
        metrics.observe('pipeline_tts_ms', ttsMs, { tenant: this.tenantId });
        metrics.observe('pipeline_total_ms', totalMs, { tenant: this.tenantId });
        metrics.observe('pipeline_first_byte_ms', firstByteMs, { tenant: this.tenantId });
        metrics.observe('pipeline_intent_ms', intentMs, { tenant: this.tenantId });

        const summary = {
            ts: Date.now(),
            sessionId: this.sessionId,
            tenantId: this.tenantId,
            stt_ms: Math.round(sttMs * 100) / 100,
            llm_ms: Math.round(llmMs * 100) / 100,
            tts_ms: Math.round(ttsMs * 100) / 100,
            intent_ms: Math.round(intentMs * 100) / 100,
            first_byte_ms: Math.round(firstByteMs * 100) / 100,
            total_ms: Math.round(totalMs * 100) / 100
        };

        // Store in circular buffer
        if (latencyBuffer.length < BUFFER_SIZE) {
            latencyBuffer.push(summary);
        } else {
            latencyBuffer[bufferIndex % BUFFER_SIZE] = summary;
        }
        bufferIndex++;

        // Log if exceeding targets
        if (totalMs > 600) {
            logger.warn('E2E latency exceeded 600ms target', summary);
        }

        return summary;
    }
}

module.exports = new LatencyTracker();
