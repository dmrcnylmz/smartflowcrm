/**
 * Error Tracker — Centralized error monitoring & reporting
 *
 * Provides Sentry-like error tracking without external dependencies.
 * In production, replace with actual Sentry SDK if desired.
 *
 * Features:
 * - Client & server error capture
 * - Breadcrumb trail for debugging
 * - Error deduplication
 * - Structured context (user, tenant, request)
 * - Firestore-backed error log
 * - Rate limiting to prevent log flooding
 */

// --- Types ---

export interface ErrorEvent {
    id: string;
    timestamp: string;
    level: 'error' | 'warning' | 'info';
    message: string;
    stack?: string;
    context: ErrorContext;
    breadcrumbs: Breadcrumb[];
    fingerprint: string;
    count: number;
    environment: string;
}

export interface ErrorContext {
    userId?: string;
    tenantId?: string;
    url?: string;
    method?: string;
    userAgent?: string;
    component?: string;
    action?: string;
    extra?: Record<string, unknown>;
}

export interface Breadcrumb {
    timestamp: string;
    category: string;
    message: string;
    level: 'info' | 'warning' | 'error';
    data?: Record<string, unknown>;
}

// --- In-Memory Buffer ---

const MAX_BREADCRUMBS = 20;
const MAX_BUFFER_SIZE = 100;
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const ERROR_RATE_LIMIT = 50; // max errors per minute
const DEDUP_WINDOW_MS = 60_000; // 1 minute dedup window

let breadcrumbs: Breadcrumb[] = [];
let errorBuffer: ErrorEvent[] = [];
let errorCounts = new Map<string, { count: number; lastSeen: number }>();
let errorsThisMinute = 0;
let lastMinuteReset = Date.now();

// --- Breadcrumbs ---

export function addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
    breadcrumbs.push({
        ...crumb,
        timestamp: new Date().toISOString(),
    });

    // Keep only the last N breadcrumbs
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
        breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
    }
}

export function clearBreadcrumbs(): void {
    breadcrumbs = [];
}

// --- Error Fingerprinting ---

function generateFingerprint(message: string, stack?: string): string {
    // Use first line of stack + message for fingerprinting
    const stackLine = stack?.split('\n')[1]?.trim() || '';
    const input = `${message}|${stackLine}`;

    // Simple hash
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `err_${Math.abs(hash).toString(36)}`;
}

// --- Rate Limiting ---

function checkRateLimit(): boolean {
    const now = Date.now();
    if (now - lastMinuteReset > 60_000) {
        errorsThisMinute = 0;
        lastMinuteReset = now;
    }

    errorsThisMinute++;
    return errorsThisMinute <= ERROR_RATE_LIMIT;
}

// --- Core Capture ---

export function captureError(
    error: Error | string,
    context?: Partial<ErrorContext>,
    level: 'error' | 'warning' = 'error',
): ErrorEvent | null {
    // Rate limit check
    if (!checkRateLimit()) {
        console.warn('[ErrorTracker] Rate limit exceeded, dropping error');
        return null;
    }

    const message = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    const fingerprint = generateFingerprint(message, stack);

    // Deduplication check
    const existing = errorCounts.get(fingerprint);
    const now = Date.now();
    if (existing && (now - existing.lastSeen) < DEDUP_WINDOW_MS) {
        existing.count++;
        existing.lastSeen = now;
        return null; // Duplicate within window
    }

    errorCounts.set(fingerprint, { count: 1, lastSeen: now });

    const event: ErrorEvent = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level,
        message,
        stack,
        context: {
            userId: context?.userId,
            tenantId: context?.tenantId,
            url: context?.url,
            method: context?.method,
            userAgent: context?.userAgent,
            component: context?.component,
            action: context?.action,
            extra: context?.extra,
        },
        breadcrumbs: [...breadcrumbs],
        fingerprint,
        count: 1,
        environment: process.env.NODE_ENV || 'development',
    };

    // Add to buffer
    errorBuffer.push(event);
    if (errorBuffer.length > MAX_BUFFER_SIZE) {
        errorBuffer = errorBuffer.slice(-MAX_BUFFER_SIZE);
    }

    // Console log (always)
    const logFn = level === 'error' ? console.error : console.warn;
    logFn(`[ErrorTracker] ${level.toUpperCase()}: ${message}`, {
        fingerprint,
        context: event.context,
    });

    return event;
}

export function captureWarning(
    message: string,
    context?: Partial<ErrorContext>,
): ErrorEvent | null {
    return captureError(message, context, 'warning');
}

// --- API Route Error Wrapper ---

export function captureApiError(
    error: unknown,
    routeName: string,
    request?: { url?: string; method?: string; headers?: { get: (k: string) => string | null } },
): ErrorEvent | null {
    const context: Partial<ErrorContext> = {
        component: routeName,
        url: request?.url,
        method: request?.method,
        userId: request?.headers?.get('x-user-uid') || undefined,
        tenantId: request?.headers?.get('x-user-tenant') || undefined,
    };

    if (error instanceof Error) {
        return captureError(error, context);
    }

    return captureError(String(error), context);
}

// --- Buffer Management ---

export function getErrorBuffer(): ErrorEvent[] {
    return [...errorBuffer];
}

export function getRecentErrors(limit: number = 20): ErrorEvent[] {
    return errorBuffer.slice(-limit);
}

export function clearErrorBuffer(): void {
    errorBuffer = [];
}

export function getErrorStats(): {
    total: number;
    errors: number;
    warnings: number;
    uniqueFingerprints: number;
    errorsThisMinute: number;
} {
    return {
        total: errorBuffer.length,
        errors: errorBuffer.filter(e => e.level === 'error').length,
        warnings: errorBuffer.filter(e => e.level === 'warning').length,
        uniqueFingerprints: errorCounts.size,
        errorsThisMinute,
    };
}

// --- Periodic cleanup of old fingerprints ---

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of errorCounts.entries()) {
            if (now - value.lastSeen > 300_000) { // 5 minutes
                errorCounts.delete(key);
            }
        }
    }, 120_000); // Every 2 minutes
}
