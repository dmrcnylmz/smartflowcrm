/**
 * Voice Session Persistence — Firestore-Backed Store
 *
 * Write-through cache for voice session data:
 * - Write: memory (SessionRegistry) AND Firestore
 * - Read: memory first, fallback to Firestore
 *
 * Firestore path: tenants/{tenantId}/voiceSessions/{sessionId}
 *
 * Design decisions:
 * - Fire-and-forget writes (.catch(() => {})) — never block the voice pipeline
 * - Server timestamps for consistency across distributed environments
 * - 30-minute TTL via expiresAt field (supports Firestore TTL policies)
 * - Append-only conversation history with atomic arrayUnion
 */

import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceSessionConversationEntry {
    role: 'user' | 'assistant';
    content: string;
    intent?: string;
    timestamp: string;
}

export interface VoiceSessionMetrics {
    turnCount: number;
    totalLatencyMs: number;
    sttLatencyMs: number[];
    llmLatencyMs: number[];
    ttsLatencyMs: number[];
}

export interface VoiceSession {
    sessionId: string;
    tenantId: string;
    callSid?: string;
    phone?: string;
    status: 'active' | 'completed' | 'failed' | 'timeout';
    startedAt: FirebaseFirestore.Timestamp;
    lastActivityAt: FirebaseFirestore.Timestamp;
    conversationHistory: VoiceSessionConversationEntry[];
    metrics?: VoiceSessionMetrics;
    expiresAt: FirebaseFirestore.Timestamp; // 30 min from last activity
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const COLLECTION_NAME = 'voiceSessions';

// ─── Firestore Access ────────────────────────────────────────────────────────

let db: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore {
    if (!db) {
        initAdmin();
        db = getFirestore();
    }
    return db;
}

/**
 * Get a reference to a voice session document.
 * Path: tenants/{tenantId}/voiceSessions/{sessionId}
 */
function sessionRef(tenantId: string, sessionId: string) {
    return getDb()
        .collection('tenants')
        .doc(tenantId)
        .collection(COLLECTION_NAME)
        .doc(sessionId);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Save (upsert) a voice session to Firestore.
 *
 * Uses set with merge so partial updates don't clobber existing fields.
 * Fire-and-forget — the returned promise resolves when the write is
 * acknowledged, but callers should `.catch(() => {})` to avoid blocking.
 */
export async function saveSession(session: VoiceSession): Promise<void> {
    try {
        const ref = sessionRef(session.tenantId, session.sessionId);

        const data: Record<string, unknown> = {
            sessionId: session.sessionId,
            tenantId: session.tenantId,
            status: session.status,
            startedAt: session.startedAt,
            lastActivityAt: FieldValue.serverTimestamp(),
            conversationHistory: session.conversationHistory,
            expiresAt: Timestamp.fromMillis(Date.now() + SESSION_TTL_MS),
        };

        if (session.callSid) data.callSid = session.callSid;
        if (session.phone) data.phone = session.phone;
        if (session.metrics) data.metrics = session.metrics;

        await ref.set(data, { merge: true });
    } catch (err) {
        console.error('[SessionStore] saveSession failed:', err);
        // Swallow — never block the voice pipeline
    }
}

/**
 * Read a voice session from Firestore.
 *
 * Used as fallback when the in-memory SessionRegistry has no entry
 * (e.g., after a cold start or process restart).
 */
export async function getSession(
    tenantId: string,
    sessionId: string,
): Promise<VoiceSession | null> {
    try {
        const snap = await sessionRef(tenantId, sessionId).get();
        if (!snap.exists) return null;

        const data = snap.data()!;
        return {
            sessionId: data.sessionId,
            tenantId: data.tenantId,
            callSid: data.callSid || undefined,
            phone: data.phone || undefined,
            status: data.status || 'active',
            startedAt: data.startedAt,
            lastActivityAt: data.lastActivityAt,
            conversationHistory: data.conversationHistory || [],
            metrics: data.metrics || undefined,
            expiresAt: data.expiresAt,
        } as VoiceSession;
    } catch (err) {
        console.error('[SessionStore] getSession failed:', err);
        return null;
    }
}

/**
 * Append a conversation turn and refresh the session's activity timestamp.
 *
 * Uses Firestore atomic arrayUnion so concurrent writes don't lose turns.
 * Also slides the expiresAt forward by SESSION_TTL_MS.
 *
 * Fire-and-forget — callers should `.catch(() => {})`.
 */
export async function updateSessionActivity(
    tenantId: string,
    sessionId: string,
    turn: VoiceSessionConversationEntry,
): Promise<void> {
    try {
        const ref = sessionRef(tenantId, sessionId);

        await ref.update({
            conversationHistory: FieldValue.arrayUnion(turn),
            lastActivityAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + SESSION_TTL_MS),
            'metrics.turnCount': FieldValue.increment(1),
        });
    } catch (err) {
        console.error('[SessionStore] updateSessionActivity failed:', err);
        // Swallow — never block the voice pipeline
    }
}

/**
 * Mark a session as ended (completed, failed, or timed out).
 *
 * Sets status and a final expiresAt (1 hour from now for post-mortem queries,
 * then Firestore TTL policy can clean it up).
 *
 * Fire-and-forget — callers should `.catch(() => {})`.
 */
export async function endSession(
    tenantId: string,
    sessionId: string,
    status: 'completed' | 'failed' | 'timeout',
): Promise<void> {
    try {
        const ref = sessionRef(tenantId, sessionId);
        const POST_MORTEM_TTL_MS = 60 * 60 * 1000; // 1 hour after end

        await ref.update({
            status,
            endedAt: FieldValue.serverTimestamp(),
            lastActivityAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + POST_MORTEM_TTL_MS),
        });
    } catch (err) {
        console.error('[SessionStore] endSession failed:', err);
        // Swallow — never block the voice pipeline
    }
}

/**
 * Create a new active session in Firestore.
 *
 * Convenience wrapper around saveSession for session initialization.
 * Returns immediately — the Firestore write happens asynchronously.
 */
export function createSession(params: {
    sessionId: string;
    tenantId: string;
    callSid?: string;
    phone?: string;
}): void {
    const session: VoiceSession = {
        sessionId: params.sessionId,
        tenantId: params.tenantId,
        callSid: params.callSid,
        phone: params.phone,
        status: 'active',
        startedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
        conversationHistory: [],
        metrics: {
            turnCount: 0,
            totalLatencyMs: 0,
            sttLatencyMs: [],
            llmLatencyMs: [],
            ttsLatencyMs: [],
        },
        expiresAt: Timestamp.fromMillis(Date.now() + SESSION_TTL_MS),
    };

    // Fire-and-forget
    saveSession(session).catch(() => {});
}

/**
 * Update session metrics (latency arrays, total latency).
 *
 * Fire-and-forget — callers should `.catch(() => {})`.
 */
export async function updateSessionMetrics(
    tenantId: string,
    sessionId: string,
    metrics: Partial<VoiceSessionMetrics>,
): Promise<void> {
    try {
        const ref = sessionRef(tenantId, sessionId);
        const updates: Record<string, unknown> = {};

        if (metrics.totalLatencyMs !== undefined) {
            updates['metrics.totalLatencyMs'] = metrics.totalLatencyMs;
        }
        if (metrics.turnCount !== undefined) {
            updates['metrics.turnCount'] = metrics.turnCount;
        }
        if (metrics.sttLatencyMs && metrics.sttLatencyMs.length > 0) {
            updates['metrics.sttLatencyMs'] = FieldValue.arrayUnion(...metrics.sttLatencyMs);
        }
        if (metrics.llmLatencyMs && metrics.llmLatencyMs.length > 0) {
            updates['metrics.llmLatencyMs'] = FieldValue.arrayUnion(...metrics.llmLatencyMs);
        }
        if (metrics.ttsLatencyMs && metrics.ttsLatencyMs.length > 0) {
            updates['metrics.ttsLatencyMs'] = FieldValue.arrayUnion(...metrics.ttsLatencyMs);
        }

        if (Object.keys(updates).length > 0) {
            await ref.update(updates);
        }
    } catch (err) {
        console.error('[SessionStore] updateSessionMetrics failed:', err);
        // Swallow — never block the voice pipeline
    }
}

/**
 * List recent voice sessions for a tenant.
 *
 * Useful for dashboard/monitoring. Limited to prevent large reads.
 */
export async function listSessions(
    tenantId: string,
    options?: {
        status?: VoiceSession['status'];
        limit?: number;
    },
): Promise<VoiceSession[]> {
    try {
        const firestore = getDb();
        let q: FirebaseFirestore.Query = firestore
            .collection('tenants')
            .doc(tenantId)
            .collection(COLLECTION_NAME)
            .orderBy('startedAt', 'desc')
            .limit(options?.limit || 50);

        if (options?.status) {
            q = q.where('status', '==', options.status);
        }

        const snapshot = await q.get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                sessionId: data.sessionId,
                tenantId: data.tenantId,
                callSid: data.callSid || undefined,
                phone: data.phone || undefined,
                status: data.status || 'active',
                startedAt: data.startedAt,
                lastActivityAt: data.lastActivityAt,
                conversationHistory: data.conversationHistory || [],
                metrics: data.metrics || undefined,
                expiresAt: data.expiresAt,
            } as VoiceSession;
        });
    } catch (err) {
        console.error('[SessionStore] listSessions failed:', err);
        return [];
    }
}
