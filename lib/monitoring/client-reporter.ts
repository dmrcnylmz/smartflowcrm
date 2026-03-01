'use client';

/**
 * Client-Side Error Reporter
 *
 * Hooks into window.onerror and unhandledrejection events
 * to capture all client-side errors and forward them to the monitoring API.
 */

let initialized = false;

export function initClientErrorReporting(): void {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    // Catch unhandled errors
    window.addEventListener('error', (event) => {
        reportClientError({
            message: event.message || 'Unknown error',
            stack: event.error?.stack,
            component: 'window.onerror',
            url: event.filename || window.location.href,
            extra: {
                lineno: event.lineno,
                colno: event.colno,
            },
        });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        reportClientError({
            message: reason?.message || String(reason) || 'Unhandled promise rejection',
            stack: reason?.stack,
            component: 'unhandledrejection',
            url: window.location.href,
        });
    });

    // Catch fetch/API errors for monitoring
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        try {
            const response = await originalFetch(...args);

            // Log 5xx server errors
            if (response.status >= 500) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
                reportClientError({
                    message: `API Error ${response.status}: ${url}`,
                    component: 'fetch_interceptor',
                    url,
                    extra: { status: response.status, statusText: response.statusText },
                });
            }

            return response;
        } catch (error) {
            // Network errors
            const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
            // Don't report monitoring endpoint errors (prevent loops)
            if (!url.includes('/api/monitoring')) {
                reportClientError({
                    message: `Network Error: ${url} - ${error instanceof Error ? error.message : String(error)}`,
                    stack: error instanceof Error ? error.stack : undefined,
                    component: 'fetch_interceptor',
                    url,
                });
            }
            throw error;
        }
    };

    if (process.env.NODE_ENV !== 'production') console.debug('[ErrorReporter] Client-side error reporting initialized');
}

// --- Report Error ---

async function reportClientError(params: {
    message: string;
    stack?: string;
    component?: string;
    action?: string;
    url?: string;
    extra?: Record<string, unknown>;
}): Promise<void> {
    try {
        // Don't report monitoring errors (prevent infinite loops)
        if (params.url?.includes('/api/monitoring')) return;

        await fetch('/api/monitoring/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...params,
                userAgent: navigator.userAgent,
            }),
        });
    } catch {
        // Silently fail
    }
}

// --- Manual Error Reporting ---

export function reportError(
    error: Error | string,
    context?: { component?: string; action?: string; extra?: Record<string, unknown> },
): void {
    const message = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;

    reportClientError({
        message,
        stack,
        component: context?.component,
        action: context?.action,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        extra: context?.extra,
    });
}
