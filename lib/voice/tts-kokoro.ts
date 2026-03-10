/**
 * Kokoro TTS Provider — English-Only, Ultra-Low Cost
 *
 * 82M parametreli, CPU+GPU destekli, Apache 2.0 lisanslı TTS modeli.
 * Together AI API veya self-hosted Kokoro-FastAPI ile kullanılır.
 *
 * Cost: <$1/1M chars (Together AI) veya ~$0.15/gün self-hosted
 * Latency: ~150ms (GPU), ~300ms (CPU)
 * Languages: Sadece İngilizce — Türkçe desteği YOK
 *
 * API: OpenAI-uyumlu format (POST /v1/audio/speech)
 *   Together AI: https://api.together.xyz/v1/audio/speech
 *   Self-hosted: http://localhost:8880/v1/audio/speech
 */

import { kokoroCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';

// =============================================
// Configuration
// =============================================

const TOGETHER_AI_API_KEY = process.env.TOGETHER_AI_API_KEY || '';
const KOKORO_API_URL = process.env.KOKORO_API_URL || '';
const KOKORO_API_AUTH = process.env.KOKORO_API_AUTH || ''; // format: user:password (Basic Auth for self-hosted)

// Default voice if none specified
const DEFAULT_KOKORO_VOICE = 'af_heart';

/**
 * Resolve the Kokoro API endpoint and auth header.
 * Priority: Self-hosted → Together AI → null (not configured)
 */
function resolveKokoroConfig(): { url: string; headers: Record<string, string> } | null {
    // Option 1: Self-hosted Kokoro-FastAPI (with optional Basic Auth)
    if (KOKORO_API_URL) {
        const baseUrl = KOKORO_API_URL.replace(/\/+$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (KOKORO_API_AUTH) {
            headers['Authorization'] = 'Basic ' + Buffer.from(KOKORO_API_AUTH).toString('base64');
        }
        return { url: `${baseUrl}/v1/audio/speech`, headers };
    }

    // Option 2: Together AI API
    if (TOGETHER_AI_API_KEY) {
        return {
            url: 'https://api.together.xyz/v1/audio/speech',
            headers: {
                'Authorization': `Bearer ${TOGETHER_AI_API_KEY}`,
                'Content-Type': 'application/json',
            },
        };
    }

    // Not configured
    return null;
}

/** Check if Kokoro TTS is configured */
export function isKokoroConfigured(): boolean {
    return !!(KOKORO_API_URL || TOGETHER_AI_API_KEY);
}

// =============================================
// Synthesize Function
// =============================================

/**
 * Synthesize text using Kokoro TTS (English only).
 * Returns a Response with audio/mpeg body, or null on failure.
 *
 * @param text - Text to synthesize
 * @param lang - Language ('en' only — returns null for other languages)
 * @param voiceName - Kokoro voice name (e.g. 'af_heart', 'am_adam')
 */
export async function synthesizeKokoroTTS(
    text: string,
    lang: 'tr' | 'en',
    voiceName?: string,
): Promise<Response | null> {
    // Language guard: Kokoro only supports English
    if (lang !== 'en') return null;

    // Fast-fail: not configured
    const config = resolveKokoroConfig();
    if (!config) return null;

    // Fast-fail if circuit breaker is open
    if (kokoroCircuitBreaker.isOpen()) {
        console.warn('[TTS:Kokoro] Circuit breaker OPEN — skipping');
        return null;
    }

    const voice = voiceName || DEFAULT_KOKORO_VOICE;

    try {
        const response = await kokoroCircuitBreaker.execute(async () => {
            const res = await fetch(config.url, {
                method: 'POST',
                headers: config.headers,
                body: JSON.stringify({
                    model: 'kokoro',
                    input: text,
                    voice,
                    response_format: 'mp3',
                    speed: 1.0,
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok || !res.body) {
                const err = await res.text().catch(() => '');
                throw new Error(`Kokoro TTS ${res.status}: ${err}`);
            }

            return res;
        });

        return response;
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.warn('[TTS:Kokoro] Circuit breaker OPEN — skipping');
        } else {
            console.error('[TTS:Kokoro] Request failed:', err);
        }
        return null;
    }
}
