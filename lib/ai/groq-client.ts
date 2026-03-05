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
