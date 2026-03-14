/**
 * Twilio Incoming Call Webhook
 *
 * POST /api/twilio/incoming
 *
 * Called by Twilio when a phone call arrives.
 * Vercel-compatible: Uses <Gather> + <Say> instead of WebSocket.
 *
 * Flow:
 * 1. Validate Twilio signature
 * 2. Resolve tenant from called phone number
 * 3. Check working hours → voicemail if after-hours
 * 4. Load agent config for tenant
 * 5. Return TwiML with greeting + speech gather
 * 6. Twilio POSTs transcribed speech to /api/twilio/gather
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
    generateGatherTwiML,
    generateUnavailableTwiML,
    generateVoicemailTwiML,
    resolveTenantFromPhone,
    validateTwilioSignature,
    getTwilioConfig,
    type TwilioCallEvent,
} from '@/lib/twilio/telephony';
import { checkCallAllowed } from '@/lib/billing/usage-guard';
import { getSubscription, isSubscriptionActive } from '@/lib/billing/lemonsqueezy';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { isCartesiaConfigured, synthesizeCartesiaTTS } from '@/lib/voice/tts-cartesia';
import { cachePhoneAudio } from '@/lib/voice/phone-audio-cache';
import { localeBCP47 } from '@/lib/i18n/config';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('twilio:incoming');

type VoiceLang = 'tr' | 'en' | 'de' | 'fr';

/** Resolve tenant/agent language to a valid voice lang */
function resolveVoiceLang(lang?: string | null): VoiceLang {
    if (lang === 'en' || lang === 'de' || lang === 'fr') return lang;
    return 'tr';
}

/** Language-aware greeting templates */
function buildAgentGreeting(lang: VoiceLang, agentName: string, companyName: string): string {
    switch (lang) {
        case 'en': return `Hello, this is ${agentName || 'the assistant'}${companyName ? ` from ${companyName}` : ''}. How can I help you?`;
        case 'de': return `Hallo, hier ist ${agentName || 'der Assistent'}${companyName ? ` von ${companyName}` : ''}. Wie kann ich Ihnen helfen?`;
        case 'fr': return `Bonjour, ici ${agentName || 'l\'assistant'}${companyName ? ` de ${companyName}` : ''}. Comment puis-je vous aider ?`;
        default: return `Merhaba, ${companyName ? `${companyName} ` : ''}${agentName || 'asistan'} olarak size nasıl yardımcı olabilirim?`;
    }
}

/** Default greetings per language */
const DEFAULT_GREETINGS: Record<VoiceLang, string> = {
    tr: 'Merhaba, size nasıl yardımcı olabilirim?',
    en: 'Hello, how can I help you?',
    de: 'Hallo, wie kann ich Ihnen helfen?',
    fr: 'Bonjour, comment puis-je vous aider ?',
};

/** Disabled assistant messages per language */
const DISABLED_MESSAGES: Record<VoiceLang, string> = {
    tr: 'Şu anda asistanımız aktif değildir. Lütfen daha sonra tekrar arayınız. İyi günler.',
    en: 'Our assistant is currently unavailable. Please call again later. Have a good day.',
    de: 'Unser Assistent ist derzeit nicht verfügbar. Bitte rufen Sie später erneut an. Schönen Tag.',
    fr: 'Notre assistant est actuellement indisponible. Veuillez rappeler plus tard. Bonne journée.',
};

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') || '';
        let params: Record<string, string> = {};

        // Parse Twilio form-encoded body
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            formData.forEach((value, key) => { params[key] = String(value); });
        } else {
            params = await request.json();
        }

        const callEvent = params as unknown as TwilioCallEvent;
        const config = getTwilioConfig();

        // Validate Twilio signature — mandatory in production
        const signature = request.headers.get('x-twilio-signature') || '';
        if (config.authToken) {
            const requestUrl = request.url;
            if (!validateTwilioSignature(config.authToken, requestUrl, params, signature)) {
                console.error('[twilio/incoming] Invalid Twilio signature — rejecting request');
                return new NextResponse('Forbidden', { status: 403 });
            }
        } else if (process.env.NODE_ENV === 'production') {
            console.error('[twilio/incoming] TWILIO_AUTH_TOKEN not configured in production — rejecting');
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Sistem bakımda. Lütfen daha sonra arayın.' }),
                { headers: { 'Content-Type': 'text/xml' } },
            );
        }

        // Resolve tenant from the called number (returns enriched ResolvedTenant)
        const calledNumber = callEvent.To;
        const callerNumber = callEvent.From;
        const resolved = await resolveTenantFromPhone(getDb(), calledNumber);
        const tenantId = resolved?.tenantId || null;
        const providerType = resolved?.providerType || 'TWILIO_NATIVE';
        const sipCarrier = resolved?.sipCarrier;

        log.info('call:incoming', {
            callSid: callEvent.CallSid,
            from: callerNumber,
            to: calledNumber,
            tenantId,
            providerType,
            agentId: resolved?.agentId || null,
        });

        if (!tenantId) {
            const twiml = generateUnavailableTwiML({
                message: 'Bu numara henüz yapılandırılmamış. Lütfen daha sonra tekrar deneyin.',
            });
            return new NextResponse(twiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // ── Subscription & Usage Guard ──────────────────────────────
        // 1. Check subscription status (cancelled/expired → reject)
        const subscription = await getSubscription(getDb(), tenantId);
        if (subscription && !isSubscriptionActive(subscription)) {
            const twiml = generateUnavailableTwiML({
                message: 'Bu hattın aboneliği sona ermiştir. Lütfen hesabınızı yenileyip tekrar deneyin.',
            });
            return new NextResponse(twiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // 2. Check plan usage limits (minutes & call count)
        const tierName = subscription?.planId || 'starter';
        const usageCheck = await checkCallAllowed(getDb(), tenantId, tierName);
        if (!usageCheck.allowed) {
            const twiml = generateUnavailableTwiML({
                message: usageCheck.reason || 'Aylık kullanım limitiniz dolmuştur. Lütfen planınızı yükseltin.',
            });
            return new NextResponse(twiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // ── Load tenant config for greeting ─────────────────────────
        const tenantSnap = await getDb().collection('tenants').doc(tenantId).get();
        const tenantData = tenantSnap.data();

        // Load agent: prefer direct agentId binding, fallback to first active agent
        const boundAgentId = resolved?.agentId;
        let activeAgentGreeting: string | null = null;
        let activeAgentLanguage: string | null = null;
        let resolvedAgentId: string | null = boundAgentId || null;
        try {
            if (boundAgentId) {
                // Direct: phone number is bound to a specific agent
                const agentDoc = await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('agents').doc(boundAgentId)
                    .get();
                if (agentDoc.exists) {
                    const agentData = agentDoc.data()!;
                    activeAgentLanguage = agentData?.voiceConfig?.language || null;
                    const companyName = agentData?.variables?.find((v: { key: string }) => v.key === 'company_name')?.defaultValue || '';
                    const agentName = agentData?.name || '';
                    if (companyName || agentName) {
                        const lang = resolveVoiceLang(activeAgentLanguage);
                        activeAgentGreeting = buildAgentGreeting(lang, agentName, companyName);
                    }
                }
            } else {
                // Legacy fallback: find first active agent
                const agentsSnap = await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('agents')
                    .where('isActive', '==', true)
                    .limit(1)
                    .get();
                if (!agentsSnap.empty) {
                    const agentData = agentsSnap.docs[0].data();
                    resolvedAgentId = agentsSnap.docs[0].id;
                    activeAgentLanguage = agentData?.voiceConfig?.language || null;
                    const companyName = agentData?.variables?.find((v: { key: string }) => v.key === 'company_name')?.defaultValue || '';
                    const agentName = agentData?.name || '';
                    if (companyName || agentName) {
                        const lang = resolveVoiceLang(activeAgentLanguage);
                        activeAgentGreeting = buildAgentGreeting(lang, agentName, companyName);
                    }
                }
            }
        } catch {
            // Fallback to tenant-level greeting
        }

        const resolvedLang = resolveVoiceLang(activeAgentLanguage || tenantData?.language);
        const greeting = activeAgentGreeting || tenantData?.agent?.greeting || DEFAULT_GREETINGS[resolvedLang];
        const language = localeBCP47[resolvedLang];

        // ── Check if AI assistant is enabled ─────────────────────────
        const assistantEnabled = tenantData?.settings?.assistantEnabled ?? false;
        if (!assistantEnabled) {
            const disabledTwiml = generateUnavailableTwiML({
                message: DISABLED_MESSAGES[resolvedLang],
                language,
            });
            return new NextResponse(disabledTwiml, {
                status: 200,
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // ── Pre-warm GPU Pod for enterprise tenants (fire-and-forget) ─
        const isEnterprisePlan = tierName === 'enterprise';
        if (isEnterprisePlan && assistantEnabled && gpuManager.isPodConfigured()) {
            gpuManager.ensureReady().catch(() => {});
        }

        // Build URLs
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        const gatherUrl = `${baseUrl}/api/twilio/gather?tenantId=${tenantId}&callSid=${callEvent.CallSid}${resolvedAgentId ? `&agentId=${resolvedAgentId}` : ''}`;
        const statusUrl = `${baseUrl}/api/twilio/status`;
        const recordingUrl = `${baseUrl}/api/twilio/recording`;
        const voicemailUrl = `${baseUrl}/api/twilio/voicemail?tenantId=${tenantId}&callSid=${callEvent.CallSid}`;

        // ── Working Hours Check → Voicemail ──────────────────────────
        const workingHours = tenantData?.business?.workingHours; // e.g. "09:00-18:00"
        const workingDays = tenantData?.business?.workingDays;   // e.g. "Pazartesi-Cuma"
        const tenantTimezone = tenantData?.timezone;             // e.g. "Europe/Istanbul"

        if (workingHours && isOutsideWorkingHours(workingHours, workingDays, tenantTimezone)) {
            const afterHoursMsg = tenantData?.agent?.farewell
                || 'Şu anda mesai saatleri dışındayız. Lütfen bip sesinden sonra mesajınızı bırakın.';

            const voicemailTwiml = generateVoicemailTwiML({
                message: afterHoursMsg,
                maxLength: 120,
                recordingStatusCallbackUrl: voicemailUrl,
            });

            // Still log the call in Firestore as after-hours
            await getDb()
                .collection('tenants').doc(tenantId)
                .collection('calls').doc(callEvent.CallSid)
                .set({
                    callSid: callEvent.CallSid,
                    tenantId,
                    from: callerNumber,
                    to: calledNumber,
                    direction: 'inbound',
                    status: 'voicemail',
                    channel: 'twilio',
                    providerType,
                    sipCarrier: sipCarrier || null,
                    callerName: callEvent.CallerName || null,
                    startedAt: FieldValue.serverTimestamp(),
                    afterHours: true,
                });

            return new NextResponse(voicemailTwiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // Check if recording is enabled for this tenant
        const recordCall = tenantData?.settings?.callRecording === true;

        // Pre-generate Cartesia greeting audio + Firestore write in PARALLEL
        const cartesiaLang = resolvedLang; // Already resolved to 'tr'|'en'|'de'|'fr'
        const agentVoiceId = undefined; // no voiceId binding at phone level yet

        const [cartesiaResult] = await Promise.all([
            // Pre-generate greeting audio (Twilio will serve from cache instantly)
            isCartesiaConfigured()
                ? synthesizeCartesiaTTS(greeting, cartesiaLang, agentVoiceId).catch(() => null)
                : Promise.resolve(null),

            // Record the call in Firestore (parallel — don't block TwiML)
            getDb()
                .collection('tenants').doc(tenantId)
                .collection('calls').doc(callEvent.CallSid)
                .set({
                    callSid: callEvent.CallSid,
                    tenantId,
                    from: callerNumber,
                    to: calledNumber,
                    direction: 'inbound',
                    status: callEvent.CallStatus || 'ringing',
                    channel: 'twilio',
                    providerType,
                    sipCarrier: sipCarrier || null,
                    callerName: callEvent.CallerName || null,
                    callerCountry: callEvent.CallerCountry || null,
                    startedAt: FieldValue.serverTimestamp(),
                    conversationHistory: [],
                    metadata: {
                        accountSid: callEvent.AccountSid,
                        callerCity: callEvent.CallerCity,
                        callerState: callEvent.CallerState,
                    },
                }).catch(() => {}),

            // Meter the call start (parallel)
            getDb()
                .collection('tenants').doc(tenantId)
                .collection('usage').doc('current')
                .set({
                    totalCalls: FieldValue.increment(1),
                    inboundCalls: FieldValue.increment(1),
                    lastCallAt: FieldValue.serverTimestamp(),
                }, { merge: true }).catch(() => {}),
        ]);

        // Cache greeting audio → Twilio <Play> serves from cache instantly
        let greetingAudioUrl: string | undefined;
        if (cartesiaResult) {
            const audioId = crypto.randomUUID();
            const audioBuf = Buffer.from(await cartesiaResult.arrayBuffer());
            cachePhoneAudio(audioId, audioBuf);
            greetingAudioUrl = `${baseUrl}/api/voice/tts/phone?id=${audioId}`;
        }

        // Generate TwiML: Play/Say greeting, then gather speech (optionally record)
        const twiml = generateGatherTwiML({
            gatherUrl,
            message: greeting,
            language,
            statusCallbackUrl: statusUrl,
            recordCall,
            recordingCallbackUrl: recordingUrl,
            audioUrl: greetingAudioUrl,
        });

        return new NextResponse(twiml, {
            headers: { 'Content-Type': 'text/xml' },
        });

    } catch {
        const fallback = generateUnavailableTwiML({
            message: 'Bir teknik sorun yaşıyoruz. Lütfen daha sonra tekrar arayın.',
        });
        return new NextResponse(fallback, {
            headers: { 'Content-Type': 'text/xml' },
        });
    }
}

// =============================================
// Working Hours Helper
// =============================================

const DAY_MAP: Record<string, number> = {
    'pazar': 0, 'pazartesi': 1, 'salı': 2,
    'çarşamba': 3, 'perşembe': 4, 'cuma': 5, 'cumartesi': 6,
    'sunday': 0, 'monday': 1, 'tuesday': 2,
    'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6,
};

/**
 * Check if current time is outside working hours.
 *
 * @param workingHours - Format: "09:00-18:00"
 * @param workingDays - Format: "Pazartesi-Cuma" or "Monday-Friday"
 * @param timezone - IANA timezone (e.g. "Europe/Istanbul"). Defaults to Europe/Istanbul.
 * @returns true if currently outside working hours
 */
function isOutsideWorkingHours(workingHours: string, workingDays?: string, timezone?: string): boolean {
    try {
        // Parse hours — "09:00-18:00"
        const hoursParts = workingHours.split('-');
        if (hoursParts.length !== 2) return false; // Malformed → allow call

        const [startStr, endStr] = hoursParts;
        const [startH, startM] = startStr.trim().split(':').map(Number);
        const [endH, endM] = endStr.trim().split(':').map(Number);

        // Use tenant's timezone, fallback to Europe/Istanbul for backward compat
        const tz = timezone || 'Europe/Istanbul';
        const now = new Date();
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();
        const startMinutes = startH * 60 + (startM || 0);
        const endMinutes = endH * 60 + (endM || 0);

        // Check day of week
        if (workingDays) {
            const dayParts = workingDays.toLowerCase().split('-');
            if (dayParts.length === 2) {
                const startDay = DAY_MAP[dayParts[0].trim()];
                const endDay = DAY_MAP[dayParts[1].trim()];
                if (startDay !== undefined && endDay !== undefined) {
                    const currentDay = localTime.getDay();
                    // Check if current day is outside working days
                    if (startDay <= endDay) {
                        // Normal range: Mon(1)-Fri(5)
                        if (currentDay < startDay || currentDay > endDay) return true;
                    } else {
                        // Wrapped range (unusual but handle)
                        if (currentDay < startDay && currentDay > endDay) return true;
                    }
                }
            }
        }

        // Check time
        if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            return true;
        }

        return false;
    } catch {
        // If parsing fails, don't block the call
        return false;
    }
}
