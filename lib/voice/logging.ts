// Voice API Logging & Metrics
// Structured logging for production observability

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    service: string;
    action: string;
    sessionId?: string;
    userId?: string;
    duration_ms?: number;
    metadata?: Record<string, unknown>;
    error?: string;
}

// Structured logger
class VoiceLogger {
    private service: string;
    private enabled: boolean;

    constructor(service: string) {
        this.service = service;
        this.enabled = process.env.NODE_ENV !== 'test';
    }

    private log(level: LogLevel, action: string, data?: Partial<LogEntry>) {
        if (!this.enabled) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            action,
            ...data,
        };

        // JSON format for production log aggregation
        const output = JSON.stringify(entry);

        switch (level) {
            case 'debug':
                if (process.env.NODE_ENV === 'development') {
                    console.debug(output);
                }
                break;
            case 'info':
                console.info(output);
                break;
            case 'warn':
                console.warn(output);
                break;
            case 'error':
                console.error(output);
                break;
        }
    }

    debug(action: string, data?: Partial<LogEntry>) {
        this.log('debug', action, data);
    }

    info(action: string, data?: Partial<LogEntry>) {
        this.log('info', action, data);
    }

    warn(action: string, data?: Partial<LogEntry>) {
        this.log('warn', action, data);
    }

    error(action: string, error: Error | string, data?: Partial<LogEntry>) {
        this.log('error', action, {
            ...data,
            error: error instanceof Error ? error.message : error,
        });
    }
}

// Pre-configured loggers
export const voiceLogger = new VoiceLogger('voice-api');
export const sessionLogger = new VoiceLogger('voice-session');
export const inferenceLogger = new VoiceLogger('voice-inference');

// Metrics collector (in-memory, export to Prometheus/Datadog in production)
interface MetricPoint {
    value: number;
    timestamp: number;
    labels?: Record<string, string>;
}

class MetricsCollector {
    private counters: Map<string, number> = new Map();
    private gauges: Map<string, number> = new Map();
    private histograms: Map<string, number[]> = new Map();

    // Counter: monotonically increasing value
    increment(name: string, value: number = 1, labels?: Record<string, string>) {
        const key = this.buildKey(name, labels);
        this.counters.set(key, (this.counters.get(key) || 0) + value);
    }

    // Gauge: current value that can go up or down
    set(name: string, value: number, labels?: Record<string, string>) {
        const key = this.buildKey(name, labels);
        this.gauges.set(key, value);
    }

    // Histogram: distribution of values
    observe(name: string, value: number, labels?: Record<string, string>) {
        const key = this.buildKey(name, labels);
        const values = this.histograms.get(key) || [];
        values.push(value);

        // Keep last 1000 observations
        if (values.length > 1000) {
            values.shift();
        }

        this.histograms.set(key, values);
    }

    private buildKey(name: string, labels?: Record<string, string>): string {
        if (!labels) return name;
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelStr}}`;
    }

    // Get all metrics in Prometheus format
    getPrometheusMetrics(): string {
        const lines: string[] = [];

        // Counters
        for (const [key, value] of this.counters.entries()) {
            lines.push(`# TYPE ${key.split('{')[0]} counter`);
            lines.push(`${key} ${value}`);
        }

        // Gauges
        for (const [key, value] of this.gauges.entries()) {
            lines.push(`# TYPE ${key.split('{')[0]} gauge`);
            lines.push(`${key} ${value}`);
        }

        // Histograms (simplified as summary)
        for (const [key, values] of this.histograms.entries()) {
            const baseName = key.split('{')[0];
            const labels = key.includes('{') ? key.slice(key.indexOf('{')) : '';

            if (values.length === 0) continue;

            const sorted = [...values].sort((a, b) => a - b);
            const sum = values.reduce((a, b) => a + b, 0);
            const count = values.length;

            lines.push(`# TYPE ${baseName} summary`);
            lines.push(`${baseName}_sum${labels} ${sum}`);
            lines.push(`${baseName}_count${labels} ${count}`);
            lines.push(`${baseName}{quantile="0.5"${labels.slice(1) || '}'} ${sorted[Math.floor(count * 0.5)]}`);
            lines.push(`${baseName}{quantile="0.95"${labels.slice(1) || '}'} ${sorted[Math.floor(count * 0.95)]}`);
            lines.push(`${baseName}{quantile="0.99"${labels.slice(1) || '}'} ${sorted[Math.floor(count * 0.99)]}`);
        }

        return lines.join('\n');
    }

    // Get metrics as JSON
    getMetrics(): {
        counters: Record<string, number>;
        gauges: Record<string, number>;
        histograms: Record<string, { count: number; sum: number; p50: number; p95: number; p99: number }>;
    } {
        const histogramStats: Record<string, { count: number; sum: number; p50: number; p95: number; p99: number }> = {};

        for (const [key, values] of this.histograms.entries()) {
            if (values.length === 0) continue;

            const sorted = [...values].sort((a, b) => a - b);
            const count = values.length;

            histogramStats[key] = {
                count,
                sum: values.reduce((a, b) => a + b, 0),
                p50: sorted[Math.floor(count * 0.5)] || 0,
                p95: sorted[Math.floor(count * 0.95)] || 0,
                p99: sorted[Math.floor(count * 0.99)] || 0,
            };
        }

        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: histogramStats,
        };
    }
}

// Singleton metrics collector
export const metrics = new MetricsCollector();

// Common metric names
export const METRICS = {
    // Session metrics
    SESSIONS_CREATED: 'voice_sessions_created_total',
    SESSIONS_ENDED: 'voice_sessions_ended_total',
    SESSIONS_ACTIVE: 'voice_sessions_active',
    SESSION_DURATION: 'voice_session_duration_seconds',

    // Audio metrics
    AUDIO_CHUNKS_RECEIVED: 'voice_audio_chunks_received_total',
    AUDIO_CHUNKS_SENT: 'voice_audio_chunks_sent_total',
    AUDIO_LATENCY: 'voice_audio_latency_ms',

    // Inference metrics
    INFER_REQUESTS: 'voice_infer_requests_total',
    INFER_LATENCY: 'voice_infer_latency_ms',
    INFER_ERRORS: 'voice_infer_errors_total',

    // API metrics
    API_REQUESTS: 'voice_api_requests_total',
    API_LATENCY: 'voice_api_latency_ms',
    API_ERRORS: 'voice_api_errors_total',

    // Rate limiting
    RATE_LIMIT_EXCEEDED: 'voice_rate_limit_exceeded_total',
};

// Helper to time async operations
export async function withTiming<T>(
    metricName: string,
    fn: () => Promise<T>,
    labels?: Record<string, string>
): Promise<T> {
    const start = performance.now();
    try {
        return await fn();
    } finally {
        const duration = performance.now() - start;
        metrics.observe(metricName, duration, labels);
    }
}
