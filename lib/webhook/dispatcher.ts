/**
 * Webhook Dispatcher — Fire outgoing webhook notifications to tenant URLs
 *
 * Features:
 * - HMAC-SHA256 payload signing (X-Webhook-Signature header)
 * - Fire-and-forget delivery (non-blocking)
 * - Delivery logging for debugging
 * - Auto-disable after 10 consecutive failures
 * - Idempotent event IDs
 */

import { createHmac, randomUUID } from 'crypto';
import type {
    WebhookConfig,
    WebhookEventType,
    WebhookPayload,
    WebhookDeliveryLog,
    WebhookRetryRecord,
} from './types';
import { RETRY_DELAYS_SEC, MAX_RETRY_ATTEMPTS } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const DELIVERY_TIMEOUT_MS = 10_000; // 10 seconds
const MAX_CONSECUTIVE_FAILURES = 10;

// ─── HMAC Signing ────────────────────────────────────────────────────────────

/**
 * Create HMAC-SHA256 signature for webhook payload.
 * Recipients can verify authenticity by computing the same HMAC.
 */
export function signPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify HMAC-SHA256 signature.
 */
export function verifySignature(payload: string, secret: string, signature: string): boolean {
    const expected = signPayload(payload, secret);
    // Timing-safe comparison
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Dispatch a webhook event to all matching active webhook configurations.
 *
 * Fire-and-forget: Never throws. Logs delivery results.
 *
 * @param db - Firestore instance
 * @param tenantId - Tenant ID
 * @param event - Event type
 * @param data - Event-specific payload data
 * @param webhooks - Pre-fetched webhook configs (optional, will fetch from Firestore if not provided)
 */
export async function dispatchWebhookEvent(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    event: WebhookEventType,
    data: Record<string, unknown>,
    webhooks?: WebhookConfig[],
): Promise<void> {
    try {
        // Get webhooks from Firestore if not provided
        const configs = webhooks || await getActiveWebhooks(db, tenantId);

        // Filter for webhooks that subscribe to this event
        const matching = configs.filter(w =>
            w.active &&
            w.events.includes(event) &&
            w.failureCount < MAX_CONSECUTIVE_FAILURES
        );

        if (matching.length === 0) return;

        const eventId = randomUUID();
        const payload: WebhookPayload = {
            event,
            eventId,
            timestamp: new Date().toISOString(),
            tenantId,
            data,
        };

        // Deliver to all matching webhooks in parallel
        await Promise.allSettled(
            matching.map(webhook => deliverWebhook(db, tenantId, webhook, payload))
        );
    } catch (error) {
        console.warn('[Webhook] Dispatch error:', error instanceof Error ? error.message : error);
    }
}

/**
 * Deliver payload to a single webhook URL.
 */
async function deliverWebhook(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    webhook: WebhookConfig,
    payload: WebhookPayload,
): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = signPayload(body, webhook.secret);
    const start = Date.now();

    let statusCode: number | null = null;
    let success = false;
    let error: string | undefined;

    try {
        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': `sha256=${signature}`,
                'X-Webhook-Event': payload.event,
                'X-Webhook-Id': payload.eventId,
                'User-Agent': 'Callception-Webhook/1.0',
            },
            body,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });

        statusCode = response.status;
        success = response.ok;

        if (!success) {
            error = `HTTP ${response.status}`;
        }
    } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
    }

    const durationMs = Date.now() - start;

    // Log delivery result
    const log: WebhookDeliveryLog = {
        webhookId: webhook.id,
        eventId: payload.eventId,
        event: payload.event,
        url: webhook.url,
        statusCode,
        success,
        durationMs,
        error,
        timestamp: new Date().toISOString(),
    };

    // Fire-and-forget: Update webhook state, log delivery, and queue retry if needed
    updateWebhookState(db, tenantId, webhook.id, success, log).catch(() => {});

    // Queue retry on failure
    if (!success) {
        queueRetry(db, tenantId, webhook, payload).catch(() => {});
    }
}

/**
 * Update webhook state after delivery attempt.
 */
async function updateWebhookState(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    webhookId: string,
    success: boolean,
    log: WebhookDeliveryLog,
): Promise<void> {
    try {
        const webhookRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('webhooks')
            .doc(webhookId);

        if (success) {
            await webhookRef.update({
                failureCount: 0,
                lastDeliveryAt: new Date().toISOString(),
            });
        } else {
            // Increment failure count
            const { FieldValue } = await import('firebase-admin/firestore');
            await webhookRef.update({
                failureCount: FieldValue.increment(1),
            });
        }

        // Store delivery log (keep last 50)
        await db
            .collection('tenants')
            .doc(tenantId)
            .collection('webhook_logs')
            .add(log);
    } catch {
        // Silent — don't break the webhook flow for logging errors
    }
}

// ─── Firestore Helpers ───────────────────────────────────────────────────────

/**
 * Get all active webhook configurations for a tenant.
 */
export async function getActiveWebhooks(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<WebhookConfig[]> {
    const snap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('webhooks')
        .where('active', '==', true)
        .get();

    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    })) as WebhookConfig[];
}

/**
 * Get recent webhook delivery logs for a tenant.
 */
export async function getWebhookLogs(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    limit: number = 50,
): Promise<WebhookDeliveryLog[]> {
    const snap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('webhook_logs')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

    return snap.docs.map(doc => doc.data() as WebhookDeliveryLog);
}

/**
 * Generate a cryptographically secure webhook secret.
 */
export function generateWebhookSecret(): string {
    return `whsec_${randomUUID().replace(/-/g, '')}`;
}

// ─── Retry System ────────────────────────────────────────────────────────────

/**
 * Calculate the next retry timestamp based on attempt number.
 */
export function calculateNextRetryAt(attemptNumber: number): string {
    const delaySec = RETRY_DELAYS_SEC[attemptNumber] ?? RETRY_DELAYS_SEC[RETRY_DELAYS_SEC.length - 1];
    return new Date(Date.now() + delaySec * 1000).toISOString();
}

/**
 * Queue a failed delivery for retry.
 * Creates a record in the `webhook_retry_queue` collection.
 */
async function queueRetry(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    webhook: WebhookConfig,
    payload: WebhookPayload,
): Promise<void> {
    try {
        const now = new Date().toISOString();
        const record: Omit<WebhookRetryRecord, 'id'> = {
            tenantId,
            webhookId: webhook.id,
            url: webhook.url,
            secret: webhook.secret,
            event: payload.event,
            payload,
            attemptNumber: 0,
            nextRetryAt: calculateNextRetryAt(0),
            status: 'pending',
            lastError: undefined,
            createdAt: now,
            updatedAt: now,
        };

        await db.collection('webhook_retry_queue').add(record);
    } catch {
        // Silent — retry queuing should never break the main flow
    }
}

/**
 * Process a single retry record: re-deliver the webhook.
 * Returns updated record fields.
 */
export async function processRetry(
    db: FirebaseFirestore.Firestore,
    record: WebhookRetryRecord & { id: string },
): Promise<{ success: boolean; error?: string }> {
    const body = JSON.stringify(record.payload);
    const signature = signPayload(body, record.secret);

    let statusCode: number | null = null;
    let success = false;
    let error: string | undefined;

    try {
        const response = await fetch(record.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': `sha256=${signature}`,
                'X-Webhook-Event': record.event,
                'X-Webhook-Id': record.payload.eventId,
                'X-Webhook-Retry': String(record.attemptNumber + 1),
                'User-Agent': 'Callception-Webhook/1.0',
            },
            body,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });

        statusCode = response.status;
        success = response.ok;

        if (!success) {
            error = `HTTP ${response.status}`;
        }
    } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
    }

    const now = new Date().toISOString();
    const retryRef = db.collection('webhook_retry_queue').doc(record.id);

    if (success) {
        // Delivered — mark as delivered and reset webhook failure count
        await retryRef.update({ status: 'delivered', updatedAt: now });

        // Reset failure count on the webhook config
        try {
            await db
                .collection('tenants')
                .doc(record.tenantId)
                .collection('webhooks')
                .doc(record.webhookId)
                .update({ failureCount: 0, lastDeliveryAt: now });
        } catch { /* silent */ }
    } else {
        const nextAttempt = record.attemptNumber + 1;

        if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
            // Max retries exhausted — mark as permanently failed
            await retryRef.update({
                status: 'failed',
                lastError: error,
                updatedAt: now,
            });
        } else {
            // Schedule next retry with exponential backoff
            await retryRef.update({
                attemptNumber: nextAttempt,
                nextRetryAt: calculateNextRetryAt(nextAttempt),
                lastError: error,
                updatedAt: now,
            });
        }
    }

    // Log the retry delivery attempt
    const log: WebhookDeliveryLog = {
        webhookId: record.webhookId,
        eventId: record.payload.eventId,
        event: record.event,
        url: record.url,
        statusCode,
        success,
        durationMs: 0, // not tracked for retries
        error,
        timestamp: now,
    };

    try {
        await db
            .collection('tenants')
            .doc(record.tenantId)
            .collection('webhook_logs')
            .add(log);
    } catch { /* silent */ }

    return { success, error };
}

/**
 * Get pending retry records that are due for processing.
 */
export async function getPendingRetries(
    db: FirebaseFirestore.Firestore,
    limit: number = 50,
): Promise<(WebhookRetryRecord & { id: string })[]> {
    const now = new Date().toISOString();

    const snap = await db
        .collection('webhook_retry_queue')
        .where('status', '==', 'pending')
        .where('nextRetryAt', '<=', now)
        .orderBy('nextRetryAt', 'asc')
        .limit(limit)
        .get();

    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    })) as (WebhookRetryRecord & { id: string })[];
}
