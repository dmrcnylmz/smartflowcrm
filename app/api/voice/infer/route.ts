// Voice Infer API — Multi-LLM Intelligent Conversation
// Fallback: Groq (free) → Gemini (free) → OpenAI (paid) → Personaplex → Graceful
// With Circuit Breaker, Response Cache, and GPU Manager integration

import { NextRequest, NextResponse } from 'next/server';
import { gpuCircuitBreaker, openaiCircuitBreaker, groqCircuitBreaker, geminiCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { inferCache, buildInferCacheKey, type CachedInferResponse } from '@/lib/voice/response-cache';
import { handleApiError } from '@/lib/utils/error-handler';
import { generateGroqResponse, isGroqConfigured } from '@/lib/ai/groq-client';
import { generateGeminiResponse, isGeminiConfigured } from '@/lib/ai/gemini-client';

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
const SYSTEM_PROMPT = `Sen Callception'ın AI resepsiyonistisin. Adın Ayşe. Türkçe konuşuyorsun.

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
"Merhaba! Callception'a hoş geldiniz, ben Ayşe. Size nasıl yardımcı olabilirim? [INTENT:greeting CONFIDENCE:0.95]"
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

            // Get mock session for multi-turn tracking
            let mockSession = conversationStore.get(sessionId);
            if (!mockSession) {
                mockSession = { messages: [], lastActivity: Date.now(), turnCount: 0 };
                conversationStore.set(sessionId, mockSession);
            }
            mockSession.turnCount++;
            mockSession.lastActivity = Date.now();

            let intent = 'unknown';
            let response_text = '';
            let confidence = 0.95;

            // Multi-turn mock scenarios with context awareness
            if (/merhaba|selam|iyi günler|hoş geldiniz/.test(lowerText)) {
                intent = 'greeting';
                response_text = 'Merhaba! Callception\'a hoş geldiniz, ben Ayşe. Size nasıl yardımcı olabilirim?';
            } else if (/randevu|tarih|saat|görüşme/.test(lowerText)) {
                intent = 'appointment';
                if (mockSession.turnCount <= 2) {
                    response_text = 'Tabii, randevu oluşturabilirim. Hangi gün ve saat uygun olur?';
                } else {
                    response_text = 'Randevunuzu aldım. Onay mesajı kısa süre içinde gönderilecektir. Başka bir isteğiniz var mı?';
                }
            } else if (/şikayet|sorun|problem|memnun/.test(lowerText)) {
                intent = 'complaint';
                if (mockSession.turnCount <= 2) {
                    response_text = 'Yaşadığınız sorun için üzgünüm. Detayları alabilir miyim? Adınız ve sorunun ne olduğunu söyler misiniz?';
                } else {
                    response_text = 'Şikayetinizi kaydettim. En kısa sürede sizi bilgilendireceğiz. Başka yardımcı olabileceğim bir konu var mı?';
                }
            } else if (/bilgi|fiyat|nasıl|nedir/.test(lowerText)) {
                intent = 'info_request';
                response_text = 'Size yardımcı olabilirim. Hangi hizmetimiz hakkında bilgi almak istiyorsunuz?';
            } else if (/iptal|değişiklik|vazgeç/.test(lowerText)) {
                intent = 'cancellation';
                response_text = 'İptal talebinizi aldım. Randevu numaranızı veya adınızı söyler misiniz?';
            } else if (/teşekkür|sağ ol|eyvallah/.test(lowerText)) {
                intent = 'thanks';
                response_text = 'Rica ederim! Başka bir konuda yardımcı olabilir miyim?';
            } else if (/hoşça kal|görüşürüz|bay bay|güle güle/.test(lowerText)) {
                intent = 'farewell';
                response_text = 'İyi günler dilerim! Tekrar aramaktan çekinmeyin.';
            } else {
                // Context-aware fallback
                confidence = 0.6;
                const responses = [
                    'Anlıyorum. Bu konuda size nasıl yardımcı olabilirim?',
                    'Daha detaylı açıklar mısınız? Size en iyi şekilde yardımcı olmak istiyorum.',
                    'Tabii, bu konuyu not aldım. Başka eklemek istediğiniz bir şey var mı?',
                ];
                response_text = responses[mockSession.turnCount % responses.length];
            }

            const latencyMs = performance.now() - startMs;

            return NextResponse.json({
                session_id: sessionId,
                intent,
                confidence,
                response_text,
                latency_ms: latencyMs + 100,
                source: 'mock-engine',
                cached: false,
                mode: 'mock',
                turn: mockSession.turnCount,
            });
        }

        // --- CHECK RESPONSE CACHE FIRST ---
        const cacheKey = buildInferCacheKey(text, persona, language);
        const cachedResponse = inferCache.get(cacheKey);

        if (cachedResponse) {
            const latencyMs = performance.now() - startMs;
            // Cache hit for inference request
            return NextResponse.json({
                ...cachedResponse,
                session_id: sessionId,
                latency_ms: latencyMs,
                source: 'cache',
                cached: true,
            });
        }

        // Helper: get or create session for multi-turn conversation
        const getSession = () => {
            let session = conversationStore.get(sessionId);
            if (!session) {
                session = {
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
                    lastActivity: Date.now(),
                    turnCount: 0,
                };
                conversationStore.set(sessionId, session);
            }
            return session;
        };

        const addUserMessage = (session: { messages: ConversationEntry[]; lastActivity: number; turnCount: number }) => {
            if (session.messages[session.messages.length - 1]?.content !== text) {
                session.messages.push({ role: 'user', content: text });
                session.lastActivity = Date.now();
                session.turnCount++;
            }
            // Keep conversation manageable (system + last 20 messages)
            if (session.messages.length > 21) {
                session.messages = [session.messages[0], ...session.messages.slice(-20)];
            }
        };

        const buildResult = (cleanText: string, intent: string, confidence: number, source: string, turn: number) => {
            const latencyMs = performance.now() - startMs;
            return {
                session_id: sessionId,
                intent,
                confidence,
                response_text: cleanText,
                latency_ms: latencyMs,
                source,
                turn,
            };
        };

        // ---- 1. Groq — free, ultra-fast (llama-3.3-70b) ----
        if (isGroqConfigured() && !groqCircuitBreaker.isOpen()) {
            try {
                const session = getSession();
                addUserMessage(session);

                const rawResponse = await groqCircuitBreaker.execute(() =>
                    generateGroqResponse(session.messages, { maxTokens: 150, temperature: 0.7 }),
                );

                const { cleanText, intent, confidence } = parseIntentFromResponse(rawResponse);
                session.messages.push({ role: 'assistant', content: cleanText });

                const result = buildResult(cleanText, intent, confidence, 'groq-llama', session.turnCount);
                inferCache.set(cacheKey, { ...result, cached: true } as CachedInferResponse);
                return NextResponse.json(result);
            } catch {
                // Fall through to Gemini
            }
        }

        // ---- 2. Google Gemini — free (Gemini 2.0 Flash) ----
        if (isGeminiConfigured() && !geminiCircuitBreaker.isOpen()) {
            try {
                const session = getSession();
                addUserMessage(session);

                const rawResponse = await geminiCircuitBreaker.execute(() =>
                    generateGeminiResponse(session.messages, { maxTokens: 150, temperature: 0.7 }),
                );

                const { cleanText, intent, confidence } = parseIntentFromResponse(rawResponse);
                session.messages.push({ role: 'assistant', content: cleanText });

                const result = buildResult(cleanText, intent, confidence, 'gemini-flash', session.turnCount);
                inferCache.set(cacheKey, { ...result, cached: true } as CachedInferResponse);
                return NextResponse.json(result);
            } catch {
                // Fall through to OpenAI
            }
        }

        // ---- 3. OpenAI GPT-4o-mini — paid, last resort ----
        if (OPENAI_API_KEY && !openaiCircuitBreaker.isOpen()) {
            try {
                const session = getSession();
                addUserMessage(session);

                const rawResponse = await callOpenAI(session.messages);
                const { cleanText, intent, confidence } = parseIntentFromResponse(rawResponse);
                session.messages.push({ role: 'assistant', content: cleanText });

                const result = buildResult(cleanText, intent, confidence, 'openai-gpt', session.turnCount);
                inferCache.set(cacheKey, { ...result, cached: true } as CachedInferResponse);
                return NextResponse.json(result);
            } catch {
                // Fall through to Personaplex
            }
        }

        // ---- 4. Personaplex keyword-based (GPU) ----
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
            } catch {
                // Personaplex also failed, fall through to graceful fallback
            }
        }

        // ---- All backends failed: Graceful degradation ----
        const fallbackResponse = getGracefulFallbackResponse(language, sessionId);
        const latencyMs = performance.now() - startMs;

        return NextResponse.json({
            ...fallbackResponse,
            latency_ms: latencyMs,
            circuit_breaker: {
                openai: openaiCircuitBreaker.getStats(),
                groq: groqCircuitBreaker.getStats(),
                gemini: geminiCircuitBreaker.getStats(),
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
            groq: groqCircuitBreaker.getStats(),
            gemini: geminiCircuitBreaker.getStats(),
            gpu: gpuCircuitBreaker.getStats(),
        },
        providers: {
            openai: !!OPENAI_API_KEY,
            groq: isGroqConfigured(),
            gemini: isGeminiConfigured(),
        },
        gpu: gpuManager.getStatus(),
    });
}
