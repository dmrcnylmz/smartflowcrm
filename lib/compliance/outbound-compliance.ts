/**
 * Outbound Compliance Orchestrator
 *
 * Combines all compliance checks before an outbound call:
 * 1. Consent validation (per-contact)
 * 2. Calling hours validation (per-country)
 * 3. IYS (Ileti Yonetim Sistemi) check for Turkey (+90 numbers)
 *
 * If ANY check fails, the call is blocked.
 */

import {
    checkOutboundConsent,
    isConsentValid,
    type OutboundComplianceCheck,
} from '@/lib/compliance/consent-manager';
import { isCallingAllowed, detectCountryFromPhone } from '@/lib/compliance/calling-hours';
import { getDefaultIYSClient, type IYSStatus } from '@/lib/compliance/iys-client';

// =============================================
// Master Compliance Check
// =============================================

/**
 * Run all outbound compliance checks for a phone number.
 * Returns a combined result. If ANY check fails, overallAllowed = false.
 */
export async function runOutboundComplianceCheck(
    tenantId: string,
    phoneNumber: string,
    _language: string,
    db?: FirebaseFirestore.Firestore,
): Promise<OutboundComplianceCheck> {
    const reasons: string[] = [];

    // 1. Calling hours check (uses existing calling-hours module)
    const hoursCheck = isCallingAllowed(phoneNumber);
    const callingHoursValid = hoursCheck.allowed;
    if (!callingHoursValid) {
        reasons.push(hoursCheck.reason || 'callingHoursBlocked');
    }

    // 2. Consent check (requires Firestore)
    let consentValid = false;
    if (db) {
        const consent = await checkOutboundConsent(db, tenantId, phoneNumber);
        consentValid = isConsentValid(consent);
        if (!consentValid) {
            reasons.push(consent ? `consent_${consent.consentStatus}` : 'consentRequired');
        }
    } else {
        // Without DB access, we cannot verify consent — block by default
        reasons.push('consentRequired');
    }

    // 3. IYS check for Turkey (+90 numbers)
    let iysStatus: 'ONAY' | 'RET' | 'NOT_FOUND' | 'ERROR' | 'SKIPPED' = 'SKIPPED';
    const country = detectCountryFromPhone(phoneNumber);
    if (country === 'TR') {
        try {
            const iysClient = getDefaultIYSClient();
            const iysResult = await iysClient.checkConsent(phoneNumber);
            iysStatus = iysResult.status as typeof iysStatus;

            if (iysResult.status === 'RET') {
                reasons.push("IYS'de ret kaydi var");
            }
        } catch (err) {
            console.error('[OutboundCompliance] IYS check failed:', err);
            iysStatus = 'ERROR';
        }
    }

    const iysBlocked = (iysStatus as string) === 'RET';
    const overallAllowed = consentValid && callingHoursValid && !iysBlocked;

    return {
        phoneNumber,
        consentValid,
        callingHoursValid,
        dncChecked: false, // DNC registry integration not yet implemented
        iysStatus,
        overallAllowed,
        reasons,
    };
}
