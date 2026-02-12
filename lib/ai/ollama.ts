// Ollama Client for Local LLM Integration
// Supports: llama3, mistral, gemma, etc.

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export interface OllamaConfig {
    model: string;
    baseUrl?: string;
}

export interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OllamaResponse {
    model: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
}

export interface OllamaGenerateResponse {
    response: string;
    done: boolean;
}

// Check if Ollama is available
export async function isOllamaAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

// Get available models
export async function getAvailableModels(): Promise<string[]> {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!response.ok) return [];

        const data = await response.json();
        return data.models?.map((m: { name: string }) => m.name) || [];
    } catch {
        return [];
    }
}

// Generate completion with Ollama
export async function generateCompletion(
    prompt: string,
    config: OllamaConfig = { model: 'llama3' }
): Promise<string> {
    const { model, baseUrl = OLLAMA_BASE_URL } = config;

    try {
        const response = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false,
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
        }

        const data: OllamaGenerateResponse = await response.json();
        return data.response || '';
    } catch (error) {
        console.error('Ollama generate error:', error);
        throw error;
    }
}

// Chat completion with Ollama
export async function chatCompletion(
    messages: OllamaChatMessage[],
    config: OllamaConfig = { model: 'llama3' }
): Promise<string> {
    const { model, baseUrl = OLLAMA_BASE_URL } = config;

    try {
        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
        }

        const data: OllamaResponse = await response.json();
        return data.message?.content || '';
    } catch (error) {
        console.error('Ollama chat error:', error);
        throw error;
    }
}

// Intent detection prompt
const INTENT_SYSTEM_PROMPT = `Sen bir Türkçe müşteri hizmetleri asistanısın. Müşteri mesajlarını analiz edip intent (niyet) belirliyorsun.

Mümkün intentler:
- randevu: Randevu almak, değiştirmek veya iptal etmek istiyor
- sikayet: Şikayet, problem veya memnuniyetsizlik bildiriyor
- bilgi: Bilgi almak, soru sormak istiyor  
- iptal: Bir şeyi iptal etmek istiyor
- unknown: Belirsiz veya diğer

SADECE şu formatta JSON yanıtı ver:
{"intent": "intent_adi", "confidence": 0.0-1.0, "summary": "kısa açıklama"}`;

// Detect intent using Ollama
export async function detectIntentWithOllama(
    text: string,
    model: string = 'llama3'
): Promise<{ intent: string; confidence: number; summary: string }> {
    try {
        const available = await isOllamaAvailable();
        if (!available) {
            throw new Error('Ollama is not available');
        }

        const response = await chatCompletion(
            [
                { role: 'system', content: INTENT_SYSTEM_PROMPT },
                { role: 'user', content: text },
            ],
            { model }
        );

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                intent: parsed.intent || 'unknown',
                confidence: parsed.confidence || 0.5,
                summary: parsed.summary || 'LLM tarafından belirlendi',
            };
        }

        return {
            intent: 'unknown',
            confidence: 0.3,
            summary: 'Could not parse LLM response',
        };
    } catch (error) {
        console.error('Ollama intent detection error:', error);
        throw error;
    }
}

// RAG search prompt
export async function ragSearchWithOllama(
    query: string,
    context: string[],
    model: string = 'llama3'
): Promise<string> {
    const contextText = context.slice(0, 5).join('\n\n---\n\n');

    const prompt = `Aşağıdaki belgeler kullanarak soruyu yanıtla.

Belgeler:
${contextText}

Soru: ${query}

Yanıt (Türkçe, kısa ve öz):`;

    try {
        return await generateCompletion(prompt, { model });
    } catch (error) {
        console.error('RAG search error:', error);
        return 'Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.';
    }
}
