/**
 * Monitoring & Error Tracking Utility
 *
 * Provides a unified interface for error tracking, performance monitoring,
 * and alerting. Integrates with @sentry/nextjs when DSN is configured,
 * falls back to console logging.
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

import * as Sentry from '@sentry/nextjs';

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

// Severity → Sentry level mapping
const SEVERITY_MAP: Record<ErrorSeverity, Sentry.SeverityLevel> = {
    low: 'info',
    medium: 'warning',
    high: 'error',
    critical: 'fatal',
};

// ─── In-memory metrics buffer ───

const metricsBuffer: PerformanceMetric[] = [];
const MAX_BUFFER_SIZE = 100;
const errorCounts: Record<string, number> = {};

// ─── Monitor Class ───

class Monitor {
    private initialized = false;
    private hasSentry = false;

    init() {
        this.hasSentry = !!process.env.NEXT_PUBLIC_SENTRY_DSN;
        this.initialized = true;

        if (this.hasSentry) {
            if (process.env.NODE_ENV !== 'production') console.debug('[Monitor] Sentry configured — errors will be reported');
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

        // Console log
        const message = error instanceof Error ? error.message : String(error);
        if (severity === 'critical' || severity === 'high') {
            console.error(`[Monitor:${severity.toUpperCase()}]`, message, context?.route || '');
        } else {
            console.warn(`[Monitor:${severity}]`, message, context?.route || '');
        }

        // Send to Sentry
        if (this.hasSentry) {
            Sentry.withScope((scope) => {
                scope.setLevel(SEVERITY_MAP[severity]);
                if (context?.route) scope.setTag('route', context.route);
                if (context?.context) scope.setTag('context', context.context);
                if (context?.userId) scope.setUser({ id: context.userId });
                if (context?.tenantId) scope.setTag('tenantId', context.tenantId);
                if (context?.extra) scope.setExtras(context.extra);

                if (error instanceof Error) {
                    Sentry.captureException(error);
                } else {
                    Sentry.captureMessage(String(error));
                }
            });
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

        // Send breadcrumb to Sentry
        if (this.hasSentry) {
            Sentry.addBreadcrumb({
                category: 'custom',
                message: name,
                data,
                level: 'info',
            });
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
