/**
 * Response Cache — LRU In-Memory Cache for Voice AI Responses
 *
 * Caches inference responses by (text, persona, language) key.
 * Dramatically reduces latency and GPU/API costs for repeated queries.
 *
 * Features:
 * - LRU eviction when capacity reached
 * - TTL-based expiry per entry
 * - Hit/miss ratio tracking
 * - Key normalization for fuzzy matching (lowercase, trim, collapse whitespace)
 * - Configurable for different cache tiers
 */

export interface CacheEntry<T> {
    value: T;
    createdAt: number;
    lastAccessedAt: number;
    hitCount: number;
    key: string;
}

export interface ResponseCacheConfig {
    /** Maximum number of entries */
    maxSize: number;
    /** Default TTL in ms (0 = no expiry) */
    defaultTtl: number;
    /** Enable key normalization */
    normalizeKeys: boolean;
    /** Name for logging */
    name: string;
}

export interface CacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
}

const DEFAULT_CONFIG: ResponseCacheConfig = {
    maxSize: 500,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    normalizeKeys: true,
    name: 'response-cache',
};

export class ResponseCache<T = unknown> {
    private cache: Map<string, CacheEntry<T>> = new Map();
    private config: ResponseCacheConfig;

    // Metrics
    private hits = 0;
    private misses = 0;
    private evictions = 0;

    constructor(config: Partial<ResponseCacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Get a cached response. Returns null if not found or expired.
     */
    get(key: string): T | null {
        const normalizedKey = this.normalizeKey(key);
        const entry = this.cache.get(normalizedKey);

        if (!entry) {
            this.misses++;
            return null;
        }

        // Check TTL expiry
        if (this.config.defaultTtl > 0) {
            const age = Date.now() - entry.createdAt;
            if (age > this.config.defaultTtl) {
                this.cache.delete(normalizedKey);
                this.misses++;
                return null;
            }
        }

        // Update LRU tracking
        entry.lastAccessedAt = Date.now();
        entry.hitCount++;
        this.hits++;

        // Move to end (most recently used) by re-inserting
        this.cache.delete(normalizedKey);
        this.cache.set(normalizedKey, entry);

        return entry.value;
    }

    /**
     * Store a response in the cache.
     */
    set(key: string, value: T): void {
        const normalizedKey = this.normalizeKey(key);

        // Evict LRU if at capacity
        if (this.cache.size >= this.config.maxSize && !this.cache.has(normalizedKey)) {
            this.evictLRU();
        }

        const entry: CacheEntry<T> = {
            value,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            hitCount: 0,
            key: normalizedKey,
        };

        this.cache.set(normalizedKey, entry);
    }

    /**
     * Check if a key exists and is not expired.
     */
    has(key: string): boolean {
        const normalizedKey = this.normalizeKey(key);
        const entry = this.cache.get(normalizedKey);

        if (!entry) return false;

        if (this.config.defaultTtl > 0) {
            const age = Date.now() - entry.createdAt;
            if (age > this.config.defaultTtl) {
                this.cache.delete(normalizedKey);
                return false;
            }
        }

        return true;
    }

    /**
     * Remove a specific entry.
     */
    delete(key: string): boolean {
        return this.cache.delete(this.normalizeKey(key));
    }

    /**
     * Clear all entries.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics.
     */
    getStats(): CacheStats {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0,
            evictions: this.evictions,
        };
    }

    /**
     * Purge expired entries.
     */
    purgeExpired(): number {
        if (this.config.defaultTtl <= 0) return 0;

        const now = Date.now();
        let purged = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.createdAt > this.config.defaultTtl) {
                this.cache.delete(key);
                purged++;
            }
        }

        return purged;
    }

    private evictLRU(): void {
        // Map iteration order = insertion order.
        // First key = least recently used (since we re-insert on access).
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
            this.cache.delete(firstKey);
            this.evictions++;
        }
    }

    private normalizeKey(key: string): string {
        if (!this.config.normalizeKeys) return key;
        return key
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
    }
}

// ============================================
// Voice-Specific Cache Utilities
// ============================================

/**
 * Build a cache key from inference parameters.
 */
export function buildInferCacheKey(
    text: string,
    persona: string,
    language: string,
): string {
    return `${language}:${persona}:${text}`;
}

/**
 * Cached inference response shape.
 */
export interface CachedInferResponse {
    session_id: string;
    intent: string;
    confidence: number;
    response_text: string;
    latency_ms: number;
    source: string;
    cached: true;
}

// ============================================
// Singleton Instances
// ============================================

/** Cache for Personaplex inference responses */
export const inferCache = new ResponseCache<CachedInferResponse>({
    name: 'infer-cache',
    maxSize: 500,
    defaultTtl: 5 * 60 * 1000,  // 5 min
    normalizeKeys: true,
});

/** Cache for TTS audio chunks (longer TTL since audio is expensive) */
export const ttsCache = new ResponseCache<ArrayBuffer>({
    name: 'tts-cache',
    maxSize: 200,
    defaultTtl: 30 * 60 * 1000, // 30 min
    normalizeKeys: true,
});
