/**
 * Phone Number Gateway — Unified Provisioning Router
 *
 * Routes provisioning requests to the correct provider based on country:
 * - Turkey (TR) → SIP Trunk pool allocation (number-pool.ts)
 * - Global       → Twilio Native API purchase (twilio-native.ts)
 *
 * This is the single entry point for all phone number operations.
 * VoicePipeline does NOT need to know about providers — Elastic SIP Trunking
 * routes all calls through the same Twilio webhook regardless of origin.
 */

import type { PhoneNumberRecord, ProvisionOptions, ProvisionResult } from './types';
import { getProviderForCountry } from './types';
import { assignFromPool, returnToPool, isPoolAvailable } from './number-pool';
import { purchaseFromTwilio, releaseTwilioNumber } from './twilio-native';

// =============================================
// Provision (Unified)
// =============================================

/**
 * Provision a phone number for a tenant.
 * Routes to the correct provider based on country code.
 *
 * @param db       Firestore instance
 * @param tenantId Tenant to assign the number to
 * @param country  ISO 3166-1 alpha-2 country code (e.g., "TR", "US")
 * @param options  Optional: areaCode (Twilio), carrier preference (SIP), etc.
 */
export async function provisionNumber(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    country: string,
    options?: ProvisionOptions,
): Promise<ProvisionResult> {
    const providerType = getProviderForCountry(country);

    try {
        let phoneNumber: PhoneNumberRecord;

        if (providerType === 'SIP_TRUNK') {
            // Turkey: Check pool availability first (maintenance mode)
            const pool = await isPoolAvailable(db);
            if (!pool.available) {
                return {
                    success: false,
                    error: 'TR_POOL_MAINTENANCE',
                    maintenanceMessage: 'Türkiye numara havuzu şu anda bakımdadır. Numara tahsisi geçici olarak kullanılamaz. Lütfen daha sonra tekrar deneyin.',
                };
            }

            // Turkey: Assign from pre-purchased number pool
            phoneNumber = await assignFromPool(db, tenantId, options?.carrier);
        } else {
            // Global: Purchase via Twilio API
            phoneNumber = await purchaseFromTwilio(
                db,
                tenantId,
                country,
                options?.areaCode,
            );
        }

        return { success: true, phoneNumber };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Numara tahsisi başarısız';
        return { success: false, error: message };
    }
}

// =============================================
// Release (Unified)
// =============================================

/**
 * Release a phone number from a tenant.
 * Routes to the correct cleanup based on provider type.
 */
export async function releaseNumber(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    phoneNumber: string,
): Promise<void> {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    const doc = await db.collection('tenant_phone_numbers').doc(normalized).get();

    if (!doc.exists) {
        throw new Error(`Numara bulunamadı: ${phoneNumber}`);
    }

    const data = doc.data()!;

    // Verify ownership
    if (data.tenantId !== tenantId) {
        throw new Error('Bu numara size ait değil');
    }

    if (data.providerType === 'TWILIO_NATIVE' && data.twilioSid) {
        await releaseTwilioNumber(db, normalized, data.twilioSid);
    } else if (data.providerType === 'SIP_TRUNK') {
        await returnToPool(db, normalized);
    } else {
        // Legacy number or unknown provider — just delete the assignment
        await db.collection('tenant_phone_numbers').doc(normalized).delete();
    }
}

// =============================================
// List (Unified)
// =============================================

/**
 * List all phone numbers assigned to a tenant.
 */
export async function listTenantNumbers(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<PhoneNumberRecord[]> {
    const snap = await db
        .collection('tenant_phone_numbers')
        .where('tenantId', '==', tenantId)
        .where('isActive', '==', true)
        .get();

    return snap.docs.map(doc => ({
        phoneNumber: doc.id,
        ...doc.data(),
    })) as PhoneNumberRecord[];
}
