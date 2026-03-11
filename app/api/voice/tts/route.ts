/**
 * Voice TTS API — Multi-Provider Fallback Strategy
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ PROVIDER LATENCY BENCHMARK:                                         │
 * │                                                                      │
 * │  Cartesia Sonic-3:                       ~40ms ✅ ULTRA-HIZLI       │
 * │  Murf Falcon:                           ~130ms ✅ Hızlı + ucuz     │
 * │  ElevenLabs turbo_v2_5 (body):          ~474ms ✅ Premium kalite   │
 * │  ElevenLabs multilingual_v2 (greeting): ~1876ms ✅ Premium kalite  │
 * │  Kokoro (EN-only):                      ~150ms ✅ Ultra-ucuz       │
 * │  Google Cloud TTS Neural2:              ~200ms ✅ Legacy fallback  │
 * │  OpenAI TTS tts-1:                     ~4232ms ❌ Son çare         │
 * │                                                                      │
 * │ KARAR: Cartesia varsayılan. ElevenLabs Enterprise-only.             │
 * │ Murf budget fallback. OpenAI son çare.                              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Strategy:
 *   Enterprise TR:  ElevenLabs → Cartesia → OpenAI
 *   Enterprise EN:  ElevenLabs → Cartesia → Kokoro → Murf → OpenAI
 *   Starter/Pro TR: Cartesia → OpenAI
 *   Starter/Pro EN: Kokoro → Cartesia → Murf → OpenAI
 *   Emergency TR:   Cartesia → OpenAI → ElevenLabs
 *   Emergency EN:   Kokoro → Murf → Cartesia → OpenAI → ElevenLabs
 *
 * NOT: Murf Türkçe DESTEKLEMİYOR — sadece EN fallback'lerde kullanılır.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/utils/error-handler';
import { metricsLogger } from '@/lib/billing/metrics-logger';
import { shouldUseEmergencyTts } from '@/lib/billing/cost-monitor';
import { sessionRegistry } from '@/lib/voice/session-registry';
import { meterTtsUsage } from '@/lib/billing/metering';
import { checkCostThresholds } from '@/lib/billing/cost-monitor';
import { ttsCircuitBreaker, openaiCircuitBreaker, googleTtsCircuitBreaker, kokoroCircuitBreaker, cartesiaCircuitBreaker, murfCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';
import { synthesizeGoogleTTS, getServiceAccountKey } from '@/lib/voice/tts-google';
import { synthesizeCartesiaTTS, isCartesiaConfigured } from '@/lib/voice/tts-cartesia';
import { synthesizeMurfTTS, isMurfConfigured } from '@/lib/voice/tts-murf';
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
// ElevenLabs Configuration (ENTERPRISE ONLY)
// =============================================

const ELEVENLABS_VOICES = {
    tr: 'pFZP5JQG7iQjIQuC4Bku', // Yildiz — native Turkish female
    en: 'EXAVITQu4vr4xnSDxMaL', // Sarah  — professional English female
} as const;

const ELEVENLABS_MODELS = {
    greeting: 'eleven_multilingual_v2',   // Premium kalite — 1876ms
    body: 'eleven_turbo_v2_5',            // Hızlı — 474ms
} as const;

// =============================================
// OpenAI TTS (LAST RESORT FALLBACK ONLY)
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
// Provider: ElevenLabs (ENTERPRISE ONLY)
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
// =============================================

async function synthesizeOpenAI(
    text: string,
    lang: 'tr' | 'en',
    voiceName?: string,
): Promise<Response | null> {
    if (!OPENAI_API_KEY) return null;

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
                signal: AbortSignal.timeout(15000),
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
        const authTenantId = request.headers.get('x-user-tenant') || '';
        const tenantId = tenant_id
            || authTenantId
            || (session_id ? sessionRegistry.getTenant(session_id) : null)
            || 'default';

        // ---- Emergency Mode Check ----
        let emergencyActive = false;
        if (!isGreeting && !forceProvider) {
            try {
                emergencyActive = await shouldUseEmergencyTts(getTtsDb(), tenantId);
            } catch {
                // Ignore — keep default
            }
        }

        // ---- Plan-Based Provider Enforcement ----
        // Non-Enterprise tenants cannot use ElevenLabs → override to Cartesia/Kokoro
        let effectiveProvider = forceProvider;
        let planId = 'starter';
        if (tenantId !== 'default' && forceProvider === 'elevenlabs') {
            try {
                const guard = await checkSubscriptionActive(getTtsDb(), tenantId);
                planId = guard.planId;
                if (guard.planId !== 'enterprise') {
                    // Override ElevenLabs → Cartesia for all, Kokoro for EN
                    effectiveProvider = lang === 'en' ? 'kokoro' : 'cartesia';
                    console.info(`[TTS] Plan-based override: ${forceProvider} → ${effectiveProvider} (plan=${guard.planId}, tenant=${tenantId})`);
                }
            } catch {
                // Fail-open: allow ElevenLabs if subscription check fails
            }
        }

        // ---- Strategy (Data-Driven) ----
        // Enterprise TR:  ElevenLabs → Cartesia → OpenAI
        // Enterprise EN:  ElevenLabs → Cartesia → Kokoro → Murf → OpenAI
        // Non-Enterprise: Cartesia → OpenAI (TR) | Kokoro → Cartesia → Murf → OpenAI (EN)
        // Emergency TR:   Cartesia → OpenAI → ElevenLabs
        // Emergency EN:   Kokoro → Murf → Cartesia → OpenAI → ElevenLabs
        // NOTE: Murf does NOT support Turkish — only used in EN fallback chains

        let audioResponse: Response | null = null;
        let usedProvider = 'none';
        let usedModel: string = isGreeting ? ELEVENLABS_MODELS.greeting : ELEVENLABS_MODELS.body;

        if (effectiveProvider === 'elevenlabs') {
            audioResponse = await synthesizeElevenLabs(safeText, lang, isGreeting, voice_id, model_id);
            usedProvider = 'elevenlabs';
        } else if (effectiveProvider === 'cartesia') {
            audioResponse = await synthesizeCartesiaTTS(safeText, lang, voice_id);
            usedProvider = 'cartesia';
            usedModel = 'sonic-3';
        } else if (effectiveProvider === 'murf') {
            audioResponse = await synthesizeMurfTTS(safeText, lang, voice_id);
            usedProvider = 'murf';
            usedModel = 'falcon';
        } else if (effectiveProvider === 'google') {
            // Legacy Google Cloud TTS (kept for backward compatibility)
            audioResponse = await synthesizeGoogleTTS(safeText, lang, voice_id);
            usedProvider = 'google';
            usedModel = voice_id || 'google-default';
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
            // EN: Kokoro → Murf → Cartesia → OpenAI → ElevenLabs
            // TR: Cartesia → OpenAI → ElevenLabs (Murf has NO Turkish support)
            console.info(`[TTS] Emergency mode active — using cost-optimized chain (${lang})`);

            // Kokoro first for English (ultra-low cost)
            if (lang === 'en') {
                audioResponse = await synthesizeKokoroTTS(safeText, 'en');
                usedProvider = 'kokoro-emergency';
                usedModel = 'kokoro-v1';
            }

            // Murf for EN only ($0.01/1K — cheapest premium EN)
            if (!audioResponse && lang === 'en') {
                audioResponse = await synthesizeMurfTTS(safeText, lang);
                usedProvider = 'murf-emergency';
                usedModel = 'falcon';
            }

            // Cartesia fallback (supports both TR + EN)
            if (!audioResponse) {
                audioResponse = await synthesizeCartesiaTTS(safeText, lang);
                usedProvider = 'cartesia-emergency';
                usedModel = 'sonic-3';
            }

            if (!audioResponse) {
                audioResponse = await synthesizeOpenAI(safeText, lang);
                usedProvider = 'openai-emergency';
                usedModel = 'tts-1';
            }

            // Fallback to ElevenLabs if all cheaper alternatives fail
            if (!audioResponse) {
                audioResponse = await synthesizeElevenLabs(safeText, lang, isGreeting, voice_id, model_id);
                usedProvider = 'elevenlabs-emergency';
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
                // TR: ElevenLabs → Cartesia → OpenAI
                // EN: ElevenLabs → Cartesia → Kokoro → Murf → OpenAI
                audioResponse = await synthesizeElevenLabs(safeText, lang, isGreeting, voice_id, model_id);
                usedProvider = 'elevenlabs';

                if (!audioResponse) {
                    console.warn('[TTS] ElevenLabs failed, trying Cartesia Sonic...');
                    audioResponse = await synthesizeCartesiaTTS(safeText, lang);
                    usedProvider = 'cartesia-fallback';
                    usedModel = 'sonic-3';
                }

                if (!audioResponse && lang === 'en') {
                    console.warn('[TTS] Trying Kokoro (EN)...');
                    audioResponse = await synthesizeKokoroTTS(safeText, 'en');
                    usedProvider = 'kokoro-fallback';
                    usedModel = 'kokoro-v1';
                }

                // Murf only for EN (no Turkish support)
                if (!audioResponse && lang === 'en') {
                    console.warn('[TTS] Trying Murf Falcon (EN)...');
                    audioResponse = await synthesizeMurfTTS(safeText, lang);
                    usedProvider = 'murf-fallback';
                    usedModel = 'falcon';
                }

                if (!audioResponse) {
                    console.warn('[TTS] All premium failed, falling back to OpenAI TTS (slow!)');
                    audioResponse = await synthesizeOpenAI(safeText, lang);
                    usedProvider = 'openai-fallback';
                    usedModel = 'tts-1';
                }
            } else {
                // Starter/Professional default chain (cost-optimized):
                // EN: Kokoro → Cartesia → Murf → OpenAI
                // TR: Cartesia → OpenAI (Murf has NO Turkish support)
                if (lang === 'en') {
                    audioResponse = await synthesizeKokoroTTS(safeText, 'en');
                    usedProvider = 'kokoro';
                    usedModel = 'kokoro-v1';
                }

                if (!audioResponse) {
                    audioResponse = await synthesizeCartesiaTTS(safeText, lang);
                    usedProvider = 'cartesia';
                    usedModel = 'sonic-3';
                }

                // Murf only for EN (no Turkish support)
                if (!audioResponse && lang === 'en') {
                    console.warn('[TTS] Cartesia failed, trying Murf Falcon (EN)...');
                    audioResponse = await synthesizeMurfTTS(safeText, lang);
                    usedProvider = 'murf-fallback';
                    usedModel = 'falcon';
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
            const allOpen = ttsCircuitBreaker.isOpen() && cartesiaCircuitBreaker.isOpen()
                && murfCircuitBreaker.isOpen() && openaiCircuitBreaker.isOpen()
                && kokoroCircuitBreaker.isOpen();
            return NextResponse.json(
                {
                    error: 'All TTS providers failed',
                    circuitBreakers: allOpen ? 'all_open' : 'partial',
                    stats: {
                        elevenlabs: ttsCircuitBreaker.getStats(),
                        cartesia: cartesiaCircuitBreaker.getStats(),
                        murf: murfCircuitBreaker.getStats(),
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
            cartesia: {
                configured: isCartesiaConfigured(),
                role: 'default (all plans, TR+EN)',
                model: 'sonic-3',
                performance: {
                    latency: '~40ms TTFB',
                    note: '42+ languages. Ultra-low latency voice agent standard.',
                },
            },
            elevenlabs: {
                configured: !!ELEVENLABS_API_KEY,
                role: 'enterprise-only premium',
                voices: ELEVENLABS_VOICES,
                models: ELEVENLABS_MODELS,
                performance: {
                    greeting_latency: '~1876ms (multilingual_v2)',
                    body_latency: '~474ms (turbo_v2_5)',
                },
            },
            murf: {
                configured: isMurfConfigured(),
                role: 'budget-friendly EN-only fallback',
                model: 'falcon',
                performance: {
                    latency: '~130ms TTFB',
                    note: 'English only. $0.01/1K chars. No Turkish support.',
                },
            },
            kokoro: {
                configured: isKokoroConfigured(),
                role: 'EN-only cost-optimized',
                voice: 'af_heart (default)',
                model: 'kokoro-v1',
                performance: {
                    latency: '~150ms',
                    note: 'English only. <$1/1M chars via Together AI.',
                },
            },
            google: {
                configured: !!getServiceAccountKey(),
                role: 'legacy fallback (backward compat)',
                performance: {
                    latency: '~200-300ms',
                },
            },
            openai: {
                configured: !!OPENAI_API_KEY,
                role: 'last-resort fallback only',
                voice: OPENAI_TTS_VOICE,
                model: 'tts-1',
                performance: {
                    latency: '~4232ms',
                    note: 'Only activates when all other providers fail.',
                },
            },
        },
        strategy: {
            enterprise: {
                tr: 'ElevenLabs → Cartesia → OpenAI',
                en: 'ElevenLabs → Cartesia → Kokoro → Murf → OpenAI',
            },
            starter_professional: {
                tr: 'Cartesia → OpenAI',
                en: 'Kokoro → Cartesia → Murf → OpenAI',
            },
            emergency_tr: 'Cartesia → OpenAI → ElevenLabs',
            emergency_en: 'Kokoro → Murf → Cartesia → OpenAI → ElevenLabs',
            note: 'ElevenLabs is Enterprise-only. Cartesia Sonic-3 is the default for all plans. Murf is EN-only.',
        },
    });
}
