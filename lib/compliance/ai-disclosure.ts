/**
 * Compliance: AI Disclosure & Recording Disclaimer
 *
 * HARD-CODED legal messages that CANNOT be disabled by users.
 * These are played at the START of every call (inbound + outbound).
 *
 * Regulations:
 * - EU AI Act: AI systems must identify themselves
 * - KVKK (Turkey): Recording consent required
 * - GDPR (EU): Recording consent + legitimate interest disclosure
 * - TCPA (US): Automated call disclosure
 * - UK Ofcom: AI identification requirement
 */

// =============================================
// AI Disclosure Messages (mandatory, non-disableable)
// =============================================

export const AI_DISCLOSURE_MESSAGES: Record<string, string> = {
    tr: 'Bu bir yapay zeka asistanıdır. Görüşmeniz kayıt altına alınabilir.',
    en: 'This is an AI assistant. Your call may be recorded.',
    de: 'Dies ist ein KI-Assistent. Ihr Gespräch kann aufgezeichnet werden.',
    fr: 'Ceci est un assistant IA. Votre appel peut être enregistré.',
};

// =============================================
// Recording Disclaimer Messages
// =============================================

export const RECORDING_DISCLAIMER: Record<string, string> = {
    tr: 'Bu görüşme kalite ve eğitim amacıyla kayıt altına alınmaktadır. Devam ederek kaydı onaylıyorsunuz.',
    en: 'This call is being recorded for quality and training purposes. By continuing, you consent to the recording.',
    de: 'Dieses Gespräch wird zu Qualitäts- und Schulungszwecken aufgezeichnet. Durch Fortsetzen stimmen Sie der Aufzeichnung zu.',
    fr: 'Cet appel est enregistré à des fins de qualité et de formation. En continuant, vous acceptez l\'enregistrement.',
};

// =============================================
// Public API
// =============================================

/**
 * Get AI disclosure message for a language.
 * NEVER returns empty — falls back to English.
 */
export function getAIDisclosure(language: string): string {
    const lang = language.toLowerCase().slice(0, 2);
    return AI_DISCLOSURE_MESSAGES[lang] || AI_DISCLOSURE_MESSAGES['en'];
}

/**
 * Get recording disclaimer for a language.
 * NEVER returns empty — falls back to English.
 */
export function getRecordingDisclaimer(language: string): string {
    const lang = language.toLowerCase().slice(0, 2);
    return RECORDING_DISCLAIMER[lang] || RECORDING_DISCLAIMER['en'];
}

/**
 * Build a compliance preamble for call start.
 *
 * This is played at the START of every call, BEFORE any conversation.
 * It is HARD-CODED and CANNOT be disabled by users.
 *
 * @param language - 'tr' | 'en' | 'de' | 'fr'
 * @param isRecording - Whether call recording is enabled
 * @returns Combined preamble text
 */
export function buildCompliancePreamble(language: string, isRecording: boolean): string {
    const disclosure = getAIDisclosure(language);

    if (isRecording) {
        const disclaimer = getRecordingDisclaimer(language);
        return `${disclosure} ${disclaimer}`;
    }

    return disclosure;
}
