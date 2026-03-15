/**
 * Twilio Outbound Call Answer Webhook
 *
 * POST /api/twilio/outbound-answer
 *
 * Called by Twilio when the outbound call is answered.
 * Plays an outbound greeting, then gathers speech (same pattern as incoming).
 *
 * Query params: tenantId, agentId, lang, context
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import {
    generateGatherTwiML,
    generateUnavailableTwiML,
    validateTwilioSignature,
    getTwilioConfig,
} from '@/lib/twilio/telephony';
import { buildOutboundGreeting } from '@/lib/twilio/outbound';
import { isCartesiaConfigured, synthesizeCartesiaTTS } from '@/lib/voice/tts-cartesia';
import { cachePhoneAudio } from '@/lib/voice/phone-audio-cache';
import { localeBCP47 } from '@/lib/i18n/config';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('twilio:outbound-answer');

type VoiceLang = 'tr' | 'en' | 'de' | 'fr';

function resolveVoiceLang(lang?: string | null): VoiceLang {
    if (lang === 'en' || lang === 'de' || lang === 'fr') return lang;
    return 'tr';
}

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

        const config = getTwilioConfig();

        // Validate Twilio signature
        const signature = request.headers.get('x-twilio-signature') || '';
        if (config.authToken) {
            if (!validateTwilioSignature(config.authToken, request.url, params, signature)) {
                console.error('[twilio/outbound-answer] Invalid Twilio signature');
                return new NextResponse('Forbidden', { status: 403 });
            }
        } else if (process.env.NODE_ENV === 'production') {
            return new NextResponse(
                generateUnavailableTwiML({ message: 'System maintenance.' }),
                { headers: { 'Content-Type': 'text/xml' } },
            );
        }

        // Get query params
        const tenantId = request.nextUrl.searchParams.get('tenantId');
        const agentId = request.nextUrl.searchParams.get('agentId');
        const langParam = request.nextUrl.searchParams.get('lang');
        const context = request.nextUrl.searchParams.get('context');
        const callSid = params.CallSid || '';

        if (!tenantId || !agentId) {
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Configuration error.' }),
                { headers: { 'Content-Type': 'text/xml' } },
            );
        }

        log.info('outbound-answer', { callSid, tenantId, agentId });

        // Load agent config from Firestore
        const agentDoc = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('agents').doc(agentId)
            .get();

        let agentName = '';
        let companyName = '';
        let agentLanguage: string | null = null;

        if (agentDoc.exists) {
            const agentData = agentDoc.data()!;
            agentName = agentData.name || '';
            agentLanguage = agentData.voiceConfig?.language || null;
            companyName = agentData.variables?.find(
                (v: { key: string }) => v.key === 'company_name',
            )?.defaultValue || '';
        }

        const resolvedLang = resolveVoiceLang(langParam || agentLanguage);
        const language = localeBCP47[resolvedLang];

        // Build outbound greeting
        const greeting = buildOutboundGreeting(resolvedLang, agentName, companyName);

        // Build URLs
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        const gatherUrl = `${baseUrl}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}&agentId=${agentId}`;

        // Update call status to in-progress
        getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .update({
                status: 'in-progress',
                answeredAt: new Date().toISOString(),
                ...(context ? { context } : {}),
            })
            .catch(() => {});

        // Pre-generate Cartesia greeting audio
        let greetingAudioUrl: string | undefined;
        if (isCartesiaConfigured()) {
            try {
                const cartesiaResult = await synthesizeCartesiaTTS(greeting, resolvedLang);
                if (cartesiaResult) {
                    const audioId = crypto.randomUUID();
                    const audioBuf = Buffer.from(await cartesiaResult.arrayBuffer());
                    cachePhoneAudio(audioId, audioBuf);
                    greetingAudioUrl = `${baseUrl}/api/voice/tts/phone?id=${audioId}`;
                }
            } catch {
                // Fall back to <Say>
            }
        }

        // Generate TwiML: Play/Say greeting, then gather speech
        const twiml = generateGatherTwiML({
            gatherUrl,
            message: greeting,
            language,
            audioUrl: greetingAudioUrl,
        });

        return new NextResponse(twiml, {
            headers: { 'Content-Type': 'text/xml' },
        });

    } catch (err) {
        log.error('outbound-answer:error', { error: err instanceof Error ? err.message : String(err) });
        const fallback = generateUnavailableTwiML({
            message: 'We are experiencing a technical issue. Please try again later.',
        });
        return new NextResponse(fallback, {
            headers: { 'Content-Type': 'text/xml' },
        });
    }
}
