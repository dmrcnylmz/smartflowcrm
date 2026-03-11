/**
 * Murf Falcon TTS Provider — Budget-friendly, low-latency voice synthesis
 *
 * 130ms TTFB, 24 dil (Türkçe YOK — sadece EN fallback), streaming desteği.
 * Maliyet-optimizeli alternatif: $0.01/1K chars.
 *
 * Auth: MURF_API_KEY env var
 * Endpoint: https://api.murf.ai/v1/speech/stream (streaming)
 * Output: Audio stream (MP3)
 * Pricing: ~$0.01/1K chars
 *
 * NOT: Murf Türkçe desteklemiyor. Türkçe sesler Cartesia Sonic-3 üzerinden.
 */

import { murfCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';

// =============================================
// Configuration
// =============================================

const MURF_API_URL = 'https://api.murf.ai/v1/speech/stream';

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
// Murf does NOT support Turkish — only EN voices here.
// Turkish fallback should go to Cartesia, not Murf.
// =============================================

const MURF_DEFAULT_VOICES = {
    en: {
        female: 'en-US-alina',
        male: 'en-US-cooper',
    },
} as const;

// =============================================
// Synthesize Function
// =============================================

/**
 * Murf ile ses sentezi yapar (sadece İngilizce).
 * Returns a Response with audio body, or null on failure.
 *
 * Türkçe isteklerde null döner — fallback'e bırakır.
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
    // Murf does NOT support Turkish — fast-fail
    if (lang === 'tr' && !voiceId) {
        console.warn('[TTS:Murf] Turkish not supported — skipping');
        return null;
    }

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

    const resolvedVoiceId = voiceId || MURF_DEFAULT_VOICES.en.female;

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
                    style: 'Conversational',
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
