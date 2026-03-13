import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Performance monitoring sample rate (10% of transactions)
    tracesSampleRate: 0.1,

    // Session replay for debugging user issues (1% of sessions, 100% on error)
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    // Environment tag
    environment: process.env.NODE_ENV,

    // Only send events in production
    enabled: process.env.NODE_ENV === 'production',

    // Filter out noisy errors
    ignoreErrors: [
        // Browser extensions
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        // Network errors
        'Failed to fetch',
        'NetworkError',
        'AbortError',
        // Auth redirects
        'NEXT_REDIRECT',
    ],
});
