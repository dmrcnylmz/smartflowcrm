/**
 * Phone Number Types — Hybrid Telephony Data Model
 *
 * Supports two provider strategies:
 * - TWILIO_NATIVE: Twilio API ile doğrudan numara satın alma (Global)
 * - SIP_TRUNK: Netgsm/Bulutfon SIP trunk üzerinden numara havuzu (Türkiye +90)
 *
 * Key Firestore collections:
 * - tenant_phone_numbers/{e164}  → Tenant'a atanmış numaralar
 * - phone_number_pool/{autoId}   → Henüz atanmamış +90 numara havuzu
 * - porting_requests/{autoId}    → BYON (Bring Your Own Number) taşıma talepleri
 */

// =============================================
// Provider & Carrier Types
// =============================================

/** Telephony provider type */
export type ProviderType = 'TWILIO_NATIVE' | 'SIP_TRUNK';

/** SIP trunk carrier (Turkey-specific) */
export type SipCarrier = 'netgsm' | 'bulutfon' | 'other';

/** Porting request lifecycle */
export type PortingStatus = 'pending' | 'submitted' | 'in_progress' | 'completed' | 'rejected';

// =============================================
// Firestore Documents
// =============================================

/**
 * Tenant Phone Number Record
 * Stored in: tenant_phone_numbers/{e164}
 *
 * This is the same collection used by resolveTenantFromPhone() in telephony.ts,
 * extended with provider metadata for hybrid routing.
 */
export interface PhoneNumberRecord {
    /** E.164 format phone number (e.g., "+905321234567") */
    phoneNumber: string;

    /** Owning tenant ID */
    tenantId: string;

    /** How this number is routed */
    providerType: ProviderType;

    /** SIP trunk carrier (only for SIP_TRUNK) */
    sipCarrier?: SipCarrier;

    /** ISO 3166-1 alpha-2 country code (e.g., "TR", "US") */
    country: string;

    /** Supported capabilities */
    capabilities: ('voice' | 'sms')[];

    /** When the number was assigned to this tenant */
    assignedAt: FirebaseFirestore.Timestamp;

    /** Whether the number is currently active */
    isActive: boolean;

    /** Twilio phone number SID (only for TWILIO_NATIVE) */
    twilioSid?: string;

    /** Pool entry ID reference (only for SIP_TRUNK pool numbers) */
    poolEntryId?: string;

    /** Monthly cost in USD */
    monthlyRate?: number;

    /** Legacy: timestamp from registerPhoneNumber() — kept for backward compat */
    registeredAt?: number;
}

/**
 * Number Pool Entry — Pre-purchased +90 numbers
 * Stored in: phone_number_pool/{autoId}
 *
 * Admin adds numbers to pool → tenant requests → assigned from pool.
 */
export interface NumberPoolEntry {
    /** E.164 format phone number */
    phoneNumber: string;

    /** SIP trunk carrier that owns this number */
    sipCarrier: SipCarrier;

    /** Country code (always "TR" for now) */
    country: string;

    /** Pool lifecycle status */
    status: 'available' | 'reserved' | 'assigned';

    /** Tenant ID (set during reservation/assignment) */
    reservedFor?: string;

    /** Reservation timestamp */
    reservedAt?: FirebaseFirestore.Timestamp;

    /** When the number was added to the pool */
    addedAt: FirebaseFirestore.Timestamp;

    /** Monthly cost in USD */
    monthlyRate: number;
}

/**
 * Porting Request — BYON (Bring Your Own Number) workflow
 * Stored in: porting_requests/{autoId}
 */
export interface PortingRequest {
    /** Requesting tenant ID */
    tenantId: string;

    /** Phone number to port (E.164) */
    phoneNumber: string;

    /** Current carrier the number belongs to */
    currentCarrier: string;

    /** Target SIP trunk carrier */
    targetCarrier: SipCarrier;

    /** Porting lifecycle status */
    status: PortingStatus;

    /** When the request was submitted */
    submittedAt: FirebaseFirestore.Timestamp;

    /** Last status change */
    updatedAt: FirebaseFirestore.Timestamp;

    /** Tenant-provided notes */
    notes?: string;

    /** Admin-provided notes (internal) */
    adminNotes?: string;

    /** Uploaded document URLs (LOA, identity, etc.) */
    documents?: string[];

    /** Admin-set estimated completion date (ISO string) */
    estimatedCompletionDate?: string;
}

// =============================================
// Country → Provider Routing
// =============================================

/**
 * Country routing map.
 * Turkey uses SIP_TRUNK (BYOC), all others use TWILIO_NATIVE.
 */
export const COUNTRY_ROUTING: Record<string, ProviderType> = {
    TR: 'SIP_TRUNK',
};

/**
 * Get the appropriate provider for a country code.
 * Default: TWILIO_NATIVE (global Twilio API).
 */
export function getProviderForCountry(countryCode: string): ProviderType {
    return COUNTRY_ROUTING[countryCode.toUpperCase()] || 'TWILIO_NATIVE';
}

// =============================================
// Provisioning Options
// =============================================

export interface ProvisionOptions {
    /** Preferred area code (Twilio Native only) */
    areaCode?: string;

    /** Preferred SIP carrier (SIP_TRUNK only) */
    carrier?: SipCarrier;

    /** Desired capabilities */
    capabilities?: ('voice' | 'sms')[];
}

export interface ProvisionResult {
    success: boolean;
    phoneNumber?: PhoneNumberRecord;
    error?: string;
}
