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
 * 3. Load agent config for tenant
 * 4. Return TwiML with greeting + speech gather
 * 5. Twilio POSTs transcribed speech to /api/twilio/gather
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
    generateGatherTwiML,
    generateUnavailableTwiML,
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

        // Resolve tenant from the called number
        const calledNumber = callEvent.To;
        const callerNumber = callEvent.From;
        const tenantId = await resolveTenantFromPhone(getDb(), calledNumber);

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
