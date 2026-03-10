/**
 * Voice TTS Preview API — POST /api/voice/tts/preview
 *
 * Katalogdan ses seçip kısa bir sample ile önizleme yapar.
 * VoiceSelector bileşeninde "Dinle" butonuyla kullanılır.
 *
 * Request body:
 *   { voiceCatalogId: 'g-tr-wavenet-d' }
 *   veya
 *   { provider: 'google', voiceId: 'tr-TR-Wavenet-D', language: 'tr' }
 *
 * Response: audio/mpeg stream + latency/provider headers
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/utils/error-handler';
import { synthesizeGoogleTTS } from '@/lib/voice/tts-google';
import { synthesizeKokoroTTS } from '@/lib/voice/tts-kokoro';
import { getVoiceById, PREVIEW_SAMPLES, type TTSProvider } from '@/lib/voice/voice-catalog';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export async function POST(request: NextRequest) {
    const startMs = performance.now();

    try {
        const body = await request.json();
        const { voiceCatalogId, provider, voiceId, language, text } = body;

        // ---- Resolve voice from catalog or explicit params ----
        let resolvedProvider: TTSProvider;
        let resolvedVoiceId: string;
        let resolvedLang: 'tr' | 'en';

        if (voiceCatalogId) {
            const entry = getVoiceById(voiceCatalogId);
            if (!entry) {
                return NextResponse.json(
                    { error: `Voice not found: ${voiceCatalogId}` },
                    { status: 404 },
                );
            }
            resolvedProvider = entry.provider;
            resolvedVoiceId = entry.voiceId;
            resolvedLang = entry.language === 'multi' ? (language || 'tr') : entry.language;
        } else if (provider && voiceId) {
            resolvedProvider = provider;
            resolvedVoiceId = voiceId;
            resolvedLang = language || 'tr';
        } else {
            return NextResponse.json(
                { error: 'Either voiceCatalogId or (provider + voiceId) required' },
                { status: 400 },
            );
        }

        // ---- Sample text ----
        const sampleText = text || PREVIEW_SAMPLES[resolvedLang];

        // ---- Synthesize based on provider ----
        let audioResponse: Response | null = null;

        if (resolvedProvider === 'elevenlabs') {
            if (!ELEVENLABS_API_KEY) {
                return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 });
            }

            const res = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}/stream`,
                {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ELEVENLABS_API_KEY,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg',
                    },
                    body: JSON.stringify({
                        text: sampleText,
                        model_id: 'eleven_turbo_v2_5',
                        language_code: resolvedLang,
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75,
                            style: 0.0,
                            use_speaker_boost: true,
                        },
                    }),
                    signal: AbortSignal.timeout(10000),
                },
            );

            if (res.ok && res.body) {
                audioResponse = res;
            }
        } else if (resolvedProvider === 'google') {
            audioResponse = await synthesizeGoogleTTS(sampleText, resolvedLang, resolvedVoiceId);
        } else if (resolvedProvider === 'kokoro') {
            audioResponse = await synthesizeKokoroTTS(sampleText, resolvedLang, resolvedVoiceId);
        } else if (resolvedProvider === 'openai') {
            if (!OPENAI_API_KEY) {
                return NextResponse.json({ error: 'OpenAI not configured' }, { status: 503 });
            }

            const res = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: sampleText,
                    voice: resolvedVoiceId,
                    response_format: 'mp3',
                    speed: 1.0,
                }),
                signal: AbortSignal.timeout(15000),
            });

            if (res.ok && res.body) {
                audioResponse = res;
            }
        }

        const latencyMs = performance.now() - startMs;

        if (!audioResponse || !audioResponse.body) {
            return NextResponse.json(
                { error: `Preview failed for ${resolvedProvider}:${resolvedVoiceId}` },
                { status: 503 },
            );
        }

        return new NextResponse(audioResponse.body, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=3600', // Cache previews for 1 hour
                'X-TTS-Provider': resolvedProvider,
                'X-TTS-Voice': resolvedVoiceId,
                'X-TTS-Language': resolvedLang,
                'X-TTS-Latency-Ms': String(Math.round(latencyMs)),
            },
        });
    } catch (error) {
        return handleApiError(error, 'VoiceTTSPreview');
    }
}
