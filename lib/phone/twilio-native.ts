/**
 * Twilio Native Phone Provisioning
 *
 * Wraps Twilio REST API for purchasing and releasing phone numbers.
 * Used for global (non-Turkey) number provisioning.
 *
 * Uses raw HTTP requests — matches the pattern in lib/twilio/subaccounts.ts.
 * No `twilio` SDK dependency.
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { PhoneNumberRecord } from './types';

// =============================================
// Constants
// =============================================

const TENANT_NUMBERS_COLLECTION = 'tenant_phone_numbers';
const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

// =============================================
// Twilio HTTP Helpers
// =============================================

function getMasterCredentials(): { accountSid: string; authToken: string } {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        throw new Error('Twilio yapılandırması eksik: TWILIO_ACCOUNT_SID ve TWILIO_AUTH_TOKEN gerekli');
    }

    return { accountSid, authToken };
}

function basicAuth(sid: string, token: string): string {
    return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function twilioRequest<T>(
    url: string,
    options: {
        method?: string;
        body?: Record<string, string>;
    } = {},
): Promise<T> {
    const { accountSid, authToken } = getMasterCredentials();

    const fetchOptions: RequestInit = {
        method: options.method || 'GET',
        headers: {
            'Authorization': basicAuth(accountSid, authToken),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(15000),
    };

    if (options.body) {
        fetchOptions.body = new URLSearchParams(options.body).toString();
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Twilio API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
}

// =============================================
// Purchase (Global Provisioning)
// =============================================

/**
 * Purchase a phone number via Twilio REST API and register it to a tenant.
 *
 * @param db        Firestore instance
 * @param tenantId  Tenant to assign the number to
 * @param country   ISO country code (e.g., "US", "GB")
 * @param areaCode  Optional area code preference
 * @param agentId   Optional agent to bind this number to
 * @returns         The purchased PhoneNumberRecord
 */
export async function purchaseFromTwilio(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    country: string,
    areaCode?: string,
    agentId?: string,
): Promise<PhoneNumberRecord> {
    const { accountSid } = getMasterCredentials();
    const countryUpper = country.toUpperCase();
    const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://callception.com';

    // Search for available numbers — try Local first, fallback to TollFree
    let selectedPhoneNumber: string | null = null;

    try {
        let url = `${TWILIO_API_BASE}/Accounts/${accountSid}/AvailablePhoneNumbers/${countryUpper}/Local.json?PageSize=1&VoiceEnabled=true`;
        if (areaCode) url += `&AreaCode=${encodeURIComponent(areaCode)}`;

        const localResult = await twilioRequest<{
            available_phone_numbers: Array<{ phone_number: string }>;
        }>(url);

        if (localResult.available_phone_numbers?.length > 0) {
            selectedPhoneNumber = localResult.available_phone_numbers[0].phone_number;
        }
    } catch {
        // Local not available for this country — try TollFree
    }

    if (!selectedPhoneNumber) {
        try {
            const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/AvailablePhoneNumbers/${countryUpper}/TollFree.json?PageSize=1&VoiceEnabled=true`;
            const tollFreeResult = await twilioRequest<{
                available_phone_numbers: Array<{ phone_number: string }>;
            }>(url);

            if (tollFreeResult.available_phone_numbers?.length > 0) {
                selectedPhoneNumber = tollFreeResult.available_phone_numbers[0].phone_number;
            }
        } catch {
            // TollFree not available either
        }
    }

    if (!selectedPhoneNumber) {
        throw new Error(`${countryUpper} ülkesinde uygun numara bulunamadı`);
    }

    // Purchase the number
    const purchasedData = await twilioRequest<{
        sid: string;
        phone_number: string;
        friendly_name: string;
    }>(`${TWILIO_API_BASE}/Accounts/${accountSid}/IncomingPhoneNumbers.json`, {
        method: 'POST',
        body: {
            PhoneNumber: selectedPhoneNumber,
            VoiceUrl: `${webhookBaseUrl}/api/twilio/incoming`,
            VoiceMethod: 'POST',
            StatusCallback: `${webhookBaseUrl}/api/twilio/status`,
            StatusCallbackMethod: 'POST',
        },
    });

    const normalized = purchasedData.phone_number.replace(/[\s\-()]/g, '');

    // Register in Firestore
    const phoneRecord: Record<string, unknown> = {
        phoneNumber: normalized,
        tenantId,
        providerType: 'TWILIO_NATIVE',
        country: countryUpper,
        capabilities: ['voice'],
        assignedAt: FieldValue.serverTimestamp(),
        isActive: true,
        twilioSid: purchasedData.sid,
        monthlyRate: 1.00,
        ...(agentId ? { agentId } : {}),
    };

    await db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized).set(phoneRecord);

    return {
        ...phoneRecord,
        phoneNumber: normalized,
        assignedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
    } as PhoneNumberRecord;
}

// =============================================
// Release (Cleanup)
// =============================================

/**
 * Release a Twilio number via REST API and remove the Firestore record.
 */
export async function releaseTwilioNumber(
    db: FirebaseFirestore.Firestore,
    phoneNumber: string,
    twilioSid: string,
): Promise<void> {
    const { accountSid } = getMasterCredentials();
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');

    // Release from Twilio via REST API
    try {
        await twilioRequest(
            `${TWILIO_API_BASE}/Accounts/${accountSid}/IncomingPhoneNumbers/${twilioSid}.json`,
            { method: 'DELETE' },
        );
    } catch (error) {
        // Log but don't block — number may already be released
        console.warn(`[twilio-native] Failed to release Twilio number ${twilioSid}:`, error);
    }

    // Remove Firestore record
    await db.collection(TENANT_NUMBERS_COLLECTION).doc(normalized).delete();
}
