// Voice Infer API — Multi-LLM Intelligent Conversation
//
// Fallback Chain:
//   Enterprise: GPU Pod → Groq → OpenAI → fallback
//   Standard:   Groq → OpenAI → Personaplex keyword → fallback
//
// With Circuit Breaker, Response Cache, and GPU Manager integration

import { NextRequest, NextResponse } from 'next/server';
import { gpuCircuitBreaker, openaiCircuitBreaker, groqCircuitBreaker, geminiCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { inferCache, buildInferCacheKey, type CachedInferResponse } from '@/lib/voice/response-cache';
import { handleApiError } from '@/lib/utils/error-handler';
import { generateGroqResponse, isGroqConfigured } from '@/lib/ai/groq-client';
import { generateGeminiResponse, isGeminiConfigured } from '@/lib/ai/gemini-client';
import { metricsLogger } from '@/lib/billing/metrics-logger';
import { sessionRegistry } from '@/lib/voice/session-registry';
import { checkRateLimit, rateLimitExceeded, RATE_LIMITS } from '@/lib/voice/rate-limit';
import { checkSubscriptionActive } from '@/lib/billing/subscription-guard';
import { updateLastGpuActivity } from '@/lib/voice/gpu-pod-state';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';

// ── Enterprise GPU Pod helpers ─────────────────────────────────
let _inferDb: FirebaseFirestore.Firestore | null = null;
function getInferDb() {
    if (!_inferDb) { initAdmin(); _inferDb = getFirestore(); }
    return _inferDb;
}

async function isEnterpriseTenant(tenantId: string): Promise<boolean> {
    if (!tenantId || tenantId === 'default') return false;
    try {
        const guard = await checkSubscriptionActive(getInferDb(), tenantId);
        return guard.active && guard.planId === 'enterprise';
    } catch {
        return false;
    }
}

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
    language: string; // Track session language to detect switches
}>();

// Auto-cleanup sessions older than 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min
const SESSION_TTL = 30 * 60 * 1000; // 30 min
const MAX_CONVERSATIONS = 50_000; // Memory safety cap — prevents unbounded growth

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [id, session] of conversationStore.entries()) {
            if (now - session.lastActivity > SESSION_TTL) {
                conversationStore.delete(id);
            }
        }

        // Hard cap eviction — if still over limit after TTL cleanup, remove oldest
        if (conversationStore.size > MAX_CONVERSATIONS) {
            const sorted = [...conversationStore.entries()]
                .sort((a, b) => a[1].lastActivity - b[1].lastActivity);
            const toRemove = sorted.slice(0, conversationStore.size - MAX_CONVERSATIONS);
            for (const [id] of toRemove) {
                conversationStore.delete(id);
            }
            console.warn(`[Infer] conversationStore capped at ${MAX_CONVERSATIONS}, evicted ${toRemove.length} oldest`);
        }

        // Also purge expired cache entries
        inferCache.purgeExpired();
    }, CLEANUP_INTERVAL);
}

// =============================================
// CRM System Prompts (Language-Aware)
// =============================================
const SYSTEM_PROMPTS = {
    tr: `Sen Callception'ın AI resepsiyonistisin. Adın Ayşe.

DİL KURALI (KESİNLİKLE UYULMALI):
- SADECE Türkçe yanıt ver. Başka hiçbir dilde (İngilizce, Çince, Arapça vb.) kelime veya karakter KULLANMA.
- Tüm yanıtların Türkçe olmalı. Latin alfabesi dışında karakter kullanma.
- Bu kural istisnasız her yanıt için geçerlidir.

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
- Yanıtta emoji, özel karakter veya Latince olmayan harf KULLANMA

YANIT FORMATI:
Her yanıtının sonuna aşağıdaki intent etiketini ekle (tek satırda):
[INTENT:appointment|complaint|info_request|cancellation|greeting|unknown CONFIDENCE:0.0-1.0]

Örnek:
"Merhaba! Callception'a hos geldiniz, ben Ayse. Size nasil yardimci olabilirim? [INTENT:greeting CONFIDENCE:0.95]"
"Randevunuzu aldim. Hangi gun ve saat uygun olur? [INTENT:appointment CONFIDENCE:0.9]"`,

    en: `You are Callception's AI receptionist. Your name is Ayse.

LANGUAGE RULE (MUST BE FOLLOWED STRICTLY):
- ONLY respond in English. Do NOT use any other language (Turkish, Chinese, Arabic, etc.).
- All your responses must be in English using the Latin alphabet only.
- This rule applies to every single response without exception.

TASKS:
1. Greet customers warmly and professionally
2. Take appointment requests (ask for date, time, subject)
3. Listen to complaints, ask for details, suggest solutions
4. Answer information requests
5. Handle cancellation/change requests

RULES:
- Always give short and concise responses (maximum 2 sentences)
- Be natural and friendly, do not sound robotic
- Show that you understand what the customer is saying
- Do not forget to ask for necessary information (name, date, details, etc.)
- Follow the conversation, remember previous messages
- Do NOT use emojis, special characters, or non-Latin characters in your response

RESPONSE FORMAT:
Add the following intent tag at the end of each response (on a single line):
[INTENT:appointment|complaint|info_request|cancellation|greeting|unknown CONFIDENCE:0.0-1.0]

Examples:
"Hello! Welcome to Callception, I'm Ayse. How can I help you today? [INTENT:greeting CONFIDENCE:0.95]"
"I've noted your appointment request. What day and time works best for you? [INTENT:appointment CONFIDENCE:0.9]"`,
} as const;

function getSystemPrompt(language: string): string {
    return SYSTEM_PROMPTS[language === 'en' ? 'en' : 'tr'];
}

// =============================================
// Output Language Sanitizer
// Removes non-Latin characters that cause TTS artifacts
// =============================================
function sanitizeResponseText(text: string): string {
    // Remove CJK characters (Chinese/Japanese/Korean) — these cause garbled TTS
    // Unicode ranges: CJK Unified Ideographs, Hiragana, Katakana, Hangul
    let cleaned = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u3400-\u4dbf]/g, '');

    // Remove Arabic/Hebrew script
    cleaned = cleaned.replace(/[\u0600-\u06ff\u0590-\u05ff]/g, '');

    // Remove Cyrillic script
    cleaned = cleaned.replace(/[\u0400-\u04ff]/g, '');

    // Collapse multiple spaces from removed characters
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    return cleaned;
}

// =============================================
// Intent Parser
// =============================================
function parseIntentFromResponse(text: string): {
    cleanText: string;
    intent: string;
    confidence: number;
} {
    // First, sanitize any non-Latin characters that cause TTS artifacts
    const sanitized = sanitizeResponseText(text);

    const intentMatch = sanitized.match(/\[INTENT:(\w+)\s+CONFIDENCE:([\d.]+)\]/);

    if (intentMatch) {
        return {
            cleanText: sanitized.replace(/\s*\[INTENT:\w+\s+CONFIDENCE:[\d.]+\]/, '').trim(),
            intent: intentMatch[1],
            confidence: parseFloat(intentMatch[2]),
        };
    }

    // Fallback: basic keyword intent detection (supports both TR and EN)
    const lower = sanitized.toLowerCase();
    let intent = 'unknown';
    let confidence = 0.5;

    if (/randevu|tarih|saat|görüşme|appointment|schedule|book|meeting/.test(lower)) {
        intent = 'appointment';
        confidence = 0.7;
    } else if (/şikayet|sorun|problem|memnun|complaint|issue|unhappy/.test(lower)) {
        intent = 'complaint';
        confidence = 0.7;
    } else if (/bilgi|fiyat|nasıl|nedir|info|price|how|what|cost/.test(lower)) {
        intent = 'info_request';
        confidence = 0.6;
    } else if (/merhaba|selam|iyi günler|hoş geldiniz|hello|hi|hey|good morning/.test(lower)) {
        intent = 'greeting';
        confidence = 0.9;
    } else if (/iptal|değişiklik|vazgeç|cancel|change|modify/.test(lower)) {
        intent = 'cancellation';
        confidence = 0.7;
    }

    return { cleanText: sanitized.trim(), intent, confidence };
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
        return data.choices?.[0]?.message?.content || '';
    });
}

// =============================================
// Fallback: Call Personaplex GPU server
// Supports two modes:
//   1. RunPod Serverless (RUNPOD_ENDPOINT_ID set) → run/poll pattern
//   2. Direct HTTP (PERSONAPLEX_URL) → standard REST call
// Both wrapped with Circuit Breaker + GPU Manager
// =============================================
async function callPersonaplex(
    text: string,
    persona: string,
    language: string,
    sessionId?: string,
): Promise<{ intent?: string; confidence?: number; response_text?: string; [key: string]: unknown }> {
    return gpuCircuitBreaker.execute(async () => {
        // Strategy 1: RunPod Serverless (preferred for production)
        if (gpuManager.isServerlessConfigured()) {
            const result = await gpuManager.runServerlessInference({
                text,
                persona,
                language,
                session_id: sessionId,
            });

            if (result) return result;
            throw new Error('RunPod Serverless inference returned null');
        }

        // Strategy 2: Direct HTTP to Personaplex server
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
            signal: AbortSignal.timeout(15000),
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

    // ---- Rate Limit Check ----
    const rateLimit = checkRateLimit(request, RATE_LIMITS.inference);
    if (!rateLimit.allowed) {
        return rateLimitExceeded(rateLimit.resetTime);
    }

    try {
        // Resolve tenant for metering (from auth header, then session registry)
        const authTenantId = request.headers.get('x-user-tenant') || '';

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
            const isEnglish = language === 'en';

            // Get mock session for multi-turn tracking
            let mockSession = conversationStore.get(sessionId);
            if (!mockSession) {
                mockSession = { messages: [], lastActivity: Date.now(), turnCount: 0, language };
                conversationStore.set(sessionId, mockSession);
            }
            mockSession.turnCount++;
            mockSession.lastActivity = Date.now();

            let intent = 'unknown';
            let response_text = '';
            let confidence = 0.95;

            if (isEnglish) {
                // English mock responses
                if (/hello|hi|hey|good morning|good afternoon/.test(lowerText)) {
                    intent = 'greeting';
                    response_text = 'Hello! Welcome to Callception, I\'m Ayse. How can I help you today?';
                } else if (/appointment|schedule|book|meeting|date|time/.test(lowerText)) {
                    intent = 'appointment';
                    if (mockSession.turnCount <= 2) {
                        response_text = 'Sure, I can schedule an appointment. What day and time works best for you?';
                    } else {
                        response_text = 'Your appointment has been booked. You\'ll receive a confirmation shortly. Is there anything else I can help with?';
                    }
                } else if (/complaint|issue|problem|unhappy|dissatisfied/.test(lowerText)) {
                    intent = 'complaint';
                    if (mockSession.turnCount <= 2) {
                        response_text = 'I\'m sorry to hear about your issue. Could you please share the details? Your name and what the problem is?';
                    } else {
                        response_text = 'I\'ve recorded your complaint. We\'ll follow up with you shortly. Is there anything else I can assist with?';
                    }
                } else if (/info|price|how|what|cost/.test(lowerText)) {
                    intent = 'info_request';
                    response_text = 'I\'d be happy to help. Which of our services would you like to learn more about?';
                } else if (/cancel|change|modify/.test(lowerText)) {
                    intent = 'cancellation';
                    response_text = 'I\'ll process your cancellation request. Could you please provide your appointment number or name?';
                } else if (/thank|thanks|appreciate/.test(lowerText)) {
                    intent = 'thanks';
                    response_text = 'You\'re welcome! Is there anything else I can help you with?';
                } else if (/bye|goodbye|see you|take care/.test(lowerText)) {
                    intent = 'farewell';
                    response_text = 'Have a great day! Don\'t hesitate to call again.';
                } else {
                    confidence = 0.6;
                    const responses = [
                        'I understand. How can I help you with that?',
                        'Could you give me more details? I want to assist you in the best way possible.',
                        'Noted. Is there anything else you\'d like to add?',
                    ];
                    response_text = responses[mockSession.turnCount % responses.length];
                }
            } else {
                // Turkish mock responses (original)
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
                    confidence = 0.6;
                    const responses = [
                        'Anlıyorum. Bu konuda size nasıl yardımcı olabilirim?',
                        'Daha detaylı açıklar mısınız? Size en iyi şekilde yardımcı olmak istiyorum.',
                        'Tabii, bu konuyu not aldım. Başka eklemek istediğiniz bir şey var mı?',
                    ];
                    response_text = responses[mockSession.turnCount % responses.length];
                }
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
        // Handles language switching: if user changes language mid-session, reset the session
        const getSession = () => {
            let session = conversationStore.get(sessionId);
            if (!session) {
                session = {
                    messages: [{ role: 'system', content: getSystemPrompt(language) }],
                    lastActivity: Date.now(),
                    turnCount: 0,
                    language,
                };
                conversationStore.set(sessionId, session);
            } else if (session.language !== language) {
                // Language switched — reset session with new system prompt
                session.messages = [{ role: 'system', content: getSystemPrompt(language) }];
                session.language = language;
                session.turnCount = 0;
                session.lastActivity = Date.now();
            }
            return session;
        };

        const addUserMessage = (session: { messages: ConversationEntry[]; lastActivity: number; turnCount: number; language: string }) => {
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

        // ---- 0. Enterprise GPU Pod (RunPod, on-demand) ----
        const inferTenantId = authTenantId || sessionRegistry.getTenant(sessionId) || 'default';
        const isEnterprise = gpuManager.isPodConfigured() && await isEnterpriseTenant(inferTenantId);

        if (isEnterprise && !gpuCircuitBreaker.isOpen()) {
            try {
                const podResult = await gpuCircuitBreaker.execute(async () => {
                    // Ensure pod is running
                    const ready = await gpuManager.ensureReady();
                    if (!ready) throw new Error('GPU Pod not ready');

                    const result = await gpuManager.runPodInference({
                        text,
                        persona,
                        language,
                        session_id: sessionId,
                    });
                    if (!result) throw new Error('GPU Pod inference returned null');
                    return result;
                });

                const latencyMs = performance.now() - startMs;
                const result = {
                    session_id: sessionId,
                    intent: podResult.intent || 'unknown',
                    confidence: podResult.confidence || 0.8,
                    response_text: podResult.response_text,
                    latency_ms: latencyMs,
                    source: 'personaplex-gpu-pod',
                };

                inferCache.set(cacheKey, { ...result, cached: true } as CachedInferResponse);

                // Track GPU activity for auto-shutdown cron
                updateLastGpuActivity(inferTenantId).catch(() => {});

                if (inferTenantId !== 'default') {
                    metricsLogger.logLlmMetric(inferTenantId, result.latency_ms, 'gpu-pod', sessionId, result.intent, false);
                }

                return NextResponse.json(result);
            } catch {
                // GPU Pod failed — fall through to Groq
            }
        }

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

                // Fire-and-forget: Log LLM metric
                const inferTenantId = authTenantId || sessionRegistry.getTenant(sessionId) || 'default';
                if (inferTenantId !== 'default') {
                    metricsLogger.logLlmMetric(inferTenantId, result.latency_ms, 'groq-llama', sessionId, intent, false);
                }

                return NextResponse.json(result);
            } catch {
                // Fall through to OpenAI
            }
        }

        // ---- 2. Google Gemini — DEVRE DIŞI ----
        // ⚠️ 2024-03-06 test: HTTP 429 (kota aşıldı), güvenilmez
        // Gemini aktif olduğunda pipeline'a gereksiz latency ekliyor
        // ve circuit breaker açılana kadar her çağrıda 429 dönüyor.
        // Kota sorunu çözülürse tekrar aktif edilebilir.
        // if (isGeminiConfigured() && !geminiCircuitBreaker.isOpen()) { ... }

        // ---- 3. OpenAI GPT-4o-mini — paid, secondary ----
        if (OPENAI_API_KEY && !openaiCircuitBreaker.isOpen()) {
            try {
                const session = getSession();
                addUserMessage(session);

                const rawResponse = await callOpenAI(session.messages);
                const { cleanText, intent, confidence } = parseIntentFromResponse(rawResponse);
                session.messages.push({ role: 'assistant', content: cleanText });

                const result = buildResult(cleanText, intent, confidence, 'openai-gpt', session.turnCount);
                inferCache.set(cacheKey, { ...result, cached: true } as CachedInferResponse);

                // Fire-and-forget: Log LLM metric
                const inferTenantId2 = authTenantId || sessionRegistry.getTenant(sessionId) || 'default';
                if (inferTenantId2 !== 'default') {
                    metricsLogger.logLlmMetric(inferTenantId2, result.latency_ms, 'openai-gpt', sessionId, intent, false);
                }

                return NextResponse.json(result);
            } catch {
                // Fall through to Personaplex
            }
        }

        // ---- 3b. Personaplex keyword-based (GPU) ----
        if (!gpuCircuitBreaker.isOpen()) {
            try {
                const data = await callPersonaplex(text, persona, language, sessionId);
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
            groq: { configured: isGroqConfigured(), role: 'primary (free, 601ms)' },
            openai: { configured: !!OPENAI_API_KEY, role: 'secondary (paid, 1157ms)' },
            gemini: { configured: isGeminiConfigured(), role: 'DISABLED — quota exceeded (HTTP 429)' },
            personaplex: {
                configured: gpuManager.isPodConfigured() || gpuManager.isServerlessConfigured() || !!PERSONAPLEX_URL,
                mode: gpuManager.isPodConfigured() ? 'runpod-pod' : gpuManager.isServerlessConfigured() ? 'runpod-serverless' : 'direct-http',
                role: gpuManager.isPodConfigured() ? 'enterprise-priority (GPU pod)' : 'tertiary (GPU)',
            },
        },
        gpu: gpuManager.getStatus(),
    });
}
