// Voice Infer API — OpenAI GPT-Powered Intelligent Conversation
// Replaces keyword-based responses with real AI conversation
// STT (browser) → GPT-4o-mini (here) → TTS (browser)

import { NextRequest, NextResponse } from 'next/server';

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
// OpenAI API Call
// =============================================
async function callOpenAI(
    messages: ConversationEntry[],
): Promise<string> {
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
}

// =============================================
// Fallback: Call RunPod Personaplex server
// =============================================
async function callPersonaplex(
    text: string,
    persona: string,
    language: string,
): Promise<any> {
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

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 },
            );
        }

        // Determine session ID
        const sessionId = session_id || `anon-${Date.now()}`;

        // ---- Try OpenAI First ----
        if (OPENAI_API_KEY) {
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

                // Call OpenAI
                const rawResponse = await callOpenAI(session.messages);

                // Parse intent from response
                const { cleanText, intent, confidence } = parseIntentFromResponse(rawResponse);

                // Store assistant response in memory
                session.messages.push({ role: 'assistant', content: cleanText });

                const latencyMs = performance.now() - startMs;

                console.log(
                    `[Voice Infer] GPT | session=${sessionId} turn=${session.turnCount} intent=${intent} conf=${confidence} latency=${latencyMs.toFixed(0)}ms`,
                );

                return NextResponse.json({
                    session_id: sessionId,
                    intent,
                    confidence,
                    response_text: cleanText,
                    latency_ms: latencyMs,
                    source: 'openai-gpt',
                    turn: session.turnCount,
                });
            } catch (openaiError) {
                console.error('[Voice Infer] OpenAI failed, falling back to Personaplex:', openaiError);
                // Fall through to Personaplex fallback
            }
        }

        // ---- Fallback: Personaplex keyword-based ----
        try {
            const data = await callPersonaplex(text, persona, language);
            const latencyMs = performance.now() - startMs;
            return NextResponse.json({
                ...data,
                latency_ms: latencyMs,
                source: 'personaplex-keyword',
            });
        } catch (fallbackError) {
            console.error('[Voice Infer] Both OpenAI and Personaplex failed:', fallbackError);
            return NextResponse.json(
                { error: 'All inference backends failed' },
                { status: 503 },
            );
        }
    } catch (error) {
        console.error('[Voice Infer] Request error:', error);
        return NextResponse.json(
            { error: 'Inference error', details: String(error) },
            { status: 500 },
        );
    }
}
