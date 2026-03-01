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
                console.warn('[Twilio] Invalid signature rejected');
                return new NextResponse('Forbidden', { status: 403 });
            }
        }

        // Resolve tenant from the called number
        const calledNumber = callEvent.To;
        const callerNumber = callEvent.From;
        const tenantId = await resolveTenantFromPhone(getDb(), calledNumber);

        if (!tenantId) {
            console.warn(`[Twilio] No tenant found for number: ${calledNumber}`);
            const twiml = generateUnavailableTwiML({
                message: 'Bu numara henüz yapılandırılmamış. Lütfen daha sonra tekrar deneyin.',
            });
            return new NextResponse(twiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // Load tenant config for greeting
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

        console.log(`[Twilio] Incoming call: ${callerNumber} → ${calledNumber} (tenant: ${tenantId})`);

        return new NextResponse(twiml, {
            headers: { 'Content-Type': 'text/xml' },
        });

    } catch (error) {
        console.error('[Twilio Incoming] Error:', error);
        const fallback = generateUnavailableTwiML({
            message: 'Bir teknik sorun yaşıyoruz. Lütfen daha sonra tekrar arayın.',
        });
        return new NextResponse(fallback, {
            headers: { 'Content-Type': 'text/xml' },
        });
    }
}
