/**
 * Phone TTS Endpoint — Serves Cartesia audio for Twilio <Play>
 *
 * GET /api/voice/tts/phone?t=BASE64URL_TEXT&l=tr&v=VOICE_ID&s=HMAC_SIG
 *
 * Called by Twilio when processing <Play> tags in TwiML.
 * Generates audio via Cartesia Sonic-3 and returns WAV.
 *
 * Security: HMAC-SHA256 signature using TWILIO_AUTH_TOKEN as secret.
 * This prevents unauthorized TTS generation.
 *
 * Flow:
 *   1. Twilio receives TwiML with <Play url="...this endpoint..."/>
 *   2. Twilio fetches audio from this URL
 *   3. We call Cartesia API → PCM → WAV
 *   4. Return WAV audio to Twilio for playback
 */

import { NextRequest } from 'next/server';
import { synthesizeCartesiaTTS } from '@/lib/voice/tts-cartesia';
import { createLogger } from '@/lib/utils/logger';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

const log = createLogger('tts:phone');

/**
 * Verify HMAC signature to prevent abuse.
 * Signature = first 16 hex chars of HMAC-SHA256(text:lang:voiceId, TWILIO_AUTH_TOKEN)
 */
function verifySignature(text: string, lang: string, voiceId: string, signature: string): boolean {
    const secret = process.env.TWILIO_AUTH_TOKEN || '';
    if (!secret) return false;
    const data = `${text}:${lang}:${voiceId}`;
    const expected = createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);
    return expected === signature;
}

export async function GET(request: NextRequest) {
    const start = Date.now();
    const { searchParams } = request.nextUrl;

    const textB64 = searchParams.get('t') || '';
    const lang = (searchParams.get('l') || 'tr') as 'tr' | 'en';
    const voiceId = searchParams.get('v') || '';
    const sig = searchParams.get('s') || '';

    // Decode base64url text
    let text: string;
    try {
        text = Buffer.from(textB64, 'base64url').toString('utf-8');
    } catch {
        return new Response('Bad Request', { status: 400 });
    }

    if (!text) {
        return new Response('Bad Request: missing text', { status: 400 });
    }

    // Verify HMAC signature
    if (!verifySignature(text, lang, voiceId, sig)) {
        log.warn('tts:phone:forbidden', { textLength: text.length, lang });
        return new Response('Forbidden', { status: 403 });
    }

    // Generate audio via Cartesia
    try {
        const audioResponse = await synthesizeCartesiaTTS(text, lang, voiceId || undefined);
        if (!audioResponse) {
            log.error('tts:phone:cartesia_failed', { textLength: text.length, lang });
            return new Response('TTS generation failed', { status: 502 });
        }

        const audioBuffer = await audioResponse.arrayBuffer();
        const latencyMs = Date.now() - start;

        log.info('tts:phone:ok', { textLength: text.length, lang, audioBytes: audioBuffer.byteLength, latencyMs });

        return new Response(audioBuffer, {
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': String(audioBuffer.byteLength),
                'Cache-Control': 'private, max-age=300', // 5 min cache — same text = same audio
                'X-TTS-Provider': 'cartesia',
                'X-TTS-Latency-Ms': String(latencyMs),
            },
        });
    } catch (err) {
        log.error('tts:phone:error', { error: err instanceof Error ? err.message : String(err) });
        return new Response('Internal Server Error', { status: 500 });
    }
}
