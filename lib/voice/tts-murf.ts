/**
 * Murf Falcon TTS Provider — Budget-friendly, low-latency voice synthesis
 *
 * 130ms TTFB, 35+ dil (Türkçe 7 ses dahil), streaming desteği.
 * Maliyet-optimizeli alternatif: $0.01/1K chars.
 *
 * Auth: MURF_API_KEY env var
 * Endpoint: https://global.api.murf.ai/v1/speech/stream (streaming)
 * Model: FALCON
 * Output: Audio stream (binary)
 * Pricing: ~$0.01/1K chars
 */

import { murfCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';

// =============================================
// Configuration
// =============================================

const MURF_API_URL = 'https://global.api.murf.ai/v1/speech/stream';
const MURF_MODEL = 'FALCON';

function getMurfApiKey(): string | null {
    return process.env.MURF_API_KEY || null;
}

/** Check if Murf is configured */
export function isMurfConfigured(): boolean {
    return !!getMurfApiKey();
}

// =============================================
// Default Voice Mapping
// =============================================
// Murf has 7+ Turkish voices and 20+ English voices.
// Voice IDs are retrieved from Murf API GET /v1/speech/voices.
// These defaults will be updated after API key is configured.
// =============================================

const MURF_DEFAULT_VOICES = {
    tr: {
        female: 'tr-TR-ElifNeural',  // Placeholder — update from Murf voice list
        male: 'tr-TR-EmreNeural',
    },
    en: {
        female: 'en-US-NatalieNeural',
        male: 'en-US-RyanNeural',
    },
} as const;

// =============================================
// Synthesize Function
// =============================================

/**
 * Murf Falcon ile ses sentezi yapar.
 * Returns a Response with audio body, or null on failure.
 *
 * @param text - Sentezlenecek metin
 * @param lang - Dil kodu ('tr' | 'en')
 * @param voiceId - Murf voice ID (opsiyonel)
 */
export async function synthesizeMurfTTS(
    text: string,
    lang: 'tr' | 'en',
    voiceId?: string,
): Promise<Response | null> {
    const apiKey = getMurfApiKey();
    if (!apiKey) {
        console.warn('[TTS:Murf] No API key found (MURF_API_KEY)');
        return null;
    }

    // Fast-fail if circuit breaker is open
    if (murfCircuitBreaker.isOpen()) {
        console.warn('[TTS:Murf] Circuit breaker OPEN — skipping');
        return null;
    }

    const defaultVoices = MURF_DEFAULT_VOICES[lang];
    const resolvedVoiceId = voiceId || defaultVoices.female;

    try {
        const response = await murfCircuitBreaker.execute(async () => {
            const res = await fetch(MURF_API_URL, {
                method: 'POST',
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify({
                    text,
                    voiceId: resolvedVoiceId,
                    model: MURF_MODEL,
                    format: 'MP3',
                    sampleRate: 24000,
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok || !res.body) {
                const err = await res.text().catch(() => '');
                throw new Error(`Murf TTS ${res.status}: ${err}`);
            }

            return res;
        });

        // Murf returns audio/mpeg stream directly — pass through
        return new Response(response.body, {
            headers: {
                'Content-Type': 'audio/mpeg',
            },
        });
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.warn('[TTS:Murf] Circuit breaker OPEN — skipping');
        } else {
            console.error('[TTS:Murf] Request failed:', err);
        }
        return null;
    }
}
