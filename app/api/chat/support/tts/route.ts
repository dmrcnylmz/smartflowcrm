/**
 * Support Chat TTS API — Public Text-to-Speech for Voice Mode
 *
 * POST /api/chat/support/tts
 *
 * Converts text to speech using Cartesia (Leyla voice).
 * Used by the landing page support widget's voice mode.
 * No authentication required — rate limited by IP.
 *
 * Request: { text: string, language?: 'tr' | 'en' }
 * Response: audio/wav binary
 */

import { NextRequest, NextResponse } from 'next/server';
import { synthesizeCartesiaTTS, isCartesiaConfigured } from '@/lib/voice/tts-cartesia';
import { checkRateLimit } from '@/lib/utils/rate-limiter';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 500;
const RATE_LIMIT = { limit: 10, windowSeconds: 300, tier: 'support-tts' };

// Default support bot voice: Leyla (Turkish female)
const SUPPORT_VOICE_ID = 'fa7bfcdc-603c-4bf1-a600-a371400d2f8c';

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        // Rate limit by IP
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rateResult = await checkRateLimit(ip, RATE_LIMIT);
        if (!rateResult.success) {
            return NextResponse.json(
                { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
                { status: 429 },
            );
        }

        // Check Cartesia configuration
        if (!isCartesiaConfigured()) {
            return NextResponse.json(
                { error: 'TTS servisi yapılandırılmamış' },
                { status: 503 },
            );
        }

        // Parse body
        const body = await request.json();
        const { text, language = 'tr' } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'text gerekli' }, { status: 400 });
        }

        if (text.length > MAX_TEXT_LENGTH) {
            return NextResponse.json(
                { error: `Metin en fazla ${MAX_TEXT_LENGTH} karakter olabilir` },
                { status: 400 },
            );
        }

        const lang = language === 'en' ? 'en' : 'tr';

        // Synthesize with Cartesia
        const response = await synthesizeCartesiaTTS(text, lang, SUPPORT_VOICE_ID);

        if (!response || !response.ok) {
            return NextResponse.json(
                { error: 'Ses sentezleme başarısız' },
                { status: 502 },
            );
        }

        // Forward audio response
        const audioBuffer = await response.arrayBuffer();

        return new Response(audioBuffer, {
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': String(audioBuffer.byteLength),
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[SupportTTS] Error:', error);
        return NextResponse.json(
            { error: 'Bir hata oluştu' },
            { status: 500 },
        );
    }
}
