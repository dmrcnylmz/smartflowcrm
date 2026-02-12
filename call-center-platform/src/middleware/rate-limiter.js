/**
 * Rate Limiter Middleware — Phase 12 Enterprise Security
 * 
 * In-memory sliding window rate limiter per tenant.
 * No external dependencies (Redis-free).
 */

class SlidingWindowLimiter {
    constructor() {
        this._windows = new Map(); // key -> { timestamps: [] }
        this._cleanupInterval = setInterval(() => this._cleanup(), 60000);
    }

    /**
     * Check if request is allowed.
     * @param {string} key - Rate limit key (e.g., tenantId)
     * @param {number} maxRequests - Max requests allowed
     * @param {number} windowMs - Window size in ms (default: 60000 = 1 min)
     * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
     */
    check(key, maxRequests = 100, windowMs = 60000) {
        const now = Date.now();
        if (!this._windows.has(key)) {
            this._windows.set(key, { timestamps: [] });
        }
        const window = this._windows.get(key);

        // Remove expired timestamps
        window.timestamps = window.timestamps.filter(ts => now - ts < windowMs);

        if (window.timestamps.length >= maxRequests) {
            const oldest = window.timestamps[0];
            return {
                allowed: false,
                remaining: 0,
                resetMs: windowMs - (now - oldest)
            };
        }

        window.timestamps.push(now);
        return {
            allowed: true,
            remaining: maxRequests - window.timestamps.length,
            resetMs: windowMs
        };
    }

    _cleanup() {
        const now = Date.now();
        for (const [key, window] of this._windows.entries()) {
            window.timestamps = window.timestamps.filter(ts => now - ts < 120000);
            if (window.timestamps.length === 0) {
                this._windows.delete(key);
            }
        }
    }

    destroy() {
        clearInterval(this._cleanupInterval);
    }
}

const limiter = new SlidingWindowLimiter();

/**
 * Express middleware for per-tenant rate limiting.
 */
function rateLimitMiddleware(req, res, next) {
    const tenantId = req.tenantId || 'anonymous';

    // Get tenant-specific limit from settings if available
    let maxRequests = 100;
    try {
        const { dbPrepareGet } = require('../config/database');
        const settings = dbPrepareGet(
            'SELECT rate_limit FROM tenant_settings WHERE tenant_id = ?',
            [tenantId]
        );
        if (settings && settings.rate_limit) {
            maxRequests = settings.rate_limit;
        }
    } catch (e) { /* use default */ }

    const result = limiter.check(`http:${tenantId}`, maxRequests, 60000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000));

    if (!result.allowed) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfterMs: result.resetMs
        });
    }

    next();
}

/**
 * WebSocket rate limiter for audio chunks.
 * @param {string} sessionId
 * @param {number} maxPerSecond - Max audio chunks per second (default: 50)
 * @returns {boolean} allowed
 */
function checkWsRate(sessionId, maxPerSecond = 50) {
    const result = limiter.check(`ws:${sessionId}`, maxPerSecond, 1000);
    return result.allowed;
}

module.exports = { rateLimitMiddleware, checkWsRate, limiter };
