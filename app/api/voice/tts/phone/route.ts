/**
 * Phone TTS Endpoint — Serves Cartesia audio for Twilio <Play>
 *
 * GET /api/voice/tts/phone?id=AUDIO_CACHE_ID
 *   Fast path: gather route pre-generated audio, serve from module cache instantly.
 *
 * GET /api/voice/tts/phone?t=BASE64URL_TEXT&l=tr&v=VOICE_ID&s=HMAC_SIG
 *   Fallback path: generate audio via Cartesia on demand (cache miss / different instance).
 *
 * Security:
 *   - Cache ID path: UUIDs are unguessable, short TTL (60s)
 *   - Text path: HMAC-SHA256 signature using TWILIO_AUTH_TOKEN as secret
 */

import { NextRequest } from 'next/server';
import { synthesizeCartesiaTTS } from '@/lib/voice/tts-cartesia';
import { getCachedPhoneAudio } from '@/lib/voice/phone-audio-cache';
import { createLogger } from '@/lib/utils/logger';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

const log = createLogger('tts:phone');

function verifySignature(text: string, lang: string, voiceId: string, signature: string): boolean {
    const secret = process.env.TWILIO_AUTH_TOKEN || '';
    if (!secret) return false;
    const data = `${text}:${lang}:${voiceId}`;
    const expected = createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);
    return expected === signature;
}

function audioResponse(buf: ArrayBuffer, source: string, latencyMs: number): Response {
    return new Response(buf, {
        headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(buf.byteLength),
            'Cache-Control': 'private, max-age=300',
            'X-TTS-Provider': 'cartesia',
            'X-TTS-Source': source,
            'X-TTS-Latency-Ms': String(latencyMs),
        },
    });
}

export async function GET(request: NextRequest) {
    const start = Date.now();
    const { searchParams } = request.nextUrl;
    const audioId = searchParams.get('id');

    // ── FAST PATH: serve from pre-generated cache ──────────────────────────
    if (audioId) {
        const cached = getCachedPhoneAudio(audioId);
        if (cached) {
            const latencyMs = Date.now() - start;
            log.info('tts:phone:cache-hit', { audioId, audioBytes: cached.byteLength, latencyMs });
            return audioResponse(cached.buffer as ArrayBuffer, 'cache', latencyMs);
        }
        // Cache miss (different Vercel instance) — fall through to text-based generation
        log.warn('tts:phone:cache-miss', { audioId });
        return new Response('Audio not found or expired', { status: 404 });
    }

    // ── FALLBACK PATH: generate from text (HMAC signed) ────────────────────
    const textB64 = searchParams.get('t') || '';
    const lang = (searchParams.get('l') || 'tr') as 'tr' | 'en';
    const voiceId = searchParams.get('v') || '';
    const sig = searchParams.get('s') || '';

    let text: string;
    try {
        text = Buffer.from(textB64, 'base64url').toString('utf-8');
    } catch {
        return new Response('Bad Request', { status: 400 });
    }

    if (!text) return new Response('Bad Request: missing text or id', { status: 400 });

    if (!verifySignature(text, lang, voiceId, sig)) {
        log.warn('tts:phone:forbidden', { textLength: text.length, lang });
        return new Response('Forbidden', { status: 403 });
    }

    try {
        const audioResp = await synthesizeCartesiaTTS(text, lang, voiceId || undefined);
        if (!audioResp) {
            log.error('tts:phone:cartesia_failed', { textLength: text.length, lang });
            return new Response('TTS generation failed', { status: 502 });
        }

        const buf = await audioResp.arrayBuffer();
        const latencyMs = Date.now() - start;
        log.info('tts:phone:cartesia-fallback', { textLength: text.length, lang, audioBytes: buf.byteLength, latencyMs });
        return audioResponse(buf, 'cartesia-fallback', latencyMs);
    } catch (err) {
        log.error('tts:phone:error', { error: err instanceof Error ? err.message : String(err) });
        return new Response('Internal Server Error', { status: 500 });
    }
}
