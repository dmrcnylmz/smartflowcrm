/**
 * Voice TTS API — ElevenLabs-Only Strategy
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ PERFORMANS TESTİ SONUÇLARI (2024-03-06):                           │
 * │                                                                      │
 * │  ElevenLabs multilingual_v2 (greeting): 1876ms ✅ Premium kalite    │
 * │  ElevenLabs turbo_v2_5 (body):           474ms ✅ HIZLI + kaliteli  │
 * │  OpenAI TTS tts-1 (body):               4232ms ❌ 9x YAVAŞ!        │
 * │                                                                      │
 * │ KARAR: OpenAI TTS devre dışı. ElevenLabs hem greeting hem body.    │
 * │ OpenAI TTS sadece ElevenLabs tamamen çökerse son çare fallback.    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Strategy:
 *   greeting=true  → ElevenLabs multilingual_v2 (1876ms, premium kalite)
 *   greeting=false → ElevenLabs turbo_v2_5 (474ms, hızlı + iyi kalite)
 *   Fallback       → OpenAI TTS (yavaş ama çalışıyor)
 *   Son çare       → browser speechSynthesis (client tarafında)
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/utils/error-handler';
import { metricsLogger } from '@/lib/billing/metrics-logger';
import { shouldUseEmergencyTts } from '@/lib/billing/cost-monitor';
import { sessionRegistry } from '@/lib/voice/session-registry';
import { meterTtsUsage } from '@/lib/billing/metering';
import { checkCostThresholds } from '@/lib/billing/cost-monitor';
import { ttsCircuitBreaker, openaiCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Lazy Firestore for fire-and-forget metering
let _ttsDb: FirebaseFirestore.Firestore | null = null;
function getTtsDb(): FirebaseFirestore.Firestore {
    if (!_ttsDb) { initAdmin(); _ttsDb = getFirestore(); }
    return _ttsDb;
}

// =============================================
// Provider API Keys
// =============================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// =============================================
// ElevenLabs Configuration (PRIMARY — All TTS)
// =============================================
// Turkish: "Yildiz" — native Turkish female, warm professional
// English: "Sarah"  — professional English female
// =============================================

const ELEVENLABS_VOICES = {
    tr: 'pFZP5JQG7iQjIQuC4Bku', // Yildiz — native Turkish female
    en: 'EXAVITQu4vr4xnSDxMaL', // Sarah  — professional English female
} as const;

const ELEVENLABS_MODELS = {
    greeting: 'eleven_multilingual_v2',   // Premium kalite — 1876ms, ilk izlenim
    body: 'eleven_turbo_v2_5',            // Hızlı — 474ms, her yanıt için
} as const;

// =============================================
// OpenAI TTS (LAST RESORT FALLBACK ONLY)
// =============================================
// ⚠️ Test sonucu: 4232ms — 9x ElevenLabs Turbo'dan yavaş
// Sadece ElevenLabs tamamen çökerse kullanılacak
// =============================================

const OPENAI_TTS_VOICE = 'nova';

// =============================================
// Language Detection
// =============================================

function detectLanguage(text: string): 'tr' | 'en' {
    const turkishChars = /[çÇğĞıİöÖşŞüÜ]/;
    const turkishWords = /\b(merhaba|teşekkür|evet|hayır|lütfen|günaydın|nasıl|bir|ve|için|ile|bu|ben|sen|biz|var|yok|randevu|tamam|ederim|buyurun|hoş\s*geldiniz)\b/i;

    if (turkishChars.test(text) || turkishWords.test(text)) return 'tr';
    return 'en';
}

// =============================================
// Provider: ElevenLabs (PRIMARY)
// =============================================

async function synthesizeElevenLabs(
    text: string,
    lang: 'tr' | 'en',
    isGreeting: boolean,
    voiceIdOverride?: string,
    modelIdOverride?: string,
): Promise<Response | null> {
    if (!ELEVENLABS_API_KEY) return null;

    // Fast-fail if circuit breaker is open
    if (ttsCircuitBreaker.isOpen()) {
        console.warn('[TTS:ElevenLabs] Circuit breaker OPEN — skipping');
        return null;
    }

    const voiceId = voiceIdOverride || ELEVENLABS_VOICES[lang];
    const modelId = modelIdOverride || (isGreeting ? ELEVENLABS_MODELS.greeting : ELEVENLABS_MODELS.body);

    try {
        const response = await ttsCircuitBreaker.execute(async () => {
            const res = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
                {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ELEVENLABS_API_KEY,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg',
                    },
                    body: JSON.stringify({
                        text,
                        model_id: modelId,
                        language_code: lang,
                        voice_settings: {
                            stability: lang === 'tr' ? 0.6 : 0.5,
                            similarity_boost: 0.75,
                            style: 0.0,
                            use_speaker_boost: true,
                        },
                    }),
                    signal: AbortSignal.timeout(10000),
                },
            );

            if (!res.ok || !res.body) {
                const err = await res.text().catch(() => '');
                throw new Error(`ElevenLabs ${res.status}: ${err}`);
            }

            return res;
        });

        return response;
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.warn('[TTS:ElevenLabs] Circuit breaker OPEN — skipping');
        } else {
            console.error('[TTS:ElevenLabs] Request failed:', err);
        }
        return null;
    }
}

// =============================================
// Provider: OpenAI TTS (LAST RESORT FALLBACK)
// ⚠️ 4232ms latency — only when ElevenLabs is down
// =============================================

async function synthesizeOpenAI(
    text: string,
    lang: 'tr' | 'en',
): Promise<Response | null> {
    if (!OPENAI_API_KEY) return null;

    // Fast-fail if circuit breaker is open
    if (openaiCircuitBreaker.isOpen()) {
        console.warn('[TTS:OpenAI] Circuit breaker OPEN — skipping');
        return null;
    }

    try {
        const response = await openaiCircuitBreaker.execute(async () => {
            const res = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: OPENAI_TTS_VOICE,
                    response_format: 'mp3',
                    speed: 1.0,
                }),
                signal: AbortSignal.timeout(15000), // OpenAI is slow, give it more time
            });

            if (!res.ok || !res.body) {
                const err = await res.text().catch(() => '');
                throw new Error(`OpenAI TTS ${res.status}: ${err}`);
            }

            return res;
        });

        return response;
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.warn('[TTS:OpenAI] Circuit breaker OPEN — skipping');
        } else {
            console.error('[TTS:OpenAI] Request failed:', err);
        }
        return null;
    }
}

// =============================================
// Main Route Handler
// =============================================

export async function POST(request: NextRequest) {
    const ttsStartMs = performance.now();

    try {
        const body = await request.json();
        const {
            text,
            voice_id,
            model_id,
            language,
            greeting = false,
            provider: forceProvider,
            session_id,
            tenant_id,
        } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        const lang = (language || detectLanguage(text)) as 'tr' | 'en';
        const isGreeting = greeting === true;
        const charCount = text.length;

        // ---- Resolve tenant for metrics (non-blocking) ----
        const tenantId = tenant_id
            || (session_id ? sessionRegistry.getTenant(session_id) : null)
            || 'default';

        // ---- Emergency Mode Check ----
        // If active, body TTS switches to OpenAI (cheaper).
        // Greeting TTS ALWAYS stays on ElevenLabs (first impression matters).
        let emergencyActive = false;
        if (!isGreeting && !forceProvider) {
            try {
                emergencyActive = await shouldUseEmergencyTts(getTtsDb(), tenantId);
            } catch {
                // Ignore — keep ElevenLabs
            }
        }

        // ---- Strategy (Data-Driven) ----
        // Normal:    ALL traffic → ElevenLabs
        // Emergency: Greeting → ElevenLabs, Body → OpenAI (cost saving)
        // forceProvider → Use specified provider only

        let audioResponse: Response | null = null;
        let usedProvider = 'none';
        let usedModel: string = isGreeting ? ELEVENLABS_MODELS.greeting : ELEVENLABS_MODELS.body;

        if (forceProvider === 'elevenlabs') {
            audioResponse = await synthesizeElevenLabs(text, lang, isGreeting, voice_id, model_id);
            usedProvider = 'elevenlabs';
        } else if (forceProvider === 'openai') {
            audioResponse = await synthesizeOpenAI(text, lang);
            usedProvider = 'openai';
            usedModel = 'tts-1';
        } else if (emergencyActive) {
            // Emergency mode: body TTS → OpenAI (cheaper)
            console.info('[TTS] ⚠️ Emergency mode active — using OpenAI for body TTS');
            audioResponse = await synthesizeOpenAI(text, lang);
            usedProvider = 'openai-emergency';
            usedModel = 'tts-1';

            // Fallback to ElevenLabs if OpenAI also fails
            if (!audioResponse) {
                audioResponse = await synthesizeElevenLabs(text, lang, isGreeting, voice_id, model_id);
                usedProvider = 'elevenlabs';
                usedModel = ELEVENLABS_MODELS.body;
            }
        } else {
            // Default: ElevenLabs for everything → OpenAI as last resort
            audioResponse = await synthesizeElevenLabs(text, lang, isGreeting, voice_id, model_id);
            usedProvider = 'elevenlabs';

            if (!audioResponse) {
                console.warn('[TTS] ElevenLabs failed, falling back to OpenAI TTS (slow!)');
                audioResponse = await synthesizeOpenAI(text, lang);
                usedProvider = 'openai-fallback';
                usedModel = 'tts-1';
            }
        }

        const ttsLatencyMs = performance.now() - ttsStartMs;

        // ---- No provider succeeded ----
        if (!audioResponse || !audioResponse.body) {
            const bothOpen = ttsCircuitBreaker.isOpen() && openaiCircuitBreaker.isOpen();
            return NextResponse.json(
                {
                    error: 'All TTS providers failed',
                    fallback: 'browser',
                    circuitBreakers: bothOpen ? 'all_open' : 'partial',
                    stats: {
                        elevenlabs: ttsCircuitBreaker.getStats(),
                        openai: openaiCircuitBreaker.getStats(),
                    },
                },
                { status: 503 },
            );
        }

        // ---- Fire-and-forget: Log metrics + meter TTS usage ----
        if (tenantId !== 'default') {
            const db = getTtsDb();

            // Log TTS metric (non-blocking)
            metricsLogger.logTtsMetric(
                tenantId, ttsLatencyMs, usedProvider, usedModel,
                charCount, isGreeting, lang,
            );

            // Meter TTS character usage (non-blocking)
            meterTtsUsage(db, tenantId, charCount).catch(() => {});

            // Check cost thresholds (non-blocking)
            checkCostThresholds(db, tenantId).catch(() => {});
        }

        // ---- Stream audio back to client ----
        return new NextResponse(audioResponse.body, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache',
                'Transfer-Encoding': 'chunked',
                'X-TTS-Provider': usedProvider,
                'X-TTS-Language': lang,
                'X-TTS-Model': usedModel,
                'X-TTS-Latency-Ms': String(Math.round(ttsLatencyMs)),
                'X-TTS-Emergency': String(emergencyActive),
            },
        });
    } catch (error) {
        return handleApiError(error, 'VoiceTTS');
    }
}

// =============================================
// GET: TTS Provider Status
// =============================================

export async function GET() {
    return NextResponse.json({
        providers: {
            elevenlabs: {
                configured: !!ELEVENLABS_API_KEY,
                role: 'primary (all TTS)',
                voices: ELEVENLABS_VOICES,
                models: ELEVENLABS_MODELS,
                performance: {
                    greeting_latency: '~1876ms (multilingual_v2)',
                    body_latency: '~474ms (turbo_v2_5)',
                },
            },
            openai: {
                configured: !!OPENAI_API_KEY,
                role: 'last-resort fallback only',
                voice: OPENAI_TTS_VOICE,
                model: 'tts-1',
                performance: {
                    latency: '~4232ms (9x slower than ElevenLabs Turbo)',
                    note: 'Disabled as primary — only activates when ElevenLabs is completely down',
                },
            },
        },
        strategy: {
            greeting: 'ElevenLabs multilingual_v2 (premium quality)',
            body: 'ElevenLabs turbo_v2_5 (fast, 474ms)',
            fallback: 'OpenAI TTS (slow, only if ElevenLabs down)',
            last_resort: 'Browser speechSynthesis (client-side)',
        },
    });
}
