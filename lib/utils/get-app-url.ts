/**
 * Runtime App URL Helper
 *
 * IMPORTANT: Vercel does NOT inject NEXT_PUBLIC_* env vars into serverless
 * function runtime — they are only available at BUILD TIME via webpack
 * DefinePlugin inlining. This means `process.env.NEXT_PUBLIC_APP_URL` or
 * even `process.env['NEXT_PUBLIC_APP_URL']` will be `undefined` in API routes.
 *
 * Solution: Use a server-side env var `APP_URL` for runtime access.
 * In Vercel Dashboard, add: APP_URL = https://callception.com
 *
 * Priority chain:
 *   1. APP_URL           (server-side, runtime — recommended for Vercel)
 *   2. NEXT_PUBLIC_APP_URL (build-time inline — works locally, not on Vercel runtime)
 *   3. VERCEL_URL         (auto-set by Vercel — deployment-specific URL)
 *   4. localhost fallback
 */

export function getAppUrl(): string {
    // 1. Server-side env var (works on Vercel runtime)
    const serverUrl = process.env.APP_URL;
    if (serverUrl) return serverUrl;

    // 2. NEXT_PUBLIC variant (works locally, may be inlined at build time)
    const publicUrl = process.env['NEXT_PUBLIC_APP_URL'];
    if (publicUrl) return publicUrl;

    // 3. Vercel auto-set URL (deployment-specific, not custom domain)
    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) return `https://${vercelUrl}`;

    // 4. Local development fallback
    return 'http://localhost:3000';
}

/**
 * Returns diagnostic info about which URL source is being used.
 * Used by go-live-check to show clear warnings.
 */
export function getAppUrlDiagnostics(): {
    url: string;
    source: 'APP_URL' | 'NEXT_PUBLIC_APP_URL' | 'VERCEL_URL' | 'localhost_fallback';
} {
    const serverUrl = process.env.APP_URL;
    if (serverUrl) return { url: serverUrl, source: 'APP_URL' };

    const publicUrl = process.env['NEXT_PUBLIC_APP_URL'];
    if (publicUrl) return { url: publicUrl, source: 'NEXT_PUBLIC_APP_URL' };

    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) return { url: `https://${vercelUrl}`, source: 'VERCEL_URL' };

    return { url: 'http://localhost:3000', source: 'localhost_fallback' };
}
