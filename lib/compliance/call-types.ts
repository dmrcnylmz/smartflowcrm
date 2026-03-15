/**
 * Call Type Classification System
 *
 * Determines regulatory requirements based on the purpose of an outbound call.
 * Transactional and service calls are exempt from consent requirements in most jurisdictions.
 *
 * Legal basis:
 * - TR: 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun
 * - DE: UWG §7 (Gesetz gegen den unlauteren Wettbewerb)
 * - FR: Code de la consommation L.34-5
 * - US: TCPA (Telephone Consumer Protection Act)
 * - UK: PECR (Privacy and Electronic Communications Regulations)
 */

// =============================================
// Types
// =============================================

export type CallPurpose =
    | 'appointment_reminder'    // Randevu hatırlatma
    | 'payment_reminder'        // Ödeme hatırlatma
    | 'delivery_notification'   // Teslimat bildirimi
    | 'service_followup'        // Servis takibi
    | 'survey_feedback'         // Anket/geri bildirim
    | 'contract_renewal'        // Sözleşme yenileme
    | 'b2b_outreach'            // B2B iletişim
    | 'marketing'               // Pazarlama/satış
    | 'custom';                 // Özel

export type CallCategory = 'transactional' | 'service' | 'marketing';

export interface CallTypeRules {
    category: CallCategory;
    consentRequired: boolean;       // Needs explicit marketing consent?
    iysRequired: boolean;           // Needs IYS registration? (Turkey)
    dncCheckRequired: boolean;      // Must check Do-Not-Call registries?
    frequencyLimitApplies: boolean; // Subject to call frequency limits?
    exemptionBasis: string;         // Legal basis for exemption
}

// =============================================
// Classification Rules
// =============================================

const CALL_TYPE_RULES: Record<CallPurpose, CallTypeRules> = {
    appointment_reminder: {
        category: 'transactional',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: false,
        frequencyLimitApplies: false,
        exemptionBasis: 'Transactional notification — existing appointment',
    },
    payment_reminder: {
        category: 'transactional',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: false,
        frequencyLimitApplies: false,
        exemptionBasis: 'Transactional notification — payment obligation',
    },
    delivery_notification: {
        category: 'transactional',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: false,
        frequencyLimitApplies: false,
        exemptionBasis: 'Transactional notification — delivery status',
    },
    service_followup: {
        category: 'service',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: false,
        frequencyLimitApplies: false,
        exemptionBasis: 'Service communication — existing business relationship',
    },
    survey_feedback: {
        category: 'service',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: false,
        frequencyLimitApplies: true,
        exemptionBasis: 'Service communication — quality assurance',
    },
    contract_renewal: {
        category: 'service',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: false,
        frequencyLimitApplies: false,
        exemptionBasis: 'Service communication — contractual obligation',
    },
    b2b_outreach: {
        category: 'marketing',
        consentRequired: false,
        iysRequired: false,
        dncCheckRequired: true,
        frequencyLimitApplies: true,
        exemptionBasis: 'B2B exemption — business-to-business communication',
    },
    marketing: {
        category: 'marketing',
        consentRequired: true,
        iysRequired: true,
        dncCheckRequired: true,
        frequencyLimitApplies: true,
        exemptionBasis: 'No exemption — full consent required',
    },
    custom: {
        category: 'marketing',
        consentRequired: true,
        iysRequired: true,
        dncCheckRequired: true,
        frequencyLimitApplies: true,
        exemptionBasis: 'No exemption — defaults to strictest rules',
    },
};

// =============================================
// Exemption texts per country
// =============================================

const EXEMPTION_TEXTS: Record<string, Record<CallCategory, string>> = {
    TR: {
        transactional: '6563 sayılı kanun kapsamında hizmet bildirimi muafiyeti',
        service: '6563 sayılı kanun kapsamında mevcut iş ilişkisi muafiyeti',
        marketing: 'Ticari elektronik ileti — önceden onay gereklidir (İYS)',
    },
    DE: {
        transactional: 'UWG §7 Abs. 2 Nr. 1 — Transaktionsmitteilung',
        service: 'UWG §7 Abs. 2 Nr. 1 — Geschäftsbeziehung',
        marketing: 'UWG §7 — Ausdrückliche Einwilligung erforderlich',
    },
    FR: {
        transactional: 'Code de la consommation — communication transactionnelle',
        service: 'Code de la consommation — communication contractuelle',
        marketing: 'Code de la consommation — consentement préalable requis',
    },
    US: {
        transactional: 'TCPA informational call exemption',
        service: 'TCPA established business relationship exemption',
        marketing: 'TCPA — prior express written consent required',
    },
    UK: {
        transactional: 'PECR Regulation 21 — service message exemption',
        service: 'PECR Regulation 21 — existing customer exemption',
        marketing: 'PECR — explicit consent required',
    },
};

// =============================================
// Public API
// =============================================

/**
 * Classify a call purpose and return the applicable regulatory rules.
 */
export function classifyCallPurpose(purpose: CallPurpose): CallTypeRules {
    return CALL_TYPE_RULES[purpose] || CALL_TYPE_RULES.custom;
}

/**
 * Get the legal exemption text for a given call purpose and country.
 * Falls back to English (US) text if the country is not explicitly mapped.
 */
export function getExemptionText(purpose: CallPurpose, country: string): string {
    const rules = classifyCallPurpose(purpose);
    const countryUpper = country.toUpperCase();
    const countryTexts = EXEMPTION_TEXTS[countryUpper] || EXEMPTION_TEXTS.US;
    return countryTexts[rules.category];
}

/**
 * Get all call purposes for UI dropdowns.
 * Returns value, translation key, and category for each purpose.
 */
export function getAllCallPurposes(): { value: CallPurpose; labelKey: string; category: CallCategory }[] {
    return [
        { value: 'appointment_reminder', labelKey: 'appointmentReminder', category: 'transactional' },
        { value: 'payment_reminder', labelKey: 'paymentReminder', category: 'transactional' },
        { value: 'delivery_notification', labelKey: 'deliveryNotification', category: 'transactional' },
        { value: 'service_followup', labelKey: 'serviceFollowup', category: 'service' },
        { value: 'survey_feedback', labelKey: 'surveyFeedback', category: 'service' },
        { value: 'contract_renewal', labelKey: 'contractRenewal', category: 'service' },
        { value: 'b2b_outreach', labelKey: 'b2bOutreach', category: 'marketing' },
        { value: 'marketing', labelKey: 'marketingCall', category: 'marketing' },
        { value: 'custom', labelKey: 'customCall', category: 'marketing' },
    ];
}
