/**
 * Number Porting Manager — BYON (Bring Your Own Number)
 *
 * Manages the workflow for porting existing phone numbers
 * from external carriers to Callception's SIP trunk.
 *
 * Lifecycle:
 * 1. Tenant submits porting request (pending)
 * 2. Admin reviews and submits to carrier (submitted)
 * 3. Carrier processes the port (in_progress)
 * 4. Admin completes — number added to tenant (completed)
 *
 * Firestore: porting_requests/{autoId}
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { PortingRequest, PortingStatus, SipCarrier, PhoneNumberRecord } from './types';

// =============================================
// Constants
// =============================================

const PORTING_COLLECTION = 'porting_requests';
const TENANT_NUMBERS_COLLECTION = 'tenant_phone_numbers';

// =============================================
// Create
// =============================================

/**
 * Create a new porting request.
 * Tenant wants to port their existing number to Callception.
 */
export async function createPortingRequest(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    data: {
        phoneNumber: string;
        currentCarrier: string;
        targetCarrier: SipCarrier;
        notes?: string;
        documents?: string[];
    },
): Promise<PortingRequest & { id: string }> {
    const normalized = data.phoneNumber.replace(/[\s\-()]/g, '');

    // Check if a porting request already exists for this number
    const existing = await db
        .collection(PORTING_COLLECTION)
        .where('phoneNumber', '==', normalized)
        .where('status', 'in', ['pending', 'submitted', 'in_progress'])
        .limit(1)
        .get();

    if (!existing.empty) {
        throw new Error(`Bu numara için zaten aktif bir taşıma talebi var`);
    }

    // Also check if number is already registered
    const numberDoc = await db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized).get();
    if (numberDoc.exists) {
        throw new Error('Bu numara zaten sistemde kayıtlı');
    }

    const portingData = {
        tenantId,
        phoneNumber: normalized,
        currentCarrier: data.currentCarrier,
        targetCarrier: data.targetCarrier,
        status: 'pending' as PortingStatus,
        submittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        notes: data.notes || '',
        documents: data.documents || [],
    };

    const ref = await db.collection(PORTING_COLLECTION).add(portingData);

    return {
        id: ref.id,
        ...portingData,
        submittedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
        updatedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
    };
}

// =============================================
// Update Status (Admin)
// =============================================

/**
 * Update the status of a porting request.
 * Only admins should call this.
 */
export async function updatePortingStatus(
    db: FirebaseFirestore.Firestore,
    requestId: string,
    status: PortingStatus,
    adminNotes?: string,
    estimatedCompletionDate?: string,
): Promise<void> {
    const doc = await db.collection(PORTING_COLLECTION).doc(requestId).get();

    if (!doc.exists) {
        throw new Error('Taşıma talebi bulunamadı');
    }

    const updateData: Record<string, unknown> = {
        status,
        updatedAt: FieldValue.serverTimestamp(),
    };

    if (adminNotes !== undefined) {
        updateData.adminNotes = adminNotes;
    }

    if (estimatedCompletionDate !== undefined) {
        updateData.estimatedCompletionDate = estimatedCompletionDate;
    }

    await db.collection(PORTING_COLLECTION).doc(requestId).update(updateData);
}

// =============================================
// Complete Porting
// =============================================

/**
 * Complete a porting request.
 * Marks as completed and registers the number to the tenant.
 */
export async function completePorting(
    db: FirebaseFirestore.Firestore,
    requestId: string,
): Promise<PhoneNumberRecord> {
    const doc = await db.collection(PORTING_COLLECTION).doc(requestId).get();

    if (!doc.exists) {
        throw new Error('Taşıma talebi bulunamadı');
    }

    const portingData = doc.data() as PortingRequest;

    if (portingData.status === 'completed') {
        throw new Error('Bu taşıma talebi zaten tamamlanmış');
    }

    if (portingData.status === 'rejected') {
        throw new Error('Reddedilmiş taşıma talebi tamamlanamaz');
    }

    const normalized = portingData.phoneNumber.replace(/[\s\-()]/g, '');

    // Create the phone number record
    const phoneRecord: Record<string, unknown> = {
        phoneNumber: normalized,
        tenantId: portingData.tenantId,
        providerType: 'SIP_TRUNK',
        sipCarrier: portingData.targetCarrier,
        country: 'TR',
        capabilities: ['voice'],
        assignedAt: FieldValue.serverTimestamp(),
        isActive: true,
        monthlyRate: 0, // Ported numbers — rate set separately
    };

    // Transaction: complete porting + register number
    await db.runTransaction(async (transaction) => {
        // Update porting request
        transaction.update(db.collection(PORTING_COLLECTION).doc(requestId), {
            status: 'completed',
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Register the number
        transaction.set(
            db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized),
            phoneRecord,
        );
    });

    return {
        ...phoneRecord,
        phoneNumber: normalized,
        assignedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
    } as PhoneNumberRecord;
}

// =============================================
// List & Query
// =============================================

/**
 * List porting requests with optional filters.
 *
 * @param db        Firestore instance
 * @param tenantId  If provided, filter by tenant (for tenant-facing views)
 * @param status    If provided, filter by status
 */
export async function listPortingRequests(
    db: FirebaseFirestore.Firestore,
    tenantId?: string,
    status?: PortingStatus,
): Promise<(PortingRequest & { id: string })[]> {
    let query: FirebaseFirestore.Query = db.collection(PORTING_COLLECTION);

    if (tenantId) {
        query = query.where('tenantId', '==', tenantId);
    }

    if (status) {
        query = query.where('status', '==', status);
    }

    query = query.orderBy('submittedAt', 'desc');

    const snap = await query.get();
    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    })) as (PortingRequest & { id: string })[];
}

/**
 * Get a single porting request by ID.
 */
export async function getPortingRequest(
    db: FirebaseFirestore.Firestore,
    requestId: string,
): Promise<(PortingRequest & { id: string }) | null> {
    const doc = await db.collection(PORTING_COLLECTION).doc(requestId).get();

    if (!doc.exists) return null;

    return {
        id: doc.id,
        ...doc.data(),
    } as PortingRequest & { id: string };
}
