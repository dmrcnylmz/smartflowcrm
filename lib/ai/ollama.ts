/**
 * Ollama Local LLM Integration
 * Fallback provider when OpenAI is unavailable.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Check if Ollama is running and accessible.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of available Ollama models.
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

/**
 * Detect intent using local Ollama model.
 */
export async function detectIntentWithOllama(
  text: string,
  model: string = 'llama3.2'
): Promise<{ intent: string; confidence: number }> {
  try {
    const available = await isOllamaAvailable();
    if (!available) {
      return { intent: 'unknown', confidence: 0 };
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `Classify the intent of this customer message into one of: appointment, complaint, pricing, info, cancellation, greeting, farewell, escalation, thanks, unknown.\n\nMessage: "${text}"\n\nRespond with JSON only: {"intent": "...", "confidence": 0.0-1.0}`,
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) return { intent: 'unknown', confidence: 0 };
    
    const data = await response.json();
    try {
      const parsed = JSON.parse(data.response);
      return {
        intent: parsed.intent || 'unknown',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      return { intent: 'unknown', confidence: 0 };
    }
  } catch {
    return { intent: 'unknown', confidence: 0 };
  }
}

/**
 * Generate a response using Ollama (fallback for OpenAI).
 */
export async function generateWithOllama(
  prompt: string,
  systemPrompt?: string,
  model: string = 'llama3.2'
): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: systemPrompt || 'You are a helpful customer service assistant.',
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    return data.response || '';
  } catch (error) {
    console.error('[Ollama] Generation failed:', error);
    throw error;
  }
}
