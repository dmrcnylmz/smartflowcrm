// Voice API Rate Limiting
// Simple in-memory rate limiter for voice endpoints

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

// In-memory store (per-process; use Redis for multi-instance)
const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime < now) {
        store.delete(key);
      }
    }
  }, 60_000);
}

/** Pre-configured rate limit tiers */
export const RATE_LIMITS = {
  /** General API endpoints: 60 req/min */
  general: { maxRequests: 60, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Session creation: 10 req/min (expensive) */
  session: { maxRequests: 10, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Inference: 30 req/min */
  inference: { maxRequests: 30, windowMs: 60_000 } satisfies RateLimitConfig,
};

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

/** Check rate limit for a request */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
): RateLimitResult {
  const ip = getClientIp(request);
  const key = `voice:${ip}:${config.maxRequests}`;
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + config.windowMs };
    store.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
  };
}

/** Return a 429 response */
export function rateLimitExceeded(resetTime: number): NextResponse {
  const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

  return NextResponse.json(
    {
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please wait before trying again.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
      },
    },
  );
}

/** Build rate limit headers for successful responses */
export function getRateLimitHeaders(
  remaining: number,
  resetTime: number,
  maxRequests: number,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
  };
}
