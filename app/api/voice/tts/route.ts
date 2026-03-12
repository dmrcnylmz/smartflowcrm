/**
 * Voice TTS API — Multi-Provider Fallback Strategy
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ PROVIDER LATENCY BENCHMARK:                                         │
 * │                                                                      │
 * │  Cartesia Sonic-3:                       ~40ms ✅ ULTRA-HIZLI       │
 * │  Murf Falcon:                           ~130ms ✅ Hızlı + ucuz     │
 * │  Kokoro (EN-only):                      ~150ms ✅ Ultra-ucuz       │
 * │  Google Cloud TTS Neural2:              ~200ms ✅ Legacy fallback  │
 * │  OpenAI TTS tts-1:                     ~4232ms ❌ Son çare         │
 * │                                                                      │
 * │ KARAR: Cartesia varsayılan tüm paketler.                            │
 * │ Murf budget fallback. OpenAI son çare.                              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Strategy (Cartesia primary — all plans):
 *   All TR:      Cartesia → OpenAI
 *   All EN:      Cartesia → Kokoro → Murf → OpenAI
 *   Emergency:   Kokoro (EN) / Cartesia (TR) → Murf (EN) → OpenAI
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
import { openaiCircuitBreaker, googleTtsCircuitBreaker, kokoroCircuitBreaker, cartesiaCircuitBreaker, murfCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

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

        // ---- Strategy (Cartesia primary all plans) ----
        // TR: Cartesia → OpenAI
        // EN: Cartesia → Kokoro → Murf → OpenAI
        // Emergency TR: Cartesia → OpenAI
        // Emergency EN: Kokoro → Murf → Cartesia → OpenAI

        let audioResponse: Response | null = null;
        let usedProvider = 'none';
        let usedModel = 'sonic-3';

        if (forceProvider === 'cartesia') {
            audioResponse = await synthesizeCartesiaTTS(safeText, lang, voice_id);
            usedProvider = 'cartesia';
            usedModel = 'sonic-3';
        } else if (forceProvider === 'murf') {
            audioResponse = await synthesizeMurfTTS(safeText, lang, voice_id);
            usedProvider = 'murf';
            usedModel = 'falcon';
        } else if (forceProvider === 'google') {
            audioResponse = await synthesizeGoogleTTS(safeText, lang, voice_id);
            usedProvider = 'google';
            usedModel = voice_id || 'google-default';
        } else if (forceProvider === 'openai') {
            audioResponse = await synthesizeOpenAI(safeText, lang, voice_id);
            usedProvider = 'openai';
            usedModel = 'tts-1';
        } else if (forceProvider === 'kokoro') {
            if (lang !== 'en') {
                return NextResponse.json({ error: 'Kokoro only supports English' }, { status: 400 });
            }
            audioResponse = await synthesizeKokoroTTS(safeText, lang, voice_id);
            usedProvider = 'kokoro';
            usedModel = 'kokoro-v1';
        } else if (emergencyActive) {
            // Emergency mode: cost-optimized fallback chain
            // EN: Kokoro → Murf → Cartesia → OpenAI
            // TR: Cartesia → OpenAI (Murf has NO Turkish support)
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
        } else {
            // Default chain (all plans — Cartesia primary):
            // TR: Cartesia → OpenAI
            // EN: Cartesia → Kokoro → Murf → OpenAI
            audioResponse = await synthesizeCartesiaTTS(safeText, lang, voice_id);
            usedProvider = 'cartesia';
            usedModel = 'sonic-3';

            if (!audioResponse && lang === 'en') {
                console.warn('[TTS] Cartesia failed, trying Kokoro (EN)...');
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
                console.warn('[TTS] All primary providers failed, falling back to OpenAI TTS (slow!)');
                audioResponse = await synthesizeOpenAI(safeText, lang);
                usedProvider = 'openai-fallback';
                usedModel = 'tts-1';
            }
        }

        const ttsLatencyMs = performance.now() - ttsStartMs;

        // ---- No provider succeeded ----
        if (!audioResponse || !audioResponse.body) {
            const allOpen = cartesiaCircuitBreaker.isOpen()
                && murfCircuitBreaker.isOpen() && openaiCircuitBreaker.isOpen()
                && kokoroCircuitBreaker.isOpen();
            return NextResponse.json(
                {
                    error: 'All TTS providers failed',
                    circuitBreakers: allOpen ? 'all_open' : 'partial',
                    stats: {
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
            all_plans: {
                tr: 'Cartesia → OpenAI',
                en: 'Cartesia → Kokoro → Murf → OpenAI',
            },
            emergency_tr: 'Cartesia → OpenAI',
            emergency_en: 'Kokoro → Murf → Cartesia → OpenAI',
            note: 'Cartesia Sonic-3 is the default for all plans. Murf is EN-only.',
        },
    });
}
