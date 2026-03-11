/**
 * Voice TTS API — Multi-Provider Fallback Strategy
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ PERFORMANS TESTİ SONUÇLARI:                                         │
 * │                                                                      │
 * │  ElevenLabs multilingual_v2 (greeting): 1876ms ✅ Premium kalite    │
 * │  ElevenLabs turbo_v2_5 (body):           474ms ✅ HIZLI + kaliteli  │
 * │  Google Cloud TTS Neural2:              ~200ms ✅ Hızlı fallback   │
 * │  OpenAI TTS tts-1 (body):               4232ms ❌ 9x YAVAŞ!        │
 * │                                                                      │
 * │ KARAR: ElevenLabs primary. Google Cloud TTS ilk fallback.           │
 * │ OpenAI TTS sadece ikisi de çökerse son çare.                        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Strategy:
 *   greeting=true  → ElevenLabs multilingual_v2 (1876ms, premium kalite)
 *   greeting=false → ElevenLabs turbo_v2_5 (474ms, hızlı + iyi kalite)
 *   Fallback TR    → Google Cloud TTS (Chirp3-HD/Wavenet) → OpenAI
 *   Fallback EN    → Kokoro (~150ms, <$1/1M) → Google → OpenAI
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/utils/error-handler';
import { metricsLogger } from '@/lib/billing/metrics-logger';
import { shouldUseEmergencyTts } from '@/lib/billing/cost-monitor';
import { sessionRegistry } from '@/lib/voice/session-registry';
import { meterTtsUsage } from '@/lib/billing/metering';
import { checkCostThresholds } from '@/lib/billing/cost-monitor';
import { ttsCircuitBreaker, openaiCircuitBreaker, googleTtsCircuitBreaker, kokoroCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';
import { synthesizeGoogleTTS, getServiceAccountKey } from '@/lib/voice/tts-google';
import { synthesizeGeminiTTS } from '@/lib/voice/tts-gemini';
import { synthesizeKokoroTTS, isKokoroConfigured } from '@/lib/voice/tts-kokoro';
import { checkSubscriptionActive } from '@/lib/billing/subscription-guard';
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
    voiceName?: string,
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
                    voice: voiceName || OPENAI_TTS_VOICE,
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

        // Security: limit text length to prevent API cost abuse
        const safeText = text.slice(0, 5000);
        const lang = (language || detectLanguage(safeText)) as 'tr' | 'en';
        const isGreeting = greeting === true;
        const charCount = safeText.length;

        // ---- Resolve tenant for metrics (non-blocking) ----
        // Priority: explicit body param → auth header → session registry → default
        const authTenantId = request.headers.get('x-user-tenant') || '';
        const tenantId = tenant_id
            || authTenantId
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

        // ---- Plan-Based Provider Enforcement ----
        // Non-Enterprise tenants cannot use ElevenLabs → override to Gemini/Kokoro
        let effectiveProvider = forceProvider;
        let planId = 'starter';
        if (tenantId !== 'default' && forceProvider === 'elevenlabs') {
            try {
                const guard = await checkSubscriptionActive(getTtsDb(), tenantId);
                planId = guard.planId;
                if (guard.planId !== 'enterprise') {
                    // Override ElevenLabs → Gemini for TR, Kokoro for EN
                    effectiveProvider = lang === 'en' ? 'kokoro' : 'google';
                    console.info(`[TTS] Plan-based override: ${forceProvider} → ${effectiveProvider} (plan=${guard.planId}, tenant=${tenantId})`);
                }
            } catch {
                // Fail-open: allow ElevenLabs if subscription check fails
            }
        }

        // ---- Strategy (Data-Driven) ----
        // Enterprise:     forceProvider works as-is
        // Non-Enterprise: ElevenLabs → auto-downgraded to Gemini/Kokoro
        // Emergency:      Greeting → ElevenLabs, Body → OpenAI (cost saving)

        let audioResponse: Response | null = null;
        let usedProvider = 'none';
        let usedModel: string = isGreeting ? ELEVENLABS_MODELS.greeting : ELEVENLABS_MODELS.body;

        if (effectiveProvider === 'elevenlabs') {
            audioResponse = await synthesizeElevenLabs(safeText, lang, isGreeting, voice_id, model_id);
            usedProvider = 'elevenlabs';
        } else if (effectiveProvider === 'google') {
            // Gemini TTS for simple voice names (Kore, Leda, etc.)
            // Legacy Cloud TTS for hyphenated voice names (tr-TR-Chirp3-HD-Kore)
            const isGeminiVoice = voice_id && !voice_id.includes('-');
            if (isGeminiVoice) {
                audioResponse = await synthesizeGeminiTTS(safeText, lang, voice_id);
                usedProvider = 'google-gemini';
                usedModel = 'gemini-2.5-flash-tts';
            } else {
                audioResponse = await synthesizeGoogleTTS(safeText, lang, voice_id);
                usedProvider = 'google';
                usedModel = voice_id || 'google-default';
            }
        } else if (effectiveProvider === 'openai') {
            audioResponse = await synthesizeOpenAI(safeText, lang, voice_id);
            usedProvider = 'openai';
            usedModel = 'tts-1';
        } else if (effectiveProvider === 'kokoro') {
            if (lang !== 'en') {
                return NextResponse.json({ error: 'Kokoro only supports English' }, { status: 400 });
            }
            audioResponse = await synthesizeKokoroTTS(safeText, lang, voice_id);
            usedProvider = 'kokoro';
            usedModel = 'kokoro-v1';
        } else if (emergencyActive) {
            // Emergency mode: cost-optimized fallback chain
            // EN: Kokoro (cheapest) → Google → OpenAI → ElevenLabs
            // TR: Google → OpenAI → ElevenLabs
            console.info(`[TTS] ⚠️ Emergency mode active — using cost-optimized chain (${lang})`);

            // Kokoro first for English (ultra-low cost)
            if (lang === 'en') {
                audioResponse = await synthesizeKokoroTTS(safeText, 'en');
                usedProvider = 'kokoro-emergency';
                usedModel = 'kokoro-v1';
            }

            if (!audioResponse) {
                audioResponse = await synthesizeGoogleTTS(safeText, lang);
                usedProvider = 'google-emergency';
                usedModel = 'google-tts';
            }

            if (!audioResponse) {
                audioResponse = await synthesizeOpenAI(safeText, lang);
                usedProvider = 'openai-emergency';
                usedModel = 'tts-1';
            }

            // Fallback to ElevenLabs if all cheaper alternatives fail
            if (!audioResponse) {
                audioResponse = await synthesizeElevenLabs(safeText, lang, isGreeting, voice_id, model_id);
                usedProvider = 'elevenlabs';
                usedModel = ELEVENLABS_MODELS.body;
            }
        } else {
            // ---- Resolve plan for default chain ----
            let isEnterprisePlan = false;
            if (tenantId !== 'default') {
                try {
                    const guard = await checkSubscriptionActive(getTtsDb(), tenantId);
                    isEnterprisePlan = guard.planId === 'enterprise';
                } catch { /* fail-open */ }
            }

            if (isEnterprisePlan) {
                // Enterprise default chain:
                // EN: ElevenLabs → Kokoro → Gemini → OpenAI
                // TR: ElevenLabs → Gemini → OpenAI
                audioResponse = await synthesizeElevenLabs(safeText, lang, isGreeting, voice_id, model_id);
                usedProvider = 'elevenlabs';

                if (!audioResponse && lang === 'en') {
                    console.warn('[TTS] ElevenLabs failed, trying Kokoro (EN)...');
                    audioResponse = await synthesizeKokoroTTS(safeText, 'en');
                    usedProvider = 'kokoro-fallback';
                    usedModel = 'kokoro-v1';
                }

                if (!audioResponse) {
                    console.warn('[TTS] Trying Gemini TTS...');
                    audioResponse = await synthesizeGeminiTTS(safeText, lang, 'Kore');
                    usedProvider = 'google-gemini-fallback';
                    usedModel = 'gemini-2.5-flash-tts';
                }

                if (!audioResponse) {
                    console.warn('[TTS] All premium failed, falling back to OpenAI TTS (slow!)');
                    audioResponse = await synthesizeOpenAI(safeText, lang);
                    usedProvider = 'openai-fallback';
                    usedModel = 'tts-1';
                }
            } else {
                // Starter/Professional default chain (cost-optimized):
                // EN: Kokoro → Gemini → OpenAI
                // TR: Gemini → OpenAI
                if (lang === 'en') {
                    audioResponse = await synthesizeKokoroTTS(safeText, 'en');
                    usedProvider = 'kokoro';
                    usedModel = 'kokoro-v1';
                }

                if (!audioResponse) {
                    audioResponse = await synthesizeGeminiTTS(safeText, lang, 'Kore');
                    usedProvider = 'google-gemini';
                    usedModel = 'gemini-2.5-flash-tts';
                }

                if (!audioResponse) {
                    console.warn('[TTS] Gemini failed, trying legacy Google TTS...');
                    audioResponse = await synthesizeGoogleTTS(safeText, lang);
                    usedProvider = 'google-fallback';
                    usedModel = 'google-tts';
                }

                if (!audioResponse) {
                    console.warn('[TTS] All cost-optimized failed, falling back to OpenAI TTS (slow!)');
                    audioResponse = await synthesizeOpenAI(safeText, lang);
                    usedProvider = 'openai-fallback';
                    usedModel = 'tts-1';
                }
            }
        }

        const ttsLatencyMs = performance.now() - ttsStartMs;

        // ---- No provider succeeded ----
        if (!audioResponse || !audioResponse.body) {
            const allOpen = ttsCircuitBreaker.isOpen() && googleTtsCircuitBreaker.isOpen()
                && openaiCircuitBreaker.isOpen() && kokoroCircuitBreaker.isOpen();
            return NextResponse.json(
                {
                    error: 'All TTS providers failed',
                    circuitBreakers: allOpen ? 'all_open' : 'partial',
                    stats: {
                        elevenlabs: ttsCircuitBreaker.getStats(),
                        google: googleTtsCircuitBreaker.getStats(),
                        openai: openaiCircuitBreaker.getStats(),
                        kokoro: kokoroCircuitBreaker.getStats(),
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
        const contentType = audioResponse.headers.get('Content-Type') || 'audio/mpeg';

        return new NextResponse(audioResponse.body, {
            headers: {
                'Content-Type': contentType,
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
            google: {
                configured: !!getServiceAccountKey(),
                role: 'fallback (TR+EN, Wavenet free / Chirp3-HD standard)',
                voices: {
                    tr: 'tr-TR-Wavenet-D (free) / tr-TR-Chirp3-HD-Kore (standard)',
                    en: 'en-US-Neural2-F (free)',
                },
                performance: {
                    latency: '~200-300ms',
                    note: 'Wavenet: 1M chars/month free. Chirp3-HD: $30/1M chars (premium quality)',
                },
            },
            kokoro: {
                configured: isKokoroConfigured(),
                role: 'EN-only cost-optimized fallback',
                voice: 'af_heart (default)',
                model: 'kokoro-v1',
                performance: {
                    latency: '~150ms',
                    note: 'English only. <$1/1M chars via Together AI. CPU+GPU support.',
                },
            },
            openai: {
                configured: !!OPENAI_API_KEY,
                role: 'last-resort fallback only',
                voice: OPENAI_TTS_VOICE,
                model: 'tts-1',
                performance: {
                    latency: '~4232ms (9x slower than ElevenLabs Turbo)',
                    note: 'Only activates when other providers fail',
                },
            },
        },
        strategy: {
            enterprise: {
                tr: 'ElevenLabs → Gemini Flash → OpenAI',
                en: 'ElevenLabs → Kokoro → Gemini Flash → OpenAI',
            },
            starter_professional: {
                tr: 'Gemini Flash → Legacy Google → OpenAI',
                en: 'Kokoro → Gemini Flash → Legacy Google → OpenAI',
            },
            emergency_tr: 'Google → OpenAI → ElevenLabs',
            emergency_en: 'Kokoro → Google → OpenAI → ElevenLabs',
            note: 'ElevenLabs is Enterprise-only. Non-Enterprise tenants auto-downgrade to Gemini/Kokoro.',
        },
    });
}
