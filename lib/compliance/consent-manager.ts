/**
 * Consent Management for Outbound Calling
 *
 * Tracks per-contact consent for outbound calls.
 * Stores consent records in Firestore: tenants/{tenantId}/consents/{phoneHash}
 *
 * Privacy: Phone numbers are hashed (SHA256) for document IDs.
 */

import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { logAudit } from '@/lib/compliance/audit';

// =============================================
// Types
// =============================================

export type ConsentStatus = 'granted' | 'denied' | 'pending' | 'expired' | 'withdrawn';
export type ConsentSource = 'manual' | 'csv_import' | 'api' | 'iys' | 'web_form';

export interface ContactConsent {
    phoneNumber: string;       // E.164
    consentStatus: ConsentStatus;
    consentSource: ConsentSource;
    consentDate: string;       // ISO date when consent was given
    expiryDate?: string;       // ISO date when consent expires
    consentText?: string;      // What the person agreed to
    country: string;           // CallingCountry
    iysReferenceId?: string;   // Turkey IYS reference
    updatedAt: string;
    updatedBy: string;         // userId who recorded this
}

export interface OutboundComplianceCheck {
    phoneNumber: string;
    consentValid: boolean;
    callingHoursValid: boolean;
    callFrequencyValid: boolean; // Monthly call frequency within limit
    dncChecked: boolean;       // Did we check DNC registry?
    iysStatus?: 'ONAY' | 'RET' | 'NOT_FOUND' | 'ERROR' | 'SKIPPED';  // IYS check result (TR only)
    overallAllowed: boolean;
    reasons: string[];
}

// =============================================
// Hash utility
// =============================================

/**
 * SHA256 hash of a phone number for use as Firestore document ID.
 * Privacy-friendly: the raw number is stored inside the document,
 * but the ID itself is opaque.
 */
export function hashPhone(phone: string): string {
    return createHash('sha256').update(phone).digest('hex');
}

// =============================================
// Consent CRUD
// =============================================

/**
 * Check if a consent record exists for this phone number.
 */
export async function checkOutboundConsent(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    phoneNumber: string,
): Promise<ContactConsent | null> {
    const docId = hashPhone(phoneNumber);
    const snap = await db
        .collection('tenants').doc(tenantId)
        .collection('consents').doc(docId)
        .get();

    if (!snap.exists) return null;
    return snap.data() as ContactConsent;
}

/**
 * Store / update a consent record in Firestore with audit trail.
 */
export async function recordOutboundConsent(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    consent: ContactConsent,
): Promise<void> {
    const docId = hashPhone(consent.phoneNumber);

    await db
        .collection('tenants').doc(tenantId)
        .collection('consents').doc(docId)
        .set({
            ...consent,
            updatedAt: new Date().toISOString(),
            _firestoreUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

    await logAudit(db, {
        tenantId,
        userId: consent.updatedBy,
        action: 'consent.granted',
        resource: 'outbound_consent',
        resourceId: docId,
        details: {
            phoneNumber: consent.phoneNumber,
            consentStatus: consent.consentStatus,
            consentSource: consent.consentSource,
        },
    });
}

/**
 * Revoke consent for a phone number (mark as withdrawn).
 */
export async function revokeConsent(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    phoneNumber: string,
    revokedBy: string,
): Promise<void> {
    const docId = hashPhone(phoneNumber);

    await db
        .collection('tenants').doc(tenantId)
        .collection('consents').doc(docId)
        .set({
            consentStatus: 'withdrawn',
            updatedAt: new Date().toISOString(),
            updatedBy: revokedBy,
            _firestoreUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

    await logAudit(db, {
        tenantId,
        userId: revokedBy,
        action: 'consent.revoked',
        resource: 'outbound_consent',
        resourceId: docId,
        details: { phoneNumber },
    });
}

// =============================================
// Validation
// =============================================

/**
 * Check whether a consent record is valid for calling:
 * - status must be 'granted'
 * - must not be past expiryDate
 */
export function isConsentValid(consent: ContactConsent | null): boolean {
    if (!consent) return false;
    if (consent.consentStatus !== 'granted') return false;

    if (consent.expiryDate) {
        const expiry = new Date(consent.expiryDate);
        if (expiry <= new Date()) return false;
    }

    return true;
}

// =============================================
// Bulk operations
// =============================================

/**
 * Batch check consent for a list of phone numbers.
 * Returns a Map of phoneNumber -> isValid.
 */
export async function bulkCheckConsent(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    phoneNumbers: string[],
): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Firestore getAll supports up to 500 refs at a time
    const batchSize = 500;
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
        const batch = phoneNumbers.slice(i, i + batchSize);
        const refs = batch.map(phone =>
            db.collection('tenants').doc(tenantId)
                .collection('consents').doc(hashPhone(phone)),
        );

        const snaps = await db.getAll(...refs);
        for (let j = 0; j < batch.length; j++) {
            const snap = snaps[j];
            if (snap.exists) {
                const consent = snap.data() as ContactConsent;
                results.set(batch[j], isConsentValid(consent));
            } else {
                results.set(batch[j], false);
            }
        }
    }

    return results;
}
