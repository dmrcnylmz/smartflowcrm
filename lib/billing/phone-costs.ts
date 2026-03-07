/**
 * Phone Cost Calculator
 *
 * Calculates monthly phone number costs per tenant.
 * Each phone number has a monthly rate depending on provider and country.
 *
 * SIP Trunk (TR): ~$2-5/mo per number
 * Twilio (US/INT): ~$1-2/mo per number
 */

import { COST_RATES } from '@/lib/billing/metering';

// =============================================
// Types
// =============================================

export interface PhoneNumberCost {
    phoneNumber: string;
    providerType: string;
    sipCarrier?: string;
    country: string;
    monthlyRate: number;
    isActive: boolean;
}

export interface TenantPhoneCosts {
    totalMonthly: number;
    totalNumbers: number;
    activeNumbers: number;
    numbers: PhoneNumberCost[];
    byProvider: {
        sipTrunk: { count: number; cost: number };
        twilio: { count: number; cost: number };
    };
    estimatedVoiceCost: number; // Based on usage
}

// =============================================
// Default Monthly Rates
// =============================================

const DEFAULT_MONTHLY_RATES: Record<string, number> = {
    'SIP_TRUNK_TR': 3.00,     // ~$3/mo per Turkish SIP number
    'SIP_TRUNK_DEFAULT': 5.00, // Default SIP trunk rate
    'TWILIO_NATIVE_US': 1.15,  // Twilio US number
    'TWILIO_NATIVE_GB': 1.50,  // Twilio UK number
    'TWILIO_NATIVE_DE': 1.50,  // Twilio Germany number
    'TWILIO_NATIVE_TR': 6.00,  // Twilio Turkey (expensive)
    'TWILIO_NATIVE_DEFAULT': 1.50, // Default Twilio rate
};

/**
 * Get the monthly rate for a phone number based on its provider and country.
 */
export function getMonthlyRate(
    providerType: string,
    country: string,
    customRate?: number,
): number {
    if (customRate && customRate > 0) return customRate;

    const key = `${providerType}_${country.toUpperCase()}`;
    return DEFAULT_MONTHLY_RATES[key]
        || DEFAULT_MONTHLY_RATES[`${providerType}_DEFAULT`]
        || 2.00;
}

/**
 * Calculate monthly phone costs for a tenant.
 *
 * @param db - Firestore instance
 * @param tenantId - Tenant ID
 * @param currentUsage - Current month usage (for voice cost estimate)
 */
export async function calculateMonthlyPhoneCosts(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    currentUsage?: { twilioMinutes?: number; sipTrunkMinutes?: number },
): Promise<TenantPhoneCosts> {
    // Query tenant's phone numbers
    const snap = await db
        .collection('tenant_phone_numbers')
        .where('tenantId', '==', tenantId)
        .get();

    const numbers: PhoneNumberCost[] = [];
    let sipTrunkCount = 0;
    let sipTrunkCost = 0;
    let twilioCount = 0;
    let twilioCost = 0;
    let activeCount = 0;

    snap.docs.forEach(doc => {
        const data = doc.data();
        const providerType = data.providerType || 'TWILIO_NATIVE';
        const country = data.country || 'US';
        const isActive = data.isActive !== false;
        const monthlyRate = getMonthlyRate(providerType, country, data.monthlyRate);

        const entry: PhoneNumberCost = {
            phoneNumber: data.phoneNumber || doc.id,
            providerType,
            sipCarrier: data.sipCarrier,
            country,
            monthlyRate: isActive ? monthlyRate : 0,
            isActive,
        };

        numbers.push(entry);

        if (isActive) {
            activeCount++;
            if (providerType === 'SIP_TRUNK') {
                sipTrunkCount++;
                sipTrunkCost += monthlyRate;
            } else {
                twilioCount++;
                twilioCost += monthlyRate;
            }
        }
    });

    // Estimate voice costs based on current usage
    const twilioMinutes = currentUsage?.twilioMinutes || 0;
    const sipTrunkMinutes = currentUsage?.sipTrunkMinutes || 0;
    const estimatedVoiceCost =
        (twilioMinutes * COST_RATES.twilio.perMinute) +
        (sipTrunkMinutes * COST_RATES.sip_trunk.perMinute);

    const totalMonthly = sipTrunkCost + twilioCost;

    return {
        totalMonthly: round2(totalMonthly),
        totalNumbers: numbers.length,
        activeNumbers: activeCount,
        numbers,
        byProvider: {
            sipTrunk: { count: sipTrunkCount, cost: round2(sipTrunkCost) },
            twilio: { count: twilioCount, cost: round2(twilioCost) },
        },
        estimatedVoiceCost: round2(estimatedVoiceCost),
    };
}

/**
 * Quick summary of phone costs (no Firestore query needed if data is provided).
 */
export function summarizePhoneCosts(
    numbers: PhoneNumberCost[],
): { totalMonthly: number; sipCount: number; twilioCount: number } {
    let totalMonthly = 0;
    let sipCount = 0;
    let twilioCount = 0;

    for (const n of numbers) {
        if (!n.isActive) continue;
        totalMonthly += n.monthlyRate;
        if (n.providerType === 'SIP_TRUNK') sipCount++;
        else twilioCount++;
    }

    return {
        totalMonthly: round2(totalMonthly),
        sipCount,
        twilioCount,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
