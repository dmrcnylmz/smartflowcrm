/**
 * Number Pool Manager — Turkey +90 SIP Trunk Numbers
 *
 * Manages a pre-purchased pool of +90 phone numbers from
 * SIP trunk carriers (Netgsm, Bulutfon).
 *
 * Flow:
 * 1. Admin adds DID blocks to pool via addToPool()
 * 2. Tenant requests a number → assignFromPool() atomically assigns one
 * 3. Tenant releases → returnToPool() makes it available again
 *
 * Firestore collections:
 * - phone_number_pool/{autoId}       → Pool entries
 * - tenant_phone_numbers/{e164}      → Assigned numbers (shared with Twilio Native)
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { PhoneNumberRecord, NumberPoolEntry, SipCarrier } from './types';

// =============================================
// Pool Constants
// =============================================

const POOL_COLLECTION = 'phone_number_pool';
const TENANT_NUMBERS_COLLECTION = 'tenant_phone_numbers';

/** Reservation expires after 10 minutes if not completed */
const RESERVATION_TTL_MS = 10 * 60 * 1000;

// =============================================
// Pool Availability Check
// =============================================

/**
 * Check if the TR number pool has available numbers.
 * Used to show "maintenance" state when pool is empty.
 */
export async function isPoolAvailable(
    db: FirebaseFirestore.Firestore,
): Promise<{ available: boolean; count: number }> {
    const snap = await db
        .collection(POOL_COLLECTION)
        .where('status', '==', 'available')
        .limit(1)
        .get();

    return {
        available: !snap.empty,
        count: snap.empty ? 0 : snap.size,
    };
}

// =============================================
// Assignment (Tenant-Facing)
// =============================================

/**
 * Assign a number from the pool to a tenant.
 * Uses Firestore transaction for atomic availability check + assignment.
 *
 * @param db       Firestore instance
 * @param tenantId Tenant to assign to
 * @param carrier  Optional carrier preference (defaults to any available)
 * @returns        The assigned PhoneNumberRecord
 * @throws         If no numbers are available in the pool
 */
export async function assignFromPool(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    carrier?: SipCarrier,
): Promise<PhoneNumberRecord> {
    return db.runTransaction(async (transaction) => {
        // Find an available number (optionally filtered by carrier)
        let query = db
            .collection(POOL_COLLECTION)
            .where('status', '==', 'available')
            .limit(1);

        if (carrier) {
            query = db
                .collection(POOL_COLLECTION)
                .where('status', '==', 'available')
                .where('sipCarrier', '==', carrier)
                .limit(1);
        }

        const snap = await transaction.get(query);

        if (snap.empty) {
            throw new Error(
                carrier
                    ? `Havuzda ${carrier} operatöründen müsait numara yok`
                    : 'Havuzda müsait numara yok',
            );
        }

        const poolDoc = snap.docs[0];
        const poolData = poolDoc.data() as NumberPoolEntry;
        const normalized = poolData.phoneNumber.replace(/[\s\-()]/g, '');

        // Update pool entry: mark as assigned
        transaction.update(poolDoc.ref, {
            status: 'assigned',
            reservedFor: tenantId,
            reservedAt: FieldValue.serverTimestamp(),
        });

        // Create tenant phone number record
        const phoneRecord: Record<string, unknown> = {
            phoneNumber: normalized,
            tenantId,
            providerType: 'SIP_TRUNK',
            sipCarrier: poolData.sipCarrier,
            country: poolData.country || 'TR',
            capabilities: ['voice'],
            assignedAt: FieldValue.serverTimestamp(),
            isActive: true,
            poolEntryId: poolDoc.id,
            monthlyRate: poolData.monthlyRate,
        };

        transaction.set(
            db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized),
            phoneRecord,
        );

        return {
            ...phoneRecord,
            phoneNumber: normalized,
            assignedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
        } as PhoneNumberRecord;
    });
}

/**
 * Return a number to the pool (make it available again).
 * Called when a tenant releases their SIP trunk number.
 */
export async function returnToPool(
    db: FirebaseFirestore.Firestore,
    phoneNumber: string,
): Promise<void> {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    const tenantDoc = await db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized).get();

    if (!tenantDoc.exists) {
        throw new Error(`Numara bulunamadı: ${phoneNumber}`);
    }

    const data = tenantDoc.data()!;
    const poolEntryId = data.poolEntryId;

    // Return to pool if it came from pool
    if (poolEntryId) {
        await db.collection(POOL_COLLECTION).doc(poolEntryId).update({
            status: 'available',
            reservedFor: FieldValue.delete(),
            reservedAt: FieldValue.delete(),
        });
    }

    // Remove tenant assignment
    await db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized).delete();
}

// =============================================
// Pool Admin Functions
// =============================================

/**
 * Add numbers to the pool (admin operation).
 * Used when purchasing new DID blocks from carriers.
 */
export async function addToPool(
    db: FirebaseFirestore.Firestore,
    numbers: { phone: string; carrier: SipCarrier; rate: number }[],
): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    const batch = db.batch();

    for (const entry of numbers) {
        const normalized = entry.phone.replace(/[\s\-()]/g, '');

        // Check if number already exists in pool
        const existing = await db
            .collection(POOL_COLLECTION)
            .where('phoneNumber', '==', normalized)
            .limit(1)
            .get();

        if (!existing.empty) {
            skipped++;
            continue;
        }

        const ref = db.collection(POOL_COLLECTION).doc();
        batch.set(ref, {
            phoneNumber: normalized,
            sipCarrier: entry.carrier,
            country: 'TR',
            status: 'available',
            addedAt: FieldValue.serverTimestamp(),
            monthlyRate: entry.rate,
        });
        added++;
    }

    if (added > 0) {
        await batch.commit();
    }

    return { added, skipped };
}

/**
 * Remove a number from the pool (admin operation).
 * Only works for 'available' numbers (not assigned ones).
 */
export async function removeFromPool(
    db: FirebaseFirestore.Firestore,
    poolEntryId: string,
): Promise<void> {
    const doc = await db.collection(POOL_COLLECTION).doc(poolEntryId).get();

    if (!doc.exists) {
        throw new Error('Havuz kaydı bulunamadı');
    }

    const data = doc.data()!;
    if (data.status === 'assigned') {
        throw new Error('Atanmış numara havuzdan çıkarılamaz. Önce tenant atamasını kaldırın.');
    }

    await db.collection(POOL_COLLECTION).doc(poolEntryId).delete();
}

/**
 * Get pool statistics.
 */
export async function getPoolStats(
    db: FirebaseFirestore.Firestore,
): Promise<{
    total: number;
    available: number;
    assigned: number;
    reserved: number;
    byCarrier: Record<string, { total: number; available: number }>;
}> {
    const snap = await db.collection(POOL_COLLECTION).get();

    const stats = {
        total: 0,
        available: 0,
        assigned: 0,
        reserved: 0,
        byCarrier: {} as Record<string, { total: number; available: number }>,
    };

    for (const doc of snap.docs) {
        const data = doc.data() as NumberPoolEntry;
        stats.total++;

        const carrier = data.sipCarrier || 'other';
        if (!stats.byCarrier[carrier]) {
            stats.byCarrier[carrier] = { total: 0, available: 0 };
        }
        stats.byCarrier[carrier].total++;

        switch (data.status) {
            case 'available':
                stats.available++;
                stats.byCarrier[carrier].available++;
                break;
            case 'assigned':
                stats.assigned++;
                break;
            case 'reserved':
                // Check for expired reservations
                if (data.reservedAt) {
                    const reservedTime = (data.reservedAt as FirebaseFirestore.Timestamp).toMillis();
                    if (Date.now() - reservedTime > RESERVATION_TTL_MS) {
                        // Auto-release expired reservation (fire-and-forget)
                        db.collection(POOL_COLLECTION).doc(doc.id).update({
                            status: 'available',
                            reservedFor: FieldValue.delete(),
                            reservedAt: FieldValue.delete(),
                        }).catch(() => {});
                        stats.available++;
                        stats.byCarrier[carrier].available++;
                    } else {
                        stats.reserved++;
                    }
                } else {
                    stats.reserved++;
                }
                break;
        }
    }

    return stats;
}

/**
 * List pool numbers with optional filtering.
 */
export async function listPoolNumbers(
    db: FirebaseFirestore.Firestore,
    filter?: { status?: string; carrier?: SipCarrier },
): Promise<(NumberPoolEntry & { id: string })[]> {
    let query: FirebaseFirestore.Query = db.collection(POOL_COLLECTION);

    if (filter?.status) {
        query = query.where('status', '==', filter.status);
    }
    if (filter?.carrier) {
        query = query.where('sipCarrier', '==', filter.carrier);
    }

    const snap = await query.get();
    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    })) as (NumberPoolEntry & { id: string })[];
}
