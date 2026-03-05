/**
 * Google Gemini API Client — Free LLM Fallback
 *
 * Model: gemini-2.0-flash (free tier: 15 RPM, 1M TPD)
 * Uses Google AI Studio REST API (not Vertex AI)
 */

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface GeminiOptions {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

/**
 * Generate a response using Google Gemini API.
 * Converts OpenAI-style messages to Gemini format.
 */
export async function generateGeminiResponse(
    messages: ChatMessage[],
    options: GeminiOptions = {},
): Promise<string> {
    if (!GOOGLE_AI_API_KEY) {
        throw new Error('GOOGLE_AI_API_KEY not configured');
    }

    const {
        maxTokens = 150,
        temperature = 0.3,
        timeoutMs = 10000,
    } = options;

    // Convert OpenAI messages to Gemini format
    const systemInstruction = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n');

    const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

    // Gemini requires at least one user message
    if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: '.' }] });
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${GOOGLE_AI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
            contents,
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature,
            },
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

export function isGeminiConfigured(): boolean {
    return !!GOOGLE_AI_API_KEY;
}
