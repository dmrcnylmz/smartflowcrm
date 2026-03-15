/**
 * Redis Cache Adapter — Upstash Redis for Distributed Caching
 *
 * Wraps @upstash/redis to provide a distributed cache layer.
 * Falls back gracefully to in-memory when UPSTASH_REDIS_REST_URL is not set.
 *
 * Used by ResponseCache for multi-instance cache sharing on Vercel.
 */

import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('cache');

// --- Types ---

interface RedisAdapter {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    isAvailable(): boolean;
}

// --- Upstash Redis Adapter ---

let redisInstance: RedisAdapter | null = null;

async function createUpstashAdapter(): Promise<RedisAdapter | null> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return null;
    }

    try {
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({ url, token });

        // Verify connection
        await redis.ping();
        logger.info('Upstash Redis connected', { url: url.replace(/\/\/.*@/, '//***@') });

        return {
            async get(key: string): Promise<string | null> {
                try {
                    const value = await redis.get<string>(key);
                    return value;
                } catch (err) {
                    logger.warn('Redis GET failed, falling back', { key, error: err instanceof Error ? err.message : String(err) });
                    return null;
                }
            },

            async set(key: string, value: string, ttlSeconds: number): Promise<void> {
                try {
                    await redis.set(key, value, { ex: ttlSeconds });
                } catch (err) {
                    logger.warn('Redis SET failed', { key, error: err instanceof Error ? err.message : String(err) });
                }
            },

            async del(key: string): Promise<void> {
                try {
                    await redis.del(key);
                } catch (err) {
                    logger.warn('Redis DEL failed', { key, error: err instanceof Error ? err.message : String(err) });
                }
            },

            isAvailable(): boolean {
                return true;
            },
        };
    } catch (err) {
        logger.warn('Upstash Redis initialization failed, using in-memory cache', {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

// --- In-Memory Fallback Adapter ---

function createInMemoryAdapter(): RedisAdapter {
    const store = new Map<string, { value: string; expiresAt: number }>();

    // Cleanup every 60s
    const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store.entries()) {
            if (now > entry.expiresAt) {
                store.delete(key);
            }
        }
    }, 60_000);
    if (timer.unref) timer.unref();

    return {
        async get(key: string): Promise<string | null> {
            const entry = store.get(key);
            if (!entry) return null;
            if (Date.now() > entry.expiresAt) {
                store.delete(key);
                return null;
            }
            return entry.value;
        },

        async set(key: string, value: string, ttlSeconds: number): Promise<void> {
            store.set(key, {
                value,
                expiresAt: Date.now() + ttlSeconds * 1000,
            });
        },

        async del(key: string): Promise<void> {
            store.delete(key);
        },

        isAvailable(): boolean {
            return false; // Not distributed
        },
    };
}

// --- Public API ---

/**
 * Get the Redis adapter singleton.
 * Returns Upstash Redis if configured, otherwise in-memory fallback.
 */
export async function getRedisAdapter(): Promise<RedisAdapter> {
    if (redisInstance) return redisInstance;

    const upstash = await createUpstashAdapter();
    if (upstash) {
        redisInstance = upstash;
        return upstash;
    }

    const inMemory = createInMemoryAdapter();
    redisInstance = inMemory;
    logger.info('Using in-memory cache adapter (no Redis configured)');
    return inMemory;
}

/**
 * Check if distributed caching (Redis) is available.
 */
export function isDistributedCacheAvailable(): boolean {
    return redisInstance?.isAvailable() ?? false;
}
