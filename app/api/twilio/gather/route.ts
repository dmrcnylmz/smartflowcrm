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
import { generateResponseAndGatherTwiML, generateUnavailableTwiML } from '@/lib/twilio/telephony';
import { detectIntentFast, shouldShortcut, getShortcutResponse } from '@/lib/ai/intent-fast';

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

        // Get query params
        const tenantId = request.nextUrl.searchParams.get('tenantId');
        const callSid = request.nextUrl.searchParams.get('callSid');

        if (!tenantId || !callSid) {
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Bir hata oluştu. Lütfen tekrar arayın.' }),
                { headers: { 'Content-Type': 'text/xml' } }
            );
        }

        // Extract speech result from Twilio
        const speechResult = params.SpeechResult || '';
        const confidence = parseFloat(params.Confidence || '0');

        // Speech result received; processing below

        if (!speechResult) {
            // No speech detected, ask again
            const host = request.headers.get('host') || 'localhost:3000';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            const gatherUrl = `${protocol}://${host}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}`;

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
            // 3. Call LLM for full response
            aiResponse = await generateLLMResponse(speechResult, tenantData, tenantId, callSid, language);

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

        // 5. Build TwiML response
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const gatherUrl = `${protocol}://${host}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}`;

        const twiml = generateResponseAndGatherTwiML({
            gatherUrl,
            aiResponse,
            language: language === 'en' ? 'en-US' : 'tr-TR',
            shouldHangup: shouldEndCall,
        });

        return new NextResponse(twiml, {
            headers: { 'Content-Type': 'text/xml' },
        });

    } catch (error) {
        console.error('[Twilio Gather] Error:', error);
        const fallback = generateUnavailableTwiML({
            message: 'Bir teknik sorun yaşıyoruz. Lütfen daha sonra tekrar arayın.',
        });
        return new NextResponse(fallback, {
            headers: { 'Content-Type': 'text/xml' },
        });
    }
}

/**
 * Generate LLM response using OpenAI with tenant context.
 */
async function generateLLMResponse(
    userMessage: string,
    tenantData: FirebaseFirestore.DocumentData | undefined,
    tenantId: string,
    callSid: string,
    language: string
): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        console.error('[Twilio Gather] OPENAI_API_KEY not configured');
        return language === 'tr'
            ? 'Şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.'
            : 'I cannot respond right now. Please try again later.';
    }

    try {
        // Build system prompt from tenant data
        const agentName = tenantData?.agent?.name || 'Asistan';
        const companyName = tenantData?.companyName || 'Şirket';
        const agentRole = tenantData?.agent?.role || 'Müşteri Temsilcisi';
        const traits = tenantData?.agent?.traits?.join(', ') || 'profesyonel, nazik';
        const services = tenantData?.business?.services?.join(', ') || '';
        const workingHours = tenantData?.business?.workingHours || '09:00-18:00';
        const workingDays = tenantData?.business?.workingDays || 'Pazartesi-Cuma';

        const systemPrompt = `Sen ${companyName} şirketinin ${agentRole}'sin. İsmin ${agentName}.
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

        // Call OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history,
                    { role: 'user', content: userMessage },
                ],
                temperature: 0.3,
                max_tokens: 150,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`[Twilio Gather] OpenAI error: ${response.status} ${error}`);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || 'Yanıt oluşturulamadı.';

    } catch (error) {
        console.error('[Twilio Gather] LLM error:', error);
        return language === 'tr'
            ? 'Bir aksaklık yaşıyoruz. Sizi yetkili bir temsilcimize aktarabilir miyim?'
            : 'We are experiencing an issue. May I transfer you to a representative?';
    }
}
