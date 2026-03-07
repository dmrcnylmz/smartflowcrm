/**
 * Centralized Rate Limiter — Upstash Redis with in-memory fallback
 *
 * Uses Upstash Redis for distributed rate limiting in production.
 * Falls back to in-memory Map when UPSTASH_REDIS_REST_URL is not configured.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// --- In-Memory Fallback Store ---
const memoryStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup stale entries every 2 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of memoryStore) {
            if (now > entry.resetTime) memoryStore.delete(key);
        }
    }, 120_000);
}

function memoryRateLimit(
    key: string,
    limit: number,
    windowMs: number,
): { success: boolean; remaining: number; reset: number } {
    const now = Date.now();
    const entry = memoryStore.get(key);

    if (!entry || now > entry.resetTime) {
        memoryStore.set(key, { count: 1, resetTime: now + windowMs });
        return { success: true, remaining: limit - 1, reset: now + windowMs };
    }

    entry.count++;
    if (entry.count > limit) {
        return { success: false, remaining: 0, reset: entry.resetTime };
    }

    return { success: true, remaining: limit - entry.count, reset: entry.resetTime };
}

// --- Upstash Rate Limiters ---

let redis: Redis | null = null;

function getRedis(): Redis | null {
    if (redis) return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    redis = new Redis({ url, token });
    return redis;
}

// Pre-configured rate limit tiers
const limiters = new Map<string, Ratelimit>();

function getUpstashLimiter(tier: string, limit: number, windowSec: number): Ratelimit | null {
    const r = getRedis();
    if (!r) return null;

    const key = `${tier}:${limit}:${windowSec}`;
    if (!limiters.has(key)) {
        limiters.set(
            key,
            new Ratelimit({
                redis: r,
                limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
                prefix: `rl:${tier}`,
                analytics: true,
            }),
        );
    }
    return limiters.get(key)!;
}

// --- Public API ---

export interface RateLimitResult {
    success: boolean;
    remaining: number;
    reset: number;
    /** Whether Upstash was used (false = in-memory fallback) */
    distributed: boolean;
}

/**
 * Check rate limit for a given identifier.
 */
export async function checkRateLimit(
    identifier: string,
    options: { limit: number; windowSeconds: number; tier?: string },
): Promise<RateLimitResult> {
    const { limit, windowSeconds, tier = 'general' } = options;

    // Try Upstash first
    const upstash = getUpstashLimiter(tier, limit, windowSeconds);
    if (upstash) {
        try {
            const result = await upstash.limit(identifier);
            return {
                success: result.success,
                remaining: result.remaining,
                reset: result.reset,
                distributed: true,
            };
        } catch {
            // Fall through to in-memory on Upstash failure
        }
    }

    // In-memory fallback
    const result = memoryRateLimit(`${tier}:${identifier}`, limit, windowSeconds * 1000);
    return { ...result, distributed: false };
}

// --- Pre-configured tier helpers ---

/** General API rate limit: 100 req/min per IP */
export function checkGeneralLimit(ip: string) {
    return checkRateLimit(ip, { limit: 100, windowSeconds: 60, tier: 'api' });
}

/** Sensitive endpoint rate limit: 10 req/min per IP */
export function checkSensitiveLimit(ip: string) {
    return checkRateLimit(ip, { limit: 10, windowSeconds: 60, tier: 'sensitive' });
}

/** Per-tenant rate limit: 500 req/min */
export function checkTenantLimit(tenantId: string) {
    return checkRateLimit(tenantId, { limit: 500, windowSeconds: 60, tier: 'tenant' });
}

/** Voice inference rate limit: 30 req/min per IP */
export function checkInferenceLimit(ip: string) {
    return checkRateLimit(ip, { limit: 30, windowSeconds: 60, tier: 'inference' });
}
