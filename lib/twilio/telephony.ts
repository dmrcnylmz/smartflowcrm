/**
 * Twilio Telephony Helpers
 *
 * Manages Twilio integration for SmartFlow:
 * - TwiML generation for ConversationRelay
 * - Call status tracking
 * - Phone number management per tenant
 * - Signature validation
 */

import crypto from 'crypto';

// =============================================
// Types
// =============================================

export interface TwilioCallEvent {
    CallSid: string;
    AccountSid: string;
    From: string;
    To: string;
    CallStatus: string;
    Direction: string;
    CallerName?: string;
    ForwardedFrom?: string;
    CallerCity?: string;
    CallerState?: string;
    CallerCountry?: string;
}

export interface TwilioConfig {
    accountSid: string;
    authToken: string;
    defaultPhoneNumber?: string;
    conversationRelayUrl: string;
    statusCallbackUrl: string;
}

export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'canceled';

export interface CallRecord {
    callSid: string;
    tenantId: string;
    from: string;
    to: string;
    direction: 'inbound' | 'outbound';
    status: CallStatus;
    startedAt: number;
    endedAt?: number;
    durationSeconds?: number;
    callerName?: string;
    callerCountry?: string;
    sentiment?: number;
    metadata?: Record<string, unknown>;
}

// =============================================
// TwiML Generators
// =============================================

/**
 * Generate TwiML for incoming calls using ConversationRelay.
 * This connects human caller → Twilio STT → WebSocket → SmartFlow → TTS.
 */
export function generateConversationRelayTwiML(options: {
    wsUrl: string;
    welcomeGreeting?: string;
    language?: string;
    voice?: string;
    dtmfDetection?: boolean;
    interruptible?: boolean;
}): string {
    const {
        wsUrl,
        welcomeGreeting = 'Merhaba, SmartFlow sesli asistanına hoşgeldiniz. Size nasıl yardımcı olabilirim?',
        language = 'tr-TR',
        voice = 'Google.tr-TR-Standard-A',
        dtmfDetection = true,
        interruptible = true,
    } = options;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${escapeXml(wsUrl)}"
      welcomeGreeting="${escapeXml(welcomeGreeting)}"
      ttsProvider="google"
      voice="${escapeXml(voice)}"
      language="${escapeXml(language)}"
      transcriptionProvider="deepgram"
      dtmfDetection="${dtmfDetection}"
      interruptible="${interruptible}"
    />
  </Connect>
</Response>`;
}

/**
 * Generate simple TwiML for unavailable / after-hours scenarios.
 */
export function generateUnavailableTwiML(options?: {
    message?: string;
    language?: string;
}): string {
    const message = options?.message || 'Şu anda hizmetlerimiz aktif değil. Lütfen çalışma saatleri içinde tekrar arayın.';
    const language = options?.language || 'tr-TR';

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${escapeXml(language)}">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate TwiML for voicemail fallback.
 */
export function generateVoicemailTwiML(options?: {
    message?: string;
    maxLength?: number;
    recordingStatusCallbackUrl?: string;
}): string {
    const message = options?.message || 'Şu anda müsait değiliz. Lütfen kısa bir mesaj bırakın.';
    const maxLength = options?.maxLength || 120;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="tr-TR">${escapeXml(message)}</Say>
  <Record maxLength="${maxLength}" playBeep="true" ${options?.recordingStatusCallbackUrl
            ? `recordingStatusCallback="${escapeXml(options.recordingStatusCallbackUrl)}"`
            : ''
        } />
</Response>`;
}

// =============================================
// Signature Validation
// =============================================

/**
 * Validate Twilio webhook signature (X-Twilio-Signature header).
 */
export function validateTwilioSignature(
    authToken: string,
    url: string,
    params: Record<string, string>,
    signature: string,
): boolean {
    // Sort parameters alphabetically and concatenate
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
        data += key + params[key];
    }

    // Compute HMAC-SHA1
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(data, 'utf-8');
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
}

// =============================================
// Phone number → Tenant resolution
// =============================================

/**
 * Resolve which tenant owns a given phone number.
 * Looks up Firestore: tenants_phone_numbers/{phoneNumber} → { tenantId }
 */
export async function resolveTenantFromPhone(
    db: FirebaseFirestore.Firestore,
    phoneNumber: string,
): Promise<string | null> {
    // Normalize: remove spaces, dashes
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');

    const doc = await db.collection('tenant_phone_numbers').doc(normalized).get();
    if (doc.exists) {
        return (doc.data()?.tenantId as string) || null;
    }
    return null;
}

/**
 * Register a phone number to a tenant.
 */
export async function registerPhoneNumber(
    db: FirebaseFirestore.Firestore,
    phoneNumber: string,
    tenantId: string,
): Promise<void> {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    await db.collection('tenant_phone_numbers').doc(normalized).set({
        tenantId,
        phoneNumber: normalized,
        registeredAt: Date.now(),
    });
}

// =============================================
// Helpers
// =============================================

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Get Twilio config from environment variables.
 */
export function getTwilioConfig(): TwilioConfig {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';

    return {
        accountSid,
        authToken,
        defaultPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
        conversationRelayUrl: process.env.TWILIO_CONVERSATION_RELAY_URL || '',
        statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL || '',
    };
}
