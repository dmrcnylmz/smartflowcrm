/**
 * Groq API Client — Free LLM Fallback
 *
 * Model: llama-3.3-70b-versatile (free tier: 30 req/min)
 * OpenAI-compatible API format
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface GroqOptions {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

/**
 * Generate a response using Groq's LLM API.
 * Uses OpenAI-compatible endpoint format.
 */
export async function generateGroqResponse(
    messages: ChatMessage[],
    options: GroqOptions = {},
): Promise<string> {
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY not configured');
    }

    const {
        maxTokens = 150,
        temperature = 0.3,
        timeoutMs = 8000,
    } = options;

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

export function isGroqConfigured(): boolean {
    return !!GROQ_API_KEY;
}

/**
 * Groq SSE token akışı — streaming TTS pipeline için.
 * Her token yield edilir; tamamlandığında veya hata oluşunca generator biter.
 * Başarısız olursa hata fırlatır (caller try/catch içinde çağırmalı).
 */
export async function* streamGroqResponse(
    messages: ChatMessage[],
    options: GroqOptions = {},
): AsyncGenerator<string> {
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY not configured');
    }

    const { maxTokens = 150, temperature = 0.3, timeoutMs = 10000 } = options;

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: true,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok || !response.body) {
        const err = await response.text().catch(() => '');
        throw new Error(`Groq stream error ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || ''; // tamamlanmamış son satırı sakla

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const raw = trimmed.slice(5).trim();
                if (raw === '[DONE]') return;
                try {
                    const chunk = JSON.parse(raw);
                    const token = chunk.choices?.[0]?.delta?.content;
                    if (token) yield token as string;
                } catch { /* malformed SSE chunk — yoksay */ }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
