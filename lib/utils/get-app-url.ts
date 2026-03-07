/**
 * Runtime App URL Helper — v3
 *
 * Vercel does NOT inject NEXT_PUBLIC_* env vars or custom env vars reliably
 * into serverless function runtime. However, Vercel auto-sets several system
 * env vars including VERCEL_PROJECT_PRODUCTION_URL which contains the custom
 * domain (e.g., "callception.com") if configured.
 *
 * Priority chain:
 *   1. APP_URL                         (explicit override, if user sets it)
 *   2. VERCEL_PROJECT_PRODUCTION_URL   (auto-set by Vercel — custom domain!)
 *   3. NEXT_PUBLIC_APP_URL             (build-time inline — works locally)
 *   4. VERCEL_URL                      (deployment-specific preview URL)
 *   5. localhost fallback
 */

type UrlSource =
    | 'APP_URL'
    | 'VERCEL_PROJECT_PRODUCTION_URL'
    | 'NEXT_PUBLIC_APP_URL'
    | 'VERCEL_URL'
    | 'localhost_fallback';

export function getAppUrl(): string {
    // 1. Explicit override
    const appUrl = process.env.APP_URL;
    if (appUrl) return appUrl;

    // 2. Vercel auto-set production URL (includes custom domain like callception.com)
    const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodUrl) return prodUrl.startsWith('http') ? prodUrl : `https://${prodUrl}`;

    // 3. NEXT_PUBLIC variant (works locally via .env.local, inlined at build time)
    const publicUrl = process.env['NEXT_PUBLIC_APP_URL'];
    if (publicUrl) return publicUrl;

    // 4. Vercel deployment-specific URL (not custom domain)
    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) return `https://${vercelUrl}`;

    // 5. Local dev fallback
    return 'http://localhost:3000';
}

/**
 * Returns diagnostic info about which URL source is being used.
 */
export function getAppUrlDiagnostics(): { url: string; source: UrlSource } {
    const appUrl = process.env.APP_URL;
    if (appUrl) return { url: appUrl, source: 'APP_URL' };

    const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodUrl) {
        const url = prodUrl.startsWith('http') ? prodUrl : `https://${prodUrl}`;
        return { url, source: 'VERCEL_PROJECT_PRODUCTION_URL' };
    }

    const publicUrl = process.env['NEXT_PUBLIC_APP_URL'];
    if (publicUrl) return { url: publicUrl, source: 'NEXT_PUBLIC_APP_URL' };

    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) return { url: `https://${vercelUrl}`, source: 'VERCEL_URL' };

    return { url: 'http://localhost:3000', source: 'localhost_fallback' };
}
