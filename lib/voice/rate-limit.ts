// Rate Limiting Middleware for Voice API
// Uses sliding window algorithm with Redis-compatible in-memory fallback

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
    windowMs: number;       // Time window in milliseconds
    maxRequests: number;    // Max requests per window
    keyGenerator?: (req: NextRequest) => string;
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// In-memory store (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Cleanup every minute

// Default key generator: IP-based
function defaultKeyGenerator(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    return `rate_limit:${ip}`;
}

// Rate limit check
export function checkRateLimit(
    req: NextRequest,
    config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
    const key = (config.keyGenerator || defaultKeyGenerator)(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Create new entry if doesn't exist or expired
    if (!entry || entry.resetTime < now) {
        entry = {
            count: 0,
            resetTime: now + config.windowMs,
        };
        rateLimitStore.set(key, entry);
    }

    // Increment count
    entry.count++;

    return {
        allowed: entry.count <= config.maxRequests,
        remaining: Math.max(0, config.maxRequests - entry.count),
        resetTime: entry.resetTime,
    };
}

// Rate limit response headers
export function getRateLimitHeaders(
    remaining: number,
    resetTime: number,
    limit: number
): Record<string, string> {
    return {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
    };
}

// Create rate limited response
export function rateLimitExceeded(resetTime: number): NextResponse {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

    return NextResponse.json(
        {
            error: 'Rate limit exceeded',
            message: 'Çok fazla istek gönderdiniz. Lütfen bekleyin.',
            retryAfter,
        },
        {
            status: 429,
            headers: {
                'Retry-After': retryAfter.toString(),
            },
        }
    );
}

// Pre-configured rate limiters
export const RATE_LIMITS = {
    // Voice API: 10 requests per minute per IP
    voice: {
        windowMs: 60 * 1000,
        maxRequests: 10,
    },

    // Inference: 30 requests per minute per IP
    inference: {
        windowMs: 60 * 1000,
        maxRequests: 30,
    },

    // Session creation: 5 per minute per IP
    session: {
        windowMs: 60 * 1000,
        maxRequests: 5,
    },

    // General API: 100 requests per minute per IP
    general: {
        windowMs: 60 * 1000,
        maxRequests: 100,
    },
};

// Usage cost tracking (for monitoring, not billing)
interface UsageRecord {
    timestamp: number;
    endpoint: string;
    durationMs: number;
    tokensUsed?: number;
    audioSeconds?: number;
}

const usageLog: UsageRecord[] = [];
const MAX_USAGE_LOG_SIZE = 10000;

export function trackUsage(record: Omit<UsageRecord, 'timestamp'>) {
    usageLog.push({
        ...record,
        timestamp: Date.now(),
    });

    // Trim old records
    if (usageLog.length > MAX_USAGE_LOG_SIZE) {
        usageLog.splice(0, usageLog.length - MAX_USAGE_LOG_SIZE);
    }
}

export function getUsageStats(windowMs: number = 3600000): {
    totalRequests: number;
    totalDurationMs: number;
    totalAudioSeconds: number;
    byEndpoint: Record<string, number>;
} {
    const cutoff = Date.now() - windowMs;
    const recentLogs = usageLog.filter(r => r.timestamp > cutoff);

    const byEndpoint: Record<string, number> = {};
    let totalDurationMs = 0;
    let totalAudioSeconds = 0;

    for (const log of recentLogs) {
        byEndpoint[log.endpoint] = (byEndpoint[log.endpoint] || 0) + 1;
        totalDurationMs += log.durationMs;
        totalAudioSeconds += log.audioSeconds || 0;
    }

    return {
        totalRequests: recentLogs.length,
        totalDurationMs,
        totalAudioSeconds,
        byEndpoint,
    };
}
