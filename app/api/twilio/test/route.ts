/**
 * Twilio Configuration Test Endpoint
 *
 * GET  /api/twilio/test — Check Twilio config status
 * POST /api/twilio/test — Simulate incoming call + gather cycle (no real Twilio)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateWithFallback, getLLMProviderStatus } from '@/lib/ai/llm-fallback-chain';
import { detectIntentFast, shouldShortcut, getShortcutResponse } from '@/lib/ai/intent-fast';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    const providers = getLLMProviderStatus();

    return NextResponse.json({
        twilio: {
            configured: !!(twilioSid && twilioToken && twilioPhone),
            accountSid: twilioSid ? `${twilioSid.slice(0, 6)}...` : null,
            phoneNumber: twilioPhone || null,
            hasAuthToken: !!twilioToken,
        },
        llm: providers,
        env: {
            OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
            GROQ_API_KEY: !!process.env.GROQ_API_KEY,
            GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
            PERSONAPLEX_API_KEY: !!process.env.PERSONAPLEX_API_KEY,
            PERSONAPLEX_MOCK_MODE: process.env.PERSONAPLEX_MOCK_MODE || 'false',
        },
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message = 'Merhaba, randevu almak istiyorum', language = 'tr' } = body;

        const startMs = performance.now();

        // Step 1: Intent detection
        const intent = detectIntentFast(message);

        // Step 2: Check for shortcut
        let aiResponse: string;
        let source: string;

        if (shouldShortcut(intent)) {
            aiResponse = getShortcutResponse(intent.intent, language);
            source = 'shortcut';
        } else {
            // Step 3: LLM fallback chain
            const systemPrompt = `Sen bir şirketin AI telefon asistanısın.
Kurallar:
- Kısa ve öz yanıtlar ver (max 2 cümle)
- ${language === 'tr' ? 'Türkçe' : 'İngilizce'} konuş
- Randevu, şikayet, bilgi talebi işle`;

            const result = await generateWithFallback(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message },
                ],
                { maxTokens: 150, temperature: 0.3, language },
            );

            aiResponse = result.text;
            source = result.source;
        }

        const latencyMs = Math.round(performance.now() - startMs);

        return NextResponse.json({
            success: true,
            test: {
                userMessage: message,
                intent: intent.intent,
                intentConfidence: intent.confidence,
                aiResponse,
                source,
                latencyMs,
                language,
            },
        });
    } catch (error) {
        return handleApiError(error, 'TwilioTest');
    }
}
