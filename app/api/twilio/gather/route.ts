/**
 * Twilio Speech Gather Callback
 *
 * POST /api/twilio/gather
 *
 * Called by Twilio after <Gather input="speech"> completes.
 * Receives transcribed speech, processes with LLM, returns TwiML with AI response.
 *
 * Flow:
 * 1. Receive speech transcription from Twilio
 * 2. Detect intent (fast path)
 * 3. Generate LLM response with tenant context
 * 4. Return TwiML: <Say> AI response + <Gather> for next turn
 *
 * Query params: tenantId, callSid
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { generateResponseAndGatherTwiML, generateUnavailableTwiML, validateTwilioSignature, getTwilioConfig } from '@/lib/twilio/telephony';
import { detectIntentFast, shouldShortcut, getShortcutResponse } from '@/lib/ai/intent-fast';
import { generateWithFallback } from '@/lib/ai/llm-fallback-chain';
import { sendWebhook } from '@/lib/n8n/client';

export const dynamic = 'force-dynamic';

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkGatherRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

// Cleanup stale entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap) {
        if (val.resetAt < now) rateLimitMap.delete(key);
    }
}, 120_000);

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        if (!checkGatherRateLimit(ip)) {
            const twiml = generateUnavailableTwiML({ message: 'Çok fazla istek. Lütfen bekleyin.' });
            return new NextResponse(twiml, { status: 429, headers: { 'Content-Type': 'text/xml' } });
        }

        const contentType = request.headers.get('content-type') || '';
        let params: Record<string, string> = {};

        // Parse Twilio form-encoded body
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            formData.forEach((value, key) => { params[key] = String(value); });
        } else {
            params = await request.json();
        }

        // Validate Twilio signature — mandatory in production
        const config = getTwilioConfig();
        const signature = request.headers.get('x-twilio-signature') || '';
        if (config.authToken) {
            if (!validateTwilioSignature(config.authToken, request.url, params, signature)) {
                console.error('[twilio/gather] Invalid Twilio signature — rejecting');
                const twiml = generateUnavailableTwiML({ message: 'Yetkisiz istek.' });
                return new NextResponse(twiml, { status: 403, headers: { 'Content-Type': 'text/xml' } });
            }
        } else if (process.env.NODE_ENV === 'production') {
            console.error('[twilio/gather] TWILIO_AUTH_TOKEN not configured in production');
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Sistem hatası.' }),
                { headers: { 'Content-Type': 'text/xml' } },
            );
        }

        // Get query params
        const tenantId = request.nextUrl.searchParams.get('tenantId');
        const callSid = request.nextUrl.searchParams.get('callSid');
        const agentIdParam = request.nextUrl.searchParams.get('agentId');

        if (!tenantId || !callSid) {
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Bir hata oluştu. Lütfen tekrar arayın.' }),
                { headers: { 'Content-Type': 'text/xml' } }
            );
        }

        // Extract speech result from Twilio — sanitize input
        const speechResult = (params.SpeechResult || '').trim().slice(0, 500);
        const confidence = parseFloat(params.Confidence || '0');

        // Speech result received; processing below

        if (!speechResult) {
            // No speech detected, ask again
            const host = request.headers.get('host') || 'localhost:3000';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            const gatherUrl = `${protocol}://${host}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}${agentIdParam ? `&agentId=${agentIdParam}` : ''}`;

            const twiml = generateResponseAndGatherTwiML({
                gatherUrl,
                aiResponse: 'Sizi duyamadım. Lütfen tekrar söyler misiniz?',
            });
            return new NextResponse(twiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // Load tenant config
        const tenantSnap = await getDb().collection('tenants').doc(tenantId).get();
        const tenantData = tenantSnap.data();
        const language = tenantData?.language === 'en' ? 'en' : 'tr';

        // Load agent config: prefer agentId param, fallback to first active agent
        let activeAgent: FirebaseFirestore.DocumentData | null = null;
        try {
            if (agentIdParam) {
                // Direct: specific agent bound to this call
                const agentDoc = await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('agents').doc(agentIdParam)
                    .get();
                if (agentDoc.exists) {
                    activeAgent = agentDoc.data() || null;
                }
            }
            if (!activeAgent) {
                // Legacy fallback: find first active agent
                const agentsSnap = await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('agents')
                    .where('isActive', '==', true)
                    .limit(1)
                    .get();
                if (!agentsSnap.empty) {
                    activeAgent = agentsSnap.docs[0].data();
                }
            }
        } catch {
            // Fallback to tenant-level config if agents query fails
        }

        // 1. Fast intent detection
        const intent = detectIntentFast(speechResult);
        // Intent detected; determining response

        // 2. Check for shortcut (greeting, farewell, thanks → skip LLM)
        let aiResponse: string;
        let shouldEndCall = false;

        if (shouldShortcut(intent)) {
            aiResponse = getShortcutResponse(intent.intent, language);
            shouldEndCall = intent.intent === 'farewell';
        } else {
            // 3. Call LLM for full response (use active agent if available)
            aiResponse = await generateLLMResponse(speechResult, tenantData, tenantId, callSid, language, activeAgent);

            // Check if LLM suggests ending the call
            shouldEndCall = aiResponse.toLowerCase().includes('iyi günler') ||
                            aiResponse.toLowerCase().includes('hoşça kalın') ||
                            aiResponse.toLowerCase().includes('goodbye');
        }

        // 4. Save conversation turn to Firestore
        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .update({
                conversationHistory: FieldValue.arrayUnion(
                    { role: 'user', content: speechResult, intent: intent.intent, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
                ),
                lastActivityAt: FieldValue.serverTimestamp(),
            });

        // 5. Fire n8n on_new_call webhook (fire-and-forget)
        sendWebhook('on_new_call', {
            tenantId,
            sessionId: callSid,
            arguments: {
                callSid,
                from: params.From || '',
                to: params.To || '',
                speechResult,
                intent: intent.intent,
                confidence,
            },
        }).catch(() => {});

        // 6. Build TwiML response
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const gatherUrl = `${protocol}://${host}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}${agentIdParam ? `&agentId=${agentIdParam}` : ''}`;

        const twiml = generateResponseAndGatherTwiML({
            gatherUrl,
            aiResponse,
            language: language === 'en' ? 'en-US' : 'tr-TR',
            shouldHangup: shouldEndCall,
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

/**
 * Generate LLM response using shared fallback chain (OpenAI → Groq → Gemini).
 */
async function generateLLMResponse(
    userMessage: string,
    tenantData: FirebaseFirestore.DocumentData | undefined,
    tenantId: string,
    callSid: string,
    language: string,
    activeAgent?: FirebaseFirestore.DocumentData | null,
): Promise<string> {
    try {
        let systemPrompt: string;

        if (activeAgent?.systemPrompt) {
            // Use agent's custom system prompt (from agents collection)
            // Resolve variables: replace {key} with defaultValue
            systemPrompt = activeAgent.systemPrompt;
            const variables = activeAgent.variables || [];
            for (const v of variables) {
                if (v.key && v.defaultValue) {
                    systemPrompt = systemPrompt.replace(
                        new RegExp(`\\{${v.key}\\}`, 'g'),
                        v.defaultValue,
                    );
                }
            }
            // Append phone-call rules if not already present
            if (!systemPrompt.includes('telefon görüşmesi')) {
                systemPrompt += `\n\nTelefon Görüşmesi Kuralları:
- Kısa ve öz yanıtlar ver (max 2-3 cümle)
- ${language === 'tr' ? 'Türkçe konuş (müşteri İngilizce konuşursa İngilizce yanıt ver)' : 'Speak English unless the customer speaks Turkish'}
- Doğal ve samimi bir üslup kullan`;
            }
        } else {
            // Fallback: Build system prompt from tenant-level config
            const agentName = tenantData?.agent?.name || 'Asistan';
            const companyName = tenantData?.companyName || 'Şirket';
            const agentRole = tenantData?.agent?.role || 'Müşteri Temsilcisi';
            const traits = tenantData?.agent?.traits?.join(', ') || 'profesyonel, nazik';
            const services = tenantData?.business?.services?.join(', ') || '';
            const workingHours = tenantData?.business?.workingHours || '09:00-18:00';
            const workingDays = tenantData?.business?.workingDays || 'Pazartesi-Cuma';

            systemPrompt = `Sen ${companyName} şirketinin ${agentRole}'sin. İsmin ${agentName}.
Karakter özelliklerin: ${traits}.
${services ? `Sunduğun hizmetler: ${services}.` : ''}
Çalışma saatleri: ${workingDays}, ${workingHours}.

Kurallar:
- Kısa ve öz yanıtlar ver (max 2-3 cümle, telefon görüşmesi)
- Türkçe konuş (müşteri İngilizce konuşursa İngilizce yanıt ver)
- Randevu, şikayet, bilgi talebi gibi işlemleri yönet
- Fiyat, kontrat detayı verme (sadece bilgi al, kaydet)
- Çözemediğin konularda müşteriye yetkili birine yönlendir
- Doğal ve samimi bir üslup kullan
- Müşterinin adını sor ve kullan`;
        }

        // Load conversation history
        const callSnap = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .get();

        const callData = callSnap.data();
        const history = (callData?.conversationHistory || [])
            .slice(-6) // Last 3 turns
            .map((turn: { role: string; content: string }) => ({
                role: turn.role as 'user' | 'assistant',
                content: turn.content,
            }));

        // Use shared fallback chain (OpenAI → Groq → Gemini → graceful)
        const result = await generateWithFallback(
            [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: userMessage },
            ],
            { maxTokens: 150, temperature: 0.3, language },
        );

        return result.text || 'Yanıt oluşturulamadı.';

    } catch {
        return language === 'tr'
            ? 'Bir aksaklık yaşıyoruz. Sizi yetkili bir temsilcimize aktarabilir miyim?'
            : 'We are experiencing an issue. May I transfer you to a representative?';
    }
}
