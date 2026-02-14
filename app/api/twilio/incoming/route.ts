/**
 * Twilio Incoming Call Webhook
 *
 * POST /api/twilio/incoming
 *
 * Called by Twilio when a phone call arrives.
 * Flow:
 * 1. Validate Twilio signature
 * 2. Resolve tenant from called phone number
 * 3. Load agent config for tenant
 * 4. Return TwiML with ConversationRelay pointing to our WS endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
    generateConversationRelayTwiML,
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

        // Load tenant's active agent config
        const agentsSnap = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('agents')
            .where('isActive', '==', true)
            .limit(1)
            .get();

        const agent = agentsSnap.docs[0]?.data();

        // Build WebSocket URL for ConversationRelay
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'ws' : 'wss';
        const wsUrl = `${protocol}://${host}/api/twilio/ws?tenantId=${tenantId}&callSid=${callEvent.CallSid}`;

        // Determine greeting
        const welcomeGreeting = agent?.systemPrompt
            ? extractGreeting(agent.systemPrompt)
            : 'Merhaba, size nasıl yardımcı olabilirim?';

        // Determine language
        const language = agent?.voiceConfig?.language === 'en' ? 'en-US' : 'tr-TR';

        // Generate TwiML
        const twiml = generateConversationRelayTwiML({
            wsUrl,
            welcomeGreeting,
            language,
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

/**
 * Extract greeting from agent system prompt.
 * Looks for the first line or a greeting pattern.
 */
function extractGreeting(systemPrompt: string): string {
    // Look for common greeting patterns
    const greetingPatterns = [
        /karşıla[:\-–\s]+["']?([^"'\n]+)["']?/i,
        /greeting[:\-–\s]+["']?([^"'\n]+)["']?/i,
        /hoşgeldin[a-z]*[:\-–\s]+["']?([^"'\n]+)["']?/i,
    ];

    for (const pattern of greetingPatterns) {
        const match = systemPrompt.match(pattern);
        if (match?.[1]) return match[1].trim();
    }

    return 'Merhaba, size nasıl yardımcı olabilirim?';
}
