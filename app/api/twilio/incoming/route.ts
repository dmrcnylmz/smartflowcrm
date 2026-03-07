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

        // Validate Twilio signature (if auth token configured)
        if (config.authToken) {
            const signature = request.headers.get('x-twilio-signature') || '';
            const requestUrl = request.url;

            if (!validateTwilioSignature(config.authToken, requestUrl, params, signature)) {
                return new NextResponse('Forbidden', { status: 403 });
            }
        }

        // Resolve tenant from the called number (returns enriched ResolvedTenant)
        const calledNumber = callEvent.To;
        const callerNumber = callEvent.From;
        const resolved = await resolveTenantFromPhone(getDb(), calledNumber);
        const tenantId = resolved?.tenantId || null;
        const providerType = resolved?.providerType || 'TWILIO_NATIVE';
        const sipCarrier = resolved?.sipCarrier;

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
        const greeting = tenantData?.agent?.greeting || 'Merhaba, size nasıl yardımcı olabilirim?';
        const language = tenantData?.language === 'en' ? 'en-US' : 'tr-TR';

        // Build URLs
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        const gatherUrl = `${baseUrl}/api/twilio/gather?tenantId=${tenantId}&callSid=${callEvent.CallSid}`;
        const statusUrl = `${baseUrl}/api/twilio/status`;
        const recordingUrl = `${baseUrl}/api/twilio/recording`;
        const voicemailUrl = `${baseUrl}/api/twilio/voicemail?tenantId=${tenantId}&callSid=${callEvent.CallSid}`;

        // ── Working Hours Check → Voicemail ──────────────────────────
        const workingHours = tenantData?.business?.workingHours; // e.g. "09:00-18:00"
        const workingDays = tenantData?.business?.workingDays;   // e.g. "Pazartesi-Cuma"

        if (workingHours && isOutsideWorkingHours(workingHours, workingDays)) {
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

        // Generate TwiML: Say greeting, then gather speech (optionally record)
        const twiml = generateGatherTwiML({
            gatherUrl,
            message: greeting,
            language,
            statusCallbackUrl: statusUrl,
            recordCall,
            recordingCallbackUrl: recordingUrl,
        });

        // Record the call in Firestore
        await getDb()
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
            });

        // Meter the call start
        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('usage').doc('current')
            .set({
                totalCalls: FieldValue.increment(1),
                inboundCalls: FieldValue.increment(1),
                lastCallAt: FieldValue.serverTimestamp(),
            }, { merge: true });

        // Incoming call logged via Firestore usage metering above

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
    'pazar': 0, 'pazartesi': 1, 'salı': 2, 'salı': 2,
    'çarşamba': 3, 'perşembe': 4, 'cuma': 5, 'cumartesi': 6,
    'sunday': 0, 'monday': 1, 'tuesday': 2,
    'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6,
};

/**
 * Check if current time is outside working hours.
 *
 * @param workingHours - Format: "09:00-18:00"
 * @param workingDays - Format: "Pazartesi-Cuma" or "Monday-Friday"
 * @returns true if currently outside working hours
 */
function isOutsideWorkingHours(workingHours: string, workingDays?: string): boolean {
    try {
        // Parse hours — "09:00-18:00"
        const hoursParts = workingHours.split('-');
        if (hoursParts.length !== 2) return false; // Malformed → allow call

        const [startStr, endStr] = hoursParts;
        const [startH, startM] = startStr.trim().split(':').map(Number);
        const [endH, endM] = endStr.trim().split(':').map(Number);

        // Use Turkey timezone (most tenants are TR-based)
        const now = new Date();
        const trTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const currentMinutes = trTime.getHours() * 60 + trTime.getMinutes();
        const startMinutes = startH * 60 + (startM || 0);
        const endMinutes = endH * 60 + (endM || 0);

        // Check day of week
        if (workingDays) {
            const dayParts = workingDays.toLowerCase().split('-');
            if (dayParts.length === 2) {
                const startDay = DAY_MAP[dayParts[0].trim()];
                const endDay = DAY_MAP[dayParts[1].trim()];
                if (startDay !== undefined && endDay !== undefined) {
                    const currentDay = trTime.getDay();
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
