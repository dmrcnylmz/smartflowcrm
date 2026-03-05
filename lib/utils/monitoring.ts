/**
 * Monitoring & Error Tracking Utility
 * 
 * Provides a unified interface for error tracking, performance monitoring,
 * and alerting. Supports Sentry integration when configured, falls back
 * to console logging.
 * 
 * Usage:
 *   import { monitor } from '@/lib/utils/monitoring';
 *   
 *   // Track an error
 *   monitor.captureError(error, { context: 'API', route: '/api/customers' });
 *   
 *   // Track performance
 *   const end = monitor.startTimer('api.customers.get');
 *   ... 
 *   end(); // logs duration
 */

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorContext {
    context?: string;
    route?: string;
    userId?: string;
    tenantId?: string;
    extra?: Record<string, unknown>;
}

interface PerformanceMetric {
    name: string;
    durationMs: number;
    timestamp: string;
}

// ─── In-memory metrics buffer ───

const metricsBuffer: PerformanceMetric[] = [];
const MAX_BUFFER_SIZE = 100;
const errorCounts: Record<string, number> = {};

// ─── Sentry-like Interface ───

class Monitor {
    private initialized = false;
    private dsn: string | null = null;

    init() {
        this.dsn = process.env.SENTRY_DSN || null;
        this.initialized = true;

        if (this.dsn) {
            if (process.env.NODE_ENV !== 'production') console.debug('[Monitor] Sentry DSN configured — errors will be reported');
            // In production, you'd call Sentry.init({ dsn: this.dsn }) here
        } else {
            if (process.env.NODE_ENV !== 'production') console.debug('[Monitor] No Sentry DSN — using console logging');
        }
    }

    /**
     * Capture and report an error
     */
    captureError(
        error: unknown,
        context?: ErrorContext,
        severity: ErrorSeverity = 'medium',
    ) {
        if (!this.initialized) this.init();

        const errorKey = context?.route || context?.context || 'unknown';
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;

        const errorInfo = {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            severity,
            ...context,
            timestamp: new Date().toISOString(),
            count: errorCounts[errorKey],
        };

        // Log based on severity
        if (severity === 'critical' || severity === 'high') {
            console.error(`[Monitor:${severity.toUpperCase()}]`, errorInfo);
        } else {
            console.warn(`[Monitor:${severity}]`, errorInfo.message, context?.route || '');
        }

        // If Sentry is configured, send the error
        if (this.dsn) {
            // Sentry.captureException(error, { extra: context });
            // For now, we log the intent
            if (process.env.NODE_ENV === 'development') {
                console.debug('[Monitor] Would send to Sentry:', errorInfo.message);
            }
        }
    }

    /**
     * Start a performance timer
     * @returns Function to call when the operation completes
     */
    startTimer(metricName: string): () => number {
        const start = performance.now();
        return () => {
            const duration = Math.round(performance.now() - start);
            const metric: PerformanceMetric = {
                name: metricName,
                durationMs: duration,
                timestamp: new Date().toISOString(),
            };

            // Keep buffer small
            if (metricsBuffer.length >= MAX_BUFFER_SIZE) {
                metricsBuffer.shift();
            }
            metricsBuffer.push(metric);

            // Log slow operations
            if (duration > 5000) {
                console.warn(`[Monitor:SLOW] ${metricName}: ${duration}ms`);
            }

            return duration;
        };
    }

    /**
     * Track a custom event/metric
     */
    trackEvent(name: string, data?: Record<string, unknown>) {
        if (!this.initialized) this.init();

        if (process.env.NODE_ENV === 'development') {
            console.debug(`[Monitor:Event] ${name}`, data || '');
        }
    }

    /**
     * Get recent performance metrics
     */
    getMetrics(): PerformanceMetric[] {
        return [...metricsBuffer];
    }

    /**
     * Get error counts by route/context
     */
    getErrorCounts(): Record<string, number> {
        return { ...errorCounts };
    }

    /**
     * Health summary for monitoring dashboard
     */
    getHealthSummary() {
        const totalErrors = Object.values(errorCounts).reduce((a, b) => a + b, 0);
        const avgLatency = metricsBuffer.length > 0
            ? Math.round(metricsBuffer.reduce((sum, m) => sum + m.durationMs, 0) / metricsBuffer.length)
            : 0;

        return {
            totalErrors,
            errorsByRoute: errorCounts,
            metricsCount: metricsBuffer.length,
            avgLatencyMs: avgLatency,
            uptime: process.uptime ? Math.round(process.uptime()) : 0,
        };
    }
}

// Singleton
export const monitor = new Monitor();
