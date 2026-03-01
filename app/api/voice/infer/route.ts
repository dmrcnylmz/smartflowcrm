// Voice Infer API — OpenAI GPT-Powered Intelligent Conversation
// With Circuit Breaker, Response Cache, and GPU Manager integration
// STT (browser) → GPT-4o-mini (here) → TTS (browser)

import { NextRequest, NextResponse } from 'next/server';
import { gpuCircuitBreaker, openaiCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { inferCache, buildInferCacheKey, type CachedInferResponse } from '@/lib/voice/response-cache';
import { handleApiError } from '@/lib/utils/error-handler';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';

// =============================================
// Conversation Memory (in-memory, per session)
// =============================================
interface ConversationEntry {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const conversationStore = new Map<string, {
    messages: ConversationEntry[];
    lastActivity: number;
    turnCount: number;
}>();

// Auto-cleanup sessions older than 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min
const SESSION_TTL = 30 * 60 * 1000; // 30 min

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [id, session] of conversationStore.entries()) {
            if (now - session.lastActivity > SESSION_TTL) {
                conversationStore.delete(id);
            }
        }
        // Also purge expired cache entries
        inferCache.purgeExpired();
    }, CLEANUP_INTERVAL);
}

// =============================================
// CRM System Prompt (Turkish AI Receptionist)
// =============================================
const SYSTEM_PROMPT = `Sen SmartFlow CRM'in AI resepsiyonistisin. Adın Ayşe. Türkçe konuşuyorsun.

GÖREVLER:
1. Müşterileri sıcak ve profesyonel karşıla
2. Randevu taleplerini al (tarih, saat, konu sor)
3. Şikayetleri dinle, detayları sor, çözüm öner
4. Bilgi taleplerini yanıtla
5. İptal/değişiklik taleplerini işle

KURALLAR:
- Her zaman kısa ve öz yanıt ver (maksimum 2 cümle)
- Doğal ve samimi ol, robot gibi konuşma
- Müşterinin söylediğini anladığını göster
- Gerekli bilgileri sormayı unutma (isim, tarih, detay vb.)
- Konuşmayı takip et, önceki mesajları hatırla

YANIT FORMATI:
Her yanıtının sonuna aşağıdaki intent etiketini ekle (tek satırda):
[INTENT:appointment|complaint|info_request|cancellation|greeting|unknown CONFIDENCE:0.0-1.0]

Örnek:
"Merhaba! SmartFlow CRM'e hoş geldiniz, ben Ayşe. Size nasıl yardımcı olabilirim? [INTENT:greeting CONFIDENCE:0.95]"
"Randevunuzu aldım. Hangi gün ve saat uygun olur? [INTENT:appointment CONFIDENCE:0.9]"`;

// =============================================
// Intent Parser
// =============================================
function parseIntentFromResponse(text: string): {
    cleanText: string;
    intent: string;
    confidence: number;
} {
    const intentMatch = text.match(/\[INTENT:(\w+)\s+CONFIDENCE:([\d.]+)\]/);

    if (intentMatch) {
        return {
            cleanText: text.replace(/\s*\[INTENT:\w+\s+CONFIDENCE:[\d.]+\]/, '').trim(),
            intent: intentMatch[1],
            confidence: parseFloat(intentMatch[2]),
        };
    }

    // Fallback: basic keyword intent detection
    const lower = text.toLowerCase();
    let intent = 'unknown';
    let confidence = 0.5;

    if (/randevu|tarih|saat|görüşme/.test(lower)) {
        intent = 'appointment';
        confidence = 0.7;
    } else if (/şikayet|sorun|problem|memnun/.test(lower)) {
        intent = 'complaint';
        confidence = 0.7;
    } else if (/bilgi|fiyat|nasıl|nedir/.test(lower)) {
        intent = 'info_request';
        confidence = 0.6;
    } else if (/merhaba|selam|iyi günler|hoş geldiniz/.test(lower)) {
        intent = 'greeting';
        confidence = 0.9;
    }

    return { cleanText: text.trim(), intent, confidence };
}

// =============================================
// OpenAI API Call (wrapped with Circuit Breaker)
// =============================================
async function callOpenAI(
    messages: ConversationEntry[],
): Promise<string> {
    return openaiCircuitBreaker.execute(async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages,
                max_tokens: 150,
                temperature: 0.7,
                top_p: 0.9,
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Üzgünüm, yanıt oluşturamadım.';
    });
}

// =============================================
// Fallback: Call RunPod Personaplex server
// (wrapped with Circuit Breaker + GPU Manager)
// =============================================
async function callPersonaplex(
    text: string,
    persona: string,
    language: string,
): Promise<{ intent?: string; confidence?: number; response_text?: string; [key: string]: unknown }> {
    return gpuCircuitBreaker.execute(async () => {
        // Ensure GPU is awake before calling
        const isReady = await gpuManager.ensureReady();
        if (!isReady) {
            throw new Error('GPU not ready after wake attempt');
        }

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        const apiKey = process.env.PERSONAPLEX_API_KEY;
        if (apiKey) headers['X-API-Key'] = apiKey;

        const res = await fetch(`${PERSONAPLEX_URL}/infer`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text, persona, language }),
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) throw new Error(`Personaplex ${res.status}`);
        return res.json();
    });
}

// =============================================
// Fallback response when all backends are down
// =============================================
function getGracefulFallbackResponse(
    language: string,
    sessionId: string,
): {
    session_id: string;
    intent: string;
    confidence: number;
    response_text: string;
    latency_ms: number;
    source: string;
} {
    const isEnglish = language === 'en';
    return {
        session_id: sessionId,
        intent: 'system_error',
        confidence: 1.0,
        response_text: isEnglish
            ? 'I apologize, we are experiencing a brief technical issue. Please try again in a moment, or I can connect you with a human agent.'
            : 'Özür dilerim, kısa bir teknik sorun yaşıyoruz. Lütfen bir dakika sonra tekrar deneyin veya sizi bir müşteri temsilcisine bağlayabilirim.',
        latency_ms: 0,
        source: 'graceful-fallback',
    };
}

// =============================================
// Main API Route
// =============================================
export async function POST(request: NextRequest) {
    const startMs = performance.now();

    try {
        const body = await request.json();
        const {
            text,
            persona = 'default',
            language = 'tr',
            session_id,
        } = body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json(
                { error: 'Text is required and must be a non-empty string' },
                { status: 400 },
            );
        }

        if (text.length > 2000) {
            return NextResponse.json(
                { error: 'Text exceeds maximum length of 2000 characters' },
                { status: 400 },
            );
        }

        const validPersonas = ['default', 'support', 'sales', 'receptionist'];
        if (!validPersonas.includes(persona)) {
            return NextResponse.json(
                { error: `Invalid persona. Must be one of: ${validPersonas.join(', ')}` },
                { status: 400 },
            );
        }

        const validLanguages = ['tr', 'en'];
        if (!validLanguages.includes(language)) {
            return NextResponse.json(
                { error: `Invalid language. Must be one of: ${validLanguages.join(', ')}` },
                { status: 400 },
            );
        }

        // Determine session ID
        const sessionId = session_id || `anon-${Date.now()}`;

        // --- MOCK MODE OVERRIDE ---
        if (process.env.PERSONAPLEX_MOCK_MODE === 'true') {
            const lowerText = text.toLowerCase();
            let intent = 'unknown';
            let response_text = 'Simülasyon modundayız. Size nasıl yardımcı olabilirim?';

            // Simplified Intent Matching for Mock Mode
            if (/randevu|tarih|saat|görüşme/.test(lowerText)) {
                intent = 'appointment';
                response_text = 'Tabii, randevu oluşturabilirim. Hangi gün ve saat uygun olur?';
            } else if (/şikayet|sorun|problem|memnun/.test(lowerText)) {
                intent = 'complaint';
                response_text = 'Yaşadığınız sorun için üzgünüm. Detayları alabilir miyim?';
            } else if (/bilgi|fiyat|nasıl|nedir/.test(lowerText)) {
                intent = 'info_request';
                response_text = 'Fiyat bilgisi için size yardımcı olabilirim. Hangi ürün/hizmet ile ilgileniyorsunuz?';
            } else if (/merhaba|selam|iyi günler|hoş geldiniz/.test(lowerText)) {
                intent = 'greeting';
                response_text = 'Merhaba! SmartFlow CRM\'e hoş geldiniz. Size nasıl yardımcı olabilirim?';
            }

            const latencyMs = performance.now() - startMs;
            console.log(`[Voice Infer] MOCK MODE | session=${sessionId} intent=${intent} latency=${latencyMs.toFixed(0)}ms`);

            return NextResponse.json({
                session_id: sessionId,
                intent,
                confidence: 0.95,
                response_text,
                latency_ms: latencyMs + 100, // add some artificial delay
                source: 'mock-engine',
                cached: false,
                mode: 'mock'
            });
        }

        // --- CHECK RESPONSE CACHE FIRST ---
        const cacheKey = buildInferCacheKey(text, persona, language);
        const cachedResponse = inferCache.get(cacheKey);

        if (cachedResponse) {
            const latencyMs = performance.now() - startMs;
            console.log(
                `[Voice Infer] CACHE HIT | session=${sessionId} intent=${cachedResponse.intent} latency=${latencyMs.toFixed(0)}ms`,
            );
            return NextResponse.json({
                ...cachedResponse,
                session_id: sessionId,
                latency_ms: latencyMs,
                source: 'cache',
                cached: true,
            });
        }

        // ---- Try OpenAI First ----
        if (OPENAI_API_KEY && !openaiCircuitBreaker.isOpen()) {
            try {
                // Get or create conversation
                let session = conversationStore.get(sessionId);
                if (!session) {
                    session = {
                        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
                        lastActivity: Date.now(),
                        turnCount: 0,
                    };
                    conversationStore.set(sessionId, session);
                }

                // Add user message
                session.messages.push({ role: 'user', content: text });
                session.lastActivity = Date.now();
                session.turnCount++;

                // Keep conversation manageable (system + last 20 messages)
                if (session.messages.length > 21) {
                    session.messages = [
                        session.messages[0], // system prompt
                        ...session.messages.slice(-20),
                    ];
                }

                // Call OpenAI (through circuit breaker)
                const rawResponse = await callOpenAI(session.messages);

                // Parse intent from response
                const { cleanText, intent, confidence } = parseIntentFromResponse(rawResponse);

                // Store assistant response in memory
                session.messages.push({ role: 'assistant', content: cleanText });

                const latencyMs = performance.now() - startMs;

                console.log(
                    `[Voice Infer] GPT | session=${sessionId} turn=${session.turnCount} intent=${intent} conf=${confidence} latency=${latencyMs.toFixed(0)}ms`,
                );

                const result = {
                    session_id: sessionId,
                    intent,
                    confidence,
                    response_text: cleanText,
                    latency_ms: latencyMs,
                    source: 'openai-gpt',
                    turn: session.turnCount,
                };

                // Cache the response
                inferCache.set(cacheKey, {
                    ...result,
                    cached: true,
                } as CachedInferResponse);

                return NextResponse.json(result);
            } catch (openaiError) {
                const isCircuitOpen = openaiError instanceof CircuitOpenError;
                console.error(
                    `[Voice Infer] OpenAI failed${isCircuitOpen ? ' (circuit OPEN)' : ''}, falling back:`,
                    isCircuitOpen ? openaiError.message : openaiError,
                );
                // Fall through to Personaplex fallback
            }
        }

        // ---- Fallback: Personaplex keyword-based ----
        if (!gpuCircuitBreaker.isOpen()) {
            try {
                const data = await callPersonaplex(text, persona, language);
                const latencyMs = performance.now() - startMs;

                const result = {
                    ...data,
                    latency_ms: latencyMs,
                    source: 'personaplex-keyword',
                };

                // Cache the response
                inferCache.set(cacheKey, {
                    session_id: sessionId,
                    intent: data.intent || 'unknown',
                    confidence: data.confidence || 0.5,
                    response_text: data.response_text || '',
                    latency_ms: latencyMs,
                    source: 'personaplex-keyword',
                    cached: true,
                } as CachedInferResponse);

                return NextResponse.json(result);
            } catch (fallbackError) {
                const isCircuitOpen = fallbackError instanceof CircuitOpenError;
                console.error(
                    `[Voice Infer] Personaplex failed${isCircuitOpen ? ' (circuit OPEN)' : ''}:`,
                    isCircuitOpen ? fallbackError.message : fallbackError,
                );
            }
        }

        // ---- All backends failed: Graceful degradation ----
        console.warn('[Voice Infer] All backends unavailable — returning graceful fallback');
        const fallbackResponse = getGracefulFallbackResponse(language, sessionId);
        const latencyMs = performance.now() - startMs;

        return NextResponse.json({
            ...fallbackResponse,
            latency_ms: latencyMs,
            circuit_breaker: {
                openai: openaiCircuitBreaker.getStats(),
                gpu: gpuCircuitBreaker.getStats(),
            },
        });

    } catch (error) {
        return handleApiError(error, 'VoiceInfer');
    }
}

// =============================================
// GET: Status endpoint for debugging
// =============================================
export async function GET() {
    return NextResponse.json({
        cache: inferCache.getStats(),
        circuitBreakers: {
            openai: openaiCircuitBreaker.getStats(),
            gpu: gpuCircuitBreaker.getStats(),
        },
        gpu: gpuManager.getStatus(),
    });
}
