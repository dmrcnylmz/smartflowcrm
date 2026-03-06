/**
 * Session-to-Tenant Registry
 *
 * Voice API routes are PUBLIC (no auth middleware) — they receive
 * session_id from Twilio/client but not tenant info directly.
 * This registry maps session IDs to tenant IDs so metric logging
 * can attribute calls to the correct tenant.
 *
 * - In-memory Map with automatic TTL cleanup (30 min)
 * - Singleton — shared across all route handlers in the same process
 * - Zero Firestore reads for hot-path lookups
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionEntry {
    tenantId: string;
    registeredAt: number;
    lastAccessedAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000;    // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 10_000;                // Safety cap

// ─── Registry ────────────────────────────────────────────────────────────────

class SessionRegistry {
    private sessions: Map<string, SessionEntry> = new Map();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Start periodic cleanup
        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
        // Allow Node to exit even if timer is running
        if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * Register a session with its tenant ID.
     * Called when a voice session starts (e.g., Twilio webhook or session/start).
     */
    register(sessionId: string, tenantId: string): void {
        // Safety: evict oldest if at capacity
        if (this.sessions.size >= MAX_SESSIONS && !this.sessions.has(sessionId)) {
            this.evictOldest();
        }

        this.sessions.set(sessionId, {
            tenantId,
            registeredAt: Date.now(),
            lastAccessedAt: Date.now(),
        });
    }

    /**
     * Look up the tenant for a given session ID.
     * Updates lastAccessedAt to extend TTL.
     * Returns null if not found.
     */
    getTenant(sessionId: string): string | null {
        const entry = this.sessions.get(sessionId);
        if (!entry) return null;

        // Extend TTL on access
        entry.lastAccessedAt = Date.now();
        return entry.tenantId;
    }

    /**
     * Remove a session (e.g., when call ends).
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Get registry stats for monitoring/debugging.
     */
    getStats(): { activeSessions: number; maxSessions: number } {
        return {
            activeSessions: this.sessions.size,
            maxSessions: MAX_SESSIONS,
        };
    }

    /**
     * Remove expired sessions (older than TTL from last access).
     */
    private cleanup(): void {
        const now = Date.now();
        let evicted = 0;

        for (const [sessionId, entry] of this.sessions) {
            if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
                this.sessions.delete(sessionId);
                evicted++;
            }
        }

        if (evicted > 0 && process.env.NODE_ENV === 'development') {
            console.debug(`[SessionRegistry] Cleaned up ${evicted} expired sessions, ${this.sessions.size} remaining`);
        }
    }

    /**
     * Evict the oldest session when at capacity.
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [sessionId, entry] of this.sessions) {
            if (entry.lastAccessedAt < oldestTime) {
                oldestTime = entry.lastAccessedAt;
                oldestKey = sessionId;
            }
        }

        if (oldestKey) {
            this.sessions.delete(oldestKey);
        }
    }

    /**
     * Destroy the registry (for testing/shutdown).
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.sessions.clear();
    }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const sessionRegistry = new SessionRegistry();
