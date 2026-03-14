/**
 * Twilio Telephony Helpers
 *
 * Manages Twilio integration for Callception:
 * - TwiML generation for ConversationRelay
 * - Call status tracking
 * - Phone number management per tenant
 * - Signature validation
 */

import crypto, { createHmac } from 'crypto';

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

import type { ProviderType, SipCarrier } from '@/lib/phone/types';

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
    /** Telephony provider (SIP_TRUNK for Turkey, TWILIO_NATIVE for global) */
    providerType?: ProviderType;
    /** SIP trunk carrier name (only for SIP_TRUNK) */
    sipCarrier?: SipCarrier;
}

/**
 * Resolved tenant info from phone number lookup.
 * Extended with provider metadata for hybrid routing.
 */
export interface ResolvedTenant {
    tenantId: string;
    providerType?: ProviderType;
    sipCarrier?: SipCarrier;
    country?: string;
    /** Agent ID bound to this phone number (direct routing) */
    agentId?: string;
}

// =============================================
// TwiML Generators
// =============================================

/**
 * Generate TwiML for incoming calls using ConversationRelay.
 * This connects human caller → Twilio STT → WebSocket → Callception → TTS.
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
        welcomeGreeting = 'Merhaba, Callception sesli asistanına hoşgeldiniz. Size nasıl yardımcı olabilirim?',
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

    // Timing-safe comparison to prevent timing attacks
    try {
        const sigBuf = Buffer.from(signature, 'utf-8');
        const expBuf = Buffer.from(expectedSignature, 'utf-8');
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (err) {
        console.warn('[Twilio:Telephony] Signature comparison failed:', err instanceof Error ? err.message : err);
        return false;
    }
}

// =============================================
// Phone number → Tenant resolution
// =============================================

/**
 * Resolve which tenant owns a given phone number.
 * Looks up Firestore: tenant_phone_numbers/{phoneNumber}
 *
 * Returns enriched ResolvedTenant with provider metadata for hybrid routing.
 * Backward-compatible: callers can use `resolved?.tenantId` as before.
 */
export async function resolveTenantFromPhone(
    db: FirebaseFirestore.Firestore,
    phoneNumber: string,
): Promise<ResolvedTenant | null> {
    // Normalize: remove spaces, dashes
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');

    const doc = await db.collection('tenant_phone_numbers').doc(normalized).get();
    if (doc.exists) {
        const data = doc.data()!;
        const tenantId = (data.tenantId as string) || null;
        if (!tenantId) return null;

        return {
            tenantId,
            providerType: data.providerType || 'TWILIO_NATIVE',
            sipCarrier: data.sipCarrier || undefined,
            country: data.country || undefined,
            agentId: data.agentId || undefined,
        };
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
// Vercel-Compatible TwiML (No WebSocket needed)
// =============================================

/**
 * Generate TwiML for incoming call with speech gathering.
 * Works on Vercel/serverless - no WebSocket required.
 *
 * Flow: Twilio answers → Says greeting → Gathers speech → POSTs to /api/twilio/gather
 */
export function generateGatherTwiML(options: {
    gatherUrl: string;
    message: string;
    language?: string;
    voice?: string;
    timeout?: number;
    speechTimeout?: string;
    statusCallbackUrl?: string;
    recordCall?: boolean;
    recordingCallbackUrl?: string;
    audioUrl?: string; // Cartesia <Play> URL — if provided, uses <Play> instead of <Say> for greeting
}): string {
    const {
        gatherUrl,
        message,
        language = 'tr-TR',
        voice = 'Google.tr-TR-Wavenet-A',
        timeout = 10,
        speechTimeout = 'auto',
        statusCallbackUrl,
        recordCall = false,
        recordingCallbackUrl,
        audioUrl,
    } = options;

    // Optional call recording directive
    const recordDirective = recordCall
        ? `<Record recordingStatusCallback="${escapeXml(recordingCallbackUrl || '')}" recordingStatusCallbackMethod="POST" trim="trim-silence" maxLength="3600" />\n  `
        : '';

    const langAttr = `language="${escapeXml(language)}"`;
    const voiceAttr = `voice="${escapeXml(voice)}"`;
    const gatherAttr = `input="speech" action="${escapeXml(gatherUrl)}" method="POST" ${langAttr} speechTimeout="${speechTimeout}" timeout="${timeout}"`;

    // Use <Play> for Cartesia audio, fall back to <Say> for Google TTS
    const greetingTag = audioUrl
        ? `<Play>${escapeXml(audioUrl)}</Play>`
        : `<Say ${langAttr} ${voiceAttr}>${escapeXml(message)}</Say>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${recordDirective}${greetingTag}
  <Gather ${gatherAttr}/>
  <Say ${langAttr} ${voiceAttr}>${language === 'en-US' ? 'I could not hear you. Could you please repeat?' : 'Sizi duyamadım, tekrar söyleyebilir misiniz?'}</Say>
  <Gather ${gatherAttr}/>
  <Say ${langAttr} ${voiceAttr}>${language === 'en-US' ? 'Thank you for calling. Goodbye.' : 'Aradığınız için teşekkür ederiz. İyi günler.'}</Say>
  ${statusCallbackUrl ? `<Redirect>${escapeXml(statusCallbackUrl)}</Redirect>` : '<Hangup/>'}
</Response>`;
}

/**
 * Generate TwiML for continuing conversation after AI response.
 * Says the AI response, then gathers next speech input.
 */
export function generateResponseAndGatherTwiML(options: {
    gatherUrl: string;
    aiResponse: string;
    language?: string;
    voice?: string;
    timeout?: number;
    speechTimeout?: string;
    shouldHangup?: boolean;
    audioUrl?: string; // Cartesia <Play> URL — if provided, uses <Play> instead of <Say> for AI response
}): string {
    const {
        gatherUrl,
        aiResponse,
        language = 'tr-TR',
        voice = 'Google.tr-TR-Wavenet-A',
        timeout = 10,
        speechTimeout = 'auto',
        shouldHangup = false,
        audioUrl,
    } = options;

    const langAttr = `language="${escapeXml(language)}"`;
    const voiceAttr = `voice="${escapeXml(voice)}"`;
    const gatherAttr = `input="speech" action="${escapeXml(gatherUrl)}" method="POST" ${langAttr} speechTimeout="${speechTimeout}" timeout="${timeout}"`;

    // Use <Play> for Cartesia audio, fall back to <Say> for Google TTS
    const responseTag = audioUrl
        ? `<Play>${escapeXml(audioUrl)}</Play>`
        : `<Say ${langAttr} ${voiceAttr}>${escapeXml(aiResponse)}</Say>`;

    if (shouldHangup) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${responseTag}
  <Hangup/>
</Response>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${responseTag}
  <Gather ${gatherAttr}/>
  <Say ${langAttr} ${voiceAttr}>${language === 'en-US' ? 'Are you still there?' : 'Hâlâ orada mısınız?'}</Say>
  <Gather ${gatherAttr}/>
  <Say ${langAttr} ${voiceAttr}>${language === 'en-US' ? 'Thank you for calling. Goodbye.' : 'Başka bir sorunuz yoksa, aradığınız için teşekkür ederiz. İyi günler.'}</Say>
  <Hangup/>
</Response>`;
}

// =============================================
// Phone TTS URL Builder (Cartesia via <Play>)
// =============================================

/**
 * Build a signed URL for the phone TTS endpoint.
 * Twilio fetches this URL when processing <Play> tags.
 *
 * @param baseUrl  - e.g. "https://callception.com"
 * @param text     - Text to synthesize
 * @param lang     - 'tr' | 'en'
 * @param voiceId  - Cartesia voice UUID (optional, defaults to Leyla/Katie)
 */
export function buildPhoneTtsUrl(baseUrl: string, text: string, lang: string, voiceId?: string): string {
    const secret = process.env.TWILIO_AUTH_TOKEN || '';
    const vid = voiceId || '';
    const textB64 = Buffer.from(text).toString('base64url');
    const data = `${text}:${lang}:${vid}`;
    const sig = createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);
    return `${baseUrl}/api/voice/tts/phone?t=${textB64}&l=${encodeURIComponent(lang)}&v=${encodeURIComponent(vid)}&s=${sig}`;
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
