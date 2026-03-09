/**
 * Cache-Control Presets
 *
 * Standardized cache policies for API responses.
 * Use these instead of inline cache strings for consistency.
 *
 * Presets:
 *   NO_CACHE  → health, GDPR, auth — never cache
 *   SHORT     → data reads (dashboard, metrics, billing) — edge 10s, revalidate 30s
 *   MEDIUM    → config, settings, agents — 30s, revalidate 60s
 *   LONG      → reports, analytics — 60s, revalidate 120s
 */

export const CACHE_PRESETS = {
    /** No caching — health, GDPR, auth, TTS streams */
    NO_CACHE: 'no-store, no-cache, must-revalidate',

    /** Short-lived — dashboard, metrics, billing usage, compliance */
    SHORT: 'private, max-age=0, s-maxage=10, stale-while-revalidate=30',

    /** Medium — config, settings, agents, tenant data, members */
    MEDIUM: 'private, max-age=30, stale-while-revalidate=60',

    /** Long — reports (daily, weekly, monthly, custom), feedback, voice metrics */
    LONG: 'private, max-age=60, stale-while-revalidate=120',
} as const;

export type CachePreset = keyof typeof CACHE_PRESETS;

/**
 * Returns a headers object with the Cache-Control header set.
 * Convenient for spreading into NextResponse.json options.
 *
 * @example
 * return NextResponse.json(data, { headers: cacheHeaders('SHORT') });
 */
export function cacheHeaders(preset: CachePreset): Record<string, string> {
    return { 'Cache-Control': CACHE_PRESETS[preset] };
}
