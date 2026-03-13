/**
 * Voice Pipeline Logging & Metrics
 *
 * Provides structured logging and metrics tracking for voice API routes.
 */

// ─── Metric Names ───

export const METRICS = {
    API_REQUESTS: 'voice.api.requests',
    API_ERRORS: 'voice.api.errors',
    API_LATENCY: 'voice.api.latency_ms',
    SESSIONS_CREATED: 'voice.sessions.created',
    SESSIONS_ENDED: 'voice.sessions.ended',
    SESSIONS_ACTIVE: 'voice.sessions.active',
    RATE_LIMIT_EXCEEDED: 'voice.rate_limit.exceeded',
    STT_REQUESTS: 'voice.stt.requests',
    TTS_REQUESTS: 'voice.tts.requests',
    PIPELINE_REQUESTS: 'voice.pipeline.requests',
    LATENCY_MS: 'voice.latency_ms',
} as const;

// ─── In-memory Metrics Counter ───

const counters: Record<string, number> = {};

export const metrics = {
    increment(name: string, value = 1, tags?: Record<string, string>) {
        const key = tags ? `${name}:${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(',')}` : name;
        counters[key] = (counters[key] || 0) + value;
    },

    /** Set a gauge value (latest value wins) */
    set(name: string, value: number) {
        counters[name] = value;
    },

    /** Observe a value (histogram-like — stores latest for simplicity) */
    observe(name: string, value: number, tags?: Record<string, string>) {
        const key = tags ? `${name}:${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(',')}` : name;
        counters[key] = value;
    },

    get(name: string): number {
        return counters[name] || 0;
    },

    getAll(): Record<string, number> {
        return { ...counters };
    },

    reset() {
        Object.keys(counters).forEach(k => delete counters[k]);
    },
};

// ─── Structured Logger ───

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function formatLog(level: LogLevel, event: string, data?: unknown) {
    const entry = {
        level,
        event,
        timestamp: new Date().toISOString(),
        ...(data && typeof data === 'object' && !(data instanceof Error) ? data : { detail: data instanceof Error ? data.message : data }),
    };
    return entry;
}

export const voiceLogger = {
    debug(event: string, data?: unknown) {
        if (process.env.NODE_ENV === 'development') {
            console.debug('[Voice]', formatLog('debug', event, data));
        }
    },

    info(event: string, data?: unknown) {
        console.log('[Voice]', formatLog('info', event, data));
    },

    warn(event: string, data?: unknown) {
        console.warn('[Voice]', formatLog('warn', event, data));
    },

    error(event: string, data?: unknown) {
        console.error('[Voice]', formatLog('error', event, data));
    },
};

// ─── Timing Helper ───

export function withTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    return fn().finally(() => {
        const duration = Math.round(performance.now() - start);
        metrics.increment(METRICS.LATENCY_MS, duration, { operation: name });
        if (duration > 3000) {
            voiceLogger.warn('slow_operation', { name, durationMs: duration });
        }
    });
}
