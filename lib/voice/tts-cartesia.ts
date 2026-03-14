/**
 * Cartesia Sonic-3 TTS Provider — Ultra-low latency voice synthesis
 *
 * 40ms TTFB, 42+ dil (Türkçe dahil), WebSocket + REST API.
 * Profesyonel voice agent projeleri için endüstri standardı.
 *
 * Auth: CARTESIA_API_KEY env var
 * Endpoint: https://api.cartesia.ai/tts/bytes (REST, binary PCM response)
 * Model: sonic-3
 * Output: PCM 24kHz 16-bit mono → WAV dönüştürme
 * Pricing: ~$0.038/1K chars
 */

import { pcmToWav } from '@/lib/voice/audio-utils';
import { cartesiaCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';

// =============================================
// Configuration
// =============================================

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_API_VERSION = '2025-04-16';
const CARTESIA_MODEL = 'sonic-3';

function getCartesiaApiKey(): string | null {
    return process.env.CARTESIA_API_KEY || null;
}

/** Check if Cartesia is configured */
export function isCartesiaConfigured(): boolean {
    return !!getCartesiaApiKey();
}

// =============================================
// Supported voice languages
// =============================================

export type CartesiaLang = 'tr' | 'en' | 'de' | 'fr';

// =============================================
// Default Voice Mapping (language-aware)
// =============================================
// TR: Native Turkish voices from Cartesia's Turkish voice library
// EN/DE/FR: Multilingual Sonic-3 voices — same voice speaks all 42 languages
// =============================================

const CARTESIA_DEFAULT_VOICES: Record<CartesiaLang, { female: string; male: string }> = {
    tr: {
        female: 'fa7bfcdc-603c-4bf1-a600-a371400d2f8c', // Leyla — Story Companion (TR native)
        male: '39f753ef-b0eb-41cd-aa53-2f3c284f948f',   // Emre — Calming Speaker (TR native)
    },
    en: {
        female: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', // Katie — Friendly Fixer (multilingual)
        male: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',   // Blake — Helpful Agent (multilingual)
    },
    de: {
        female: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', // Katie — multilingual (speaks native German)
        male: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',   // Blake — multilingual (speaks native German)
    },
    fr: {
        female: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', // Katie — multilingual (speaks native French)
        male: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',   // Blake — multilingual (speaks native French)
    },
};

// =============================================
// Synthesize Function
// =============================================

/**
 * Cartesia Sonic-3 ile ses sentezi yapar.
 * Returns a Response with audio/wav body, or null on failure.
 *
 * @param text - Sentezlenecek metin
 * @param lang - Dil kodu ('tr' | 'en')
 * @param voiceId - Cartesia voice UUID (opsiyonel, default: Katie)
 */
export async function synthesizeCartesiaTTS(
    text: string,
    lang: CartesiaLang,
    voiceId?: string,
): Promise<Response | null> {
    const apiKey = getCartesiaApiKey();
    if (!apiKey) {
        console.warn('[TTS:Cartesia] No API key found (CARTESIA_API_KEY)');
        return null;
    }

    // Fast-fail if circuit breaker is open
    if (cartesiaCircuitBreaker.isOpen()) {
        console.warn('[TTS:Cartesia] Circuit breaker OPEN — skipping');
        return null;
    }

    const resolvedVoiceId = voiceId || CARTESIA_DEFAULT_VOICES[lang].female;

    try {
        const response = await cartesiaCircuitBreaker.execute(async () => {
            const res = await fetch(CARTESIA_API_URL, {
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Cartesia-Version': CARTESIA_API_VERSION,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model_id: CARTESIA_MODEL,
                    transcript: text,
                    voice: {
                        mode: 'id',
                        id: resolvedVoiceId,
                    },
                    language: lang,
                    output_format: {
                        container: 'raw',
                        encoding: 'pcm_s16le',
                        sample_rate: 24000,
                    },
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) {
                const err = await res.text().catch(() => '');
                throw new Error(`Cartesia TTS ${res.status}: ${err}`);
            }

            return res;
        });

        // Response is raw PCM binary — convert to WAV for browser playback
        const pcmBuffer = Buffer.from(await response.arrayBuffer());
        const wavBuffer = pcmToWav(pcmBuffer, 24000);

        return new Response(new Uint8Array(wavBuffer), {
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': String(wavBuffer.length),
            },
        });
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.warn('[TTS:Cartesia] Circuit breaker OPEN — skipping');
        } else {
            console.error('[TTS:Cartesia] Request failed:', err);
        }
        return null;
    }
}
