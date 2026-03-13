/**
 * Outgoing Webhook Types — Event notifications to customer URLs
 *
 * Tenants can subscribe to events (call completed, appointment created, etc.)
 * and receive real-time HTTP POST notifications to their configured URLs.
 */

// ─── Webhook Event Types ────────────────────────────────────────────────────

export type WebhookEventType =
    | 'call.completed'
    | 'call.missed'
    | 'appointment.created'
    | 'appointment.updated'
    | 'complaint.created'
    | 'complaint.resolved'
    | 'customer.created';

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
    'call.completed': 'Çağrı Tamamlandı',
    'call.missed': 'Çağrı Kaçırıldı',
    'appointment.created': 'Randevu Oluşturuldu',
    'appointment.updated': 'Randevu Güncellendi',
    'complaint.created': 'Şikayet Oluşturuldu',
    'complaint.resolved': 'Şikayet Çözüldü',
    'customer.created': 'Müşteri Oluşturuldu',
};

// ─── Webhook Configuration ──────────────────────────────────────────────────

export interface WebhookConfig {
    /** Unique ID */
    id: string;
    /** Target URL (HTTPS only in production) */
    url: string;
    /** Event types this webhook subscribes to */
    events: WebhookEventType[];
    /** Whether this webhook is active */
    active: boolean;
    /** HMAC secret for payload signing */
    secret: string;
    /** Display label */
    label?: string;
    /** Created timestamp */
    createdAt: string;
    /** Last successful delivery timestamp */
    lastDeliveryAt?: string;
    /** Consecutive failure count */
    failureCount: number;
}

// ─── Webhook Payload ────────────────────────────────────────────────────────

export interface WebhookPayload {
    /** Event type */
    event: WebhookEventType;
    /** Unique event ID (idempotency) */
    eventId: string;
    /** ISO timestamp */
    timestamp: string;
    /** Tenant ID */
    tenantId: string;
    /** Event-specific data */
    data: Record<string, unknown>;
}

// ─── Delivery Log ───────────────────────────────────────────────────────────

export interface WebhookDeliveryLog {
    webhookId: string;
    eventId: string;
    event: WebhookEventType;
    url: string;
    statusCode: number | null;
    success: boolean;
    durationMs: number;
    error?: string;
    timestamp: string;
}

// ─── Retry System ──────────────────────────────────────────────────────────

/** Retry delays in seconds: 1m, 5m, 15m, 1h, 4h */
export const RETRY_DELAYS_SEC = [60, 300, 900, 3600, 14400] as const;
export const MAX_RETRY_ATTEMPTS = RETRY_DELAYS_SEC.length;

export type RetryStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookRetryRecord {
    /** Firestore doc ID */
    id?: string;
    /** Tenant ID */
    tenantId: string;
    /** Webhook config ID */
    webhookId: string;
    /** Webhook URL */
    url: string;
    /** HMAC secret */
    secret: string;
    /** Event type */
    event: WebhookEventType;
    /** Full payload to re-deliver */
    payload: WebhookPayload;
    /** Current attempt number (0-based, first retry = 0) */
    attemptNumber: number;
    /** Scheduled time for next retry (ISO string) */
    nextRetryAt: string;
    /** Current status */
    status: RetryStatus;
    /** Last error message */
    lastError?: string;
    /** Created timestamp */
    createdAt: string;
    /** Updated timestamp */
    updatedAt: string;
}
