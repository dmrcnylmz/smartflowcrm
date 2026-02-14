/**
 * Compliance & Audit Module
 *
 * Features:
 * - Structured audit logging for all tenant operations
 * - PII redaction for transcripts and logs
 * - Data retention policy configuration
 * - KVKK / GDPR compliance helpers
 *
 * Storage: tenants/{tenantId}/audit_logs/
 */

import { FieldValue } from 'firebase-admin/firestore';

// =============================================
// Types
// =============================================

export type AuditAction =
    | 'call.start' | 'call.end' | 'call.transfer'
    | 'data.read' | 'data.write' | 'data.delete'
    | 'auth.login' | 'auth.logout' | 'auth.failed'
    | 'agent.create' | 'agent.update' | 'agent.delete'
    | 'kb.ingest' | 'kb.query' | 'kb.delete'
    | 'billing.charge' | 'billing.refund'
    | 'consent.granted' | 'consent.revoked'
    | 'admin.setting_change' | 'admin.member_add' | 'admin.member_remove';

export interface AuditEntry {
    tenantId: string;
    userId?: string;
    action: AuditAction;
    resource?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    consentFlags?: {
        callRecording: boolean;
        dataProcessing: boolean;
        analytics: boolean;
    };
    timestamp?: FirebaseFirestore.Timestamp;
}

export interface RetentionPolicy {
    callRecordingsDays: number;
    transcriptsDays: number;
    auditLogsDays: number;
    personalDataDays: number;
}

// =============================================
// Default Retention Policies
// =============================================

export const DEFAULT_RETENTION: RetentionPolicy = {
    callRecordingsDays: 90,
    transcriptsDays: 365,
    auditLogsDays: 2555, // ~7 years
    personalDataDays: 730, // 2 years
};

export const KVKK_RETENTION: RetentionPolicy = {
    callRecordingsDays: 60,
    transcriptsDays: 365,
    auditLogsDays: 3650, // 10 years
    personalDataDays: 365, // 1 year after consent revocation
};

// =============================================
// Audit Logger
// =============================================

/**
 * Log an audit entry for a tenant operation.
 */
export async function logAudit(
    db: FirebaseFirestore.Firestore,
    entry: AuditEntry,
): Promise<string> {
    const auditRef = db
        .collection('tenants').doc(entry.tenantId)
        .collection('audit_logs')
        .doc();

    await auditRef.set({
        ...entry,
        timestamp: FieldValue.serverTimestamp(),
        id: auditRef.id,
    });

    return auditRef.id;
}

/**
 * Query audit logs for a tenant.
 */
export async function queryAuditLogs(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    options?: {
        action?: AuditAction;
        userId?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    },
): Promise<AuditEntry[]> {
    let query: FirebaseFirestore.Query = db
        .collection('tenants').doc(tenantId)
        .collection('audit_logs')
        .orderBy('timestamp', 'desc');

    if (options?.action) {
        query = query.where('action', '==', options.action);
    }
    if (options?.userId) {
        query = query.where('userId', '==', options.userId);
    }
    if (options?.startDate) {
        query = query.where('timestamp', '>=', options.startDate);
    }
    if (options?.endDate) {
        query = query.where('timestamp', '<=', options.endDate);
    }

    query = query.limit(options?.limit || 50);

    const snap = await query.get();
    return snap.docs.map(d => d.data() as AuditEntry);
}

// =============================================
// PII Redaction
// =============================================

/** Patterns for Turkish + international PII detection */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Turkish phone numbers: 0532 123 45 67, +90 532 123 4567, etc.
    { pattern: /(?:\+?90?[\s\-]?)?\(?0?[5-9]\d{2}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g, replacement: '[TELEFON]' },
    // International phone patterns
    { pattern: /\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g, replacement: '[TELEFON]' },
    // Turkish ID (TC Kimlik No): 11 digits starting with non-zero
    { pattern: /\b[1-9]\d{10}\b/g, replacement: '[TC_KIMLIK]' },
    // Email addresses
    { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
    // Credit card numbers (basic pattern)
    { pattern: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, replacement: '[KART_NO]' },
    // IBAN
    { pattern: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){2,7}[\dA-Z]{1,4}\b/g, replacement: '[IBAN]' },
    // Addresses with Turkish patterns (Mah., Sok., Cad., No:)
    { pattern: /(?:Mah\.|Mahallesi|Sok\.|Sokak|Cad\.|Caddesi|Bulvarı?)\s+[^\n,]{3,40}(?:\s+No[:.]?\s*\d+)?/gi, replacement: '[ADRES]' },
];

/**
 * Redact PII from text.
 * Returns the redacted text and a list of redactions made.
 */
export function redactPII(text: string): { redacted: string; redactions: string[] } {
    let redacted = text;
    const redactions: string[] = [];

    for (const { pattern, replacement } of PII_PATTERNS) {
        const matches = redacted.match(pattern);
        if (matches) {
            for (const match of matches) {
                redactions.push(`${replacement}: ${match}`);
            }
            redacted = redacted.replace(pattern, replacement);
        }
    }

    return { redacted, redactions };
}

/**
 * Check if text contains PII.
 */
export function containsPII(text: string): boolean {
    return PII_PATTERNS.some(({ pattern }) => {
        pattern.lastIndex = 0; // Reset regex state
        return pattern.test(text);
    });
}

// =============================================
// Data Retention
// =============================================

/**
 * Get retention policy for a tenant.
 * Falls back to default if not configured.
 */
export async function getRetentionPolicy(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<RetentionPolicy> {
    const doc = await db.collection('tenants').doc(tenantId).get();
    const tenantData = doc.data();

    if (tenantData?.retentionPolicy) {
        return tenantData.retentionPolicy as RetentionPolicy;
    }

    // Check if tenant is in Turkey (KVKK)
    if (tenantData?.country === 'TR') {
        return KVKK_RETENTION;
    }

    return DEFAULT_RETENTION;
}

/**
 * Find expired records for cleanup.
 * Returns document paths that should be deleted.
 */
export async function findExpiredRecords(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    collectionName: string,
    retentionDays: number,
    timestampField: string = 'createdAt',
): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const snap = await db
        .collection('tenants').doc(tenantId)
        .collection(collectionName)
        .where(timestampField, '<', cutoff)
        .select() // Only fetch document IDs, not data
        .limit(500)
        .get();

    return snap.docs.map(d => d.ref.path);
}

// =============================================
// Consent Management
// =============================================

/**
 * Record user consent.
 */
export async function recordConsent(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    options: {
        userId?: string;
        callerPhone?: string;
        callRecording: boolean;
        dataProcessing: boolean;
        analytics: boolean;
        ipAddress?: string;
    },
): Promise<string> {
    const consentRef = db
        .collection('tenants').doc(tenantId)
        .collection('consents')
        .doc();

    await consentRef.set({
        id: consentRef.id,
        ...options,
        grantedAt: FieldValue.serverTimestamp(),
        status: 'active',
    });

    // Log audit
    await logAudit(db, {
        tenantId,
        userId: options.userId,
        action: 'consent.granted',
        resource: 'consent',
        resourceId: consentRef.id,
        details: {
            callRecording: options.callRecording,
            dataProcessing: options.dataProcessing,
            analytics: options.analytics,
        },
        ipAddress: options.ipAddress,
    });

    return consentRef.id;
}
