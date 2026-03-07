/**
 * LLM Fallback Chain — Shared inference pipeline
 *
 * Order: Groq (free) → Gemini (free) → OpenAI (paid) → Graceful fallback
 * Cost-optimized: free providers first, paid as last resort.
 * Each provider wrapped with circuit breaker protection.
 * Used by both /api/voice/infer and /api/twilio/gather.
 */

import { openaiCircuitBreaker, groqCircuitBreaker, geminiCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { generateGroqResponse, isGroqConfigured } from '@/lib/ai/groq-client';
import { generateGeminiResponse, isGeminiConfigured } from '@/lib/ai/gemini-client';
import { initLLMCircuitAlerts } from '@/lib/ai/llm-circuit-alerts';

// Wire circuit breaker state changes to Slack/Telegram alerts (idempotent)
initLLMCircuitAlerts();

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface FallbackOptions {
    maxTokens?: number;
    temperature?: number;
    language?: string;
}

interface FallbackResult {
    text: string;
    source: 'openai-gpt' | 'groq-llama' | 'gemini-flash' | 'graceful-fallback';
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/**
 * Try all LLM providers in order with circuit breaker protection.
 * Returns the first successful response.
 * Priority: Groq (free, fast) → Gemini (free) → OpenAI (paid, last resort)
 */
export async function generateWithFallback(
    messages: ChatMessage[],
    options: FallbackOptions = {},
): Promise<FallbackResult> {
    const { maxTokens = 150, temperature = 0.3, language = 'tr' } = options;

    // 1. Groq — free, ultra-fast (llama-3.3-70b)
    if (isGroqConfigured() && !groqCircuitBreaker.isOpen()) {
        try {
            const text = await groqCircuitBreaker.execute(() =>
                generateGroqResponse(messages, { maxTokens, temperature }),
            );

            if (text) return { text, source: 'groq-llama' };
        } catch {
            // Fall through to Gemini
        }
    }

    // 2. Google Gemini — free (Gemini 2.0 Flash)
    if (isGeminiConfigured() && !geminiCircuitBreaker.isOpen()) {
        try {
            const text = await geminiCircuitBreaker.execute(() =>
                generateGeminiResponse(messages, { maxTokens, temperature }),
            );

            if (text) return { text, source: 'gemini-flash' };
        } catch {
            // Fall through to OpenAI
        }
    }

    // 3. OpenAI GPT-4o-mini — paid, last resort
    if (OPENAI_API_KEY && !openaiCircuitBreaker.isOpen()) {
        try {
            const text = await openaiCircuitBreaker.execute(async () => {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages,
                        max_tokens: maxTokens,
                        temperature,
                    }),
                    signal: AbortSignal.timeout(8000),
                });

                if (!response.ok) {
                    throw new Error(`OpenAI ${response.status}`);
                }

                const data = await response.json();
                return data.choices?.[0]?.message?.content?.trim() || '';
            });

            if (text) return { text, source: 'openai-gpt' };
        } catch {
            // Fall through to graceful fallback
        }
    }

    // 4. Graceful fallback (no LLM available)
    const isEnglish = language === 'en';
    return {
        text: isEnglish
            ? 'I apologize, we are experiencing a brief technical issue. Please try again in a moment, or I can connect you with a human agent.'
            : 'Özür dilerim, kısa bir teknik sorun yaşıyoruz. Lütfen bir dakika sonra tekrar deneyin veya sizi bir müşteri temsilcisine bağlayabilirim.',
        source: 'graceful-fallback',
    };
}

/**
 * Get the status of all configured LLM providers.
 */
export function getLLMProviderStatus(): Record<string, { configured: boolean; circuitState: string }> {
    return {
        openai: {
            configured: !!OPENAI_API_KEY,
            circuitState: openaiCircuitBreaker.getState(),
        },
        groq: {
            configured: isGroqConfigured(),
            circuitState: groqCircuitBreaker.getState(),
        },
        gemini: {
            configured: isGeminiConfigured(),
            circuitState: geminiCircuitBreaker.getState(),
        },
    };
}
