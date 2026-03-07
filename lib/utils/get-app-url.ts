/**
 * Runtime App URL Helper
 *
 * IMPORTANT: Do NOT use `process.env.NEXT_PUBLIC_APP_URL` directly in server-side
 * API routes. Next.js inlines NEXT_PUBLIC_* values at BUILD TIME via webpack
 * DefinePlugin. If the env var wasn't set during build (or build cache is stale),
 * the value will be `undefined` even if it's set in Vercel Dashboard.
 *
 * This helper reads the env var at RUNTIME using dynamic property access,
 * bypassing Next.js build-time inlining.
 *
 * Priority: NEXT_PUBLIC_APP_URL → VERCEL_URL (with https) → localhost fallback
 */

const _APP_URL_KEY = 'NEXT_PUBLIC_APP_URL';
const _VERCEL_URL_KEY = 'VERCEL_URL';

export function getAppUrl(): string {
    // Dynamic key access prevents Next.js build-time replacement
    const explicit = process.env[_APP_URL_KEY];
    if (explicit) return explicit;

    const vercelUrl = process.env[_VERCEL_URL_KEY];
    if (vercelUrl) return `https://${vercelUrl}`;

    return 'http://localhost:3000';
}

/**
 * Returns the raw NEXT_PUBLIC_APP_URL value (or undefined) for diagnostics.
 * Also returns which source was used.
 */
export function getAppUrlDiagnostics(): {
    url: string;
    source: 'NEXT_PUBLIC_APP_URL' | 'VERCEL_URL' | 'localhost_fallback';
} {
    const explicit = process.env[_APP_URL_KEY];
    if (explicit) return { url: explicit, source: 'NEXT_PUBLIC_APP_URL' };

    const vercelUrl = process.env[_VERCEL_URL_KEY];
    if (vercelUrl) return { url: `https://${vercelUrl}`, source: 'VERCEL_URL' };

    return { url: 'http://localhost:3000', source: 'localhost_fallback' };
}
