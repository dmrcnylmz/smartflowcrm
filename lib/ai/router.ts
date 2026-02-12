// AI Intent Router
// Keyword-based detection with LLM fallback (Ollama)

import { detectIntentWithOllama, isOllamaAvailable } from './ollama';

const INTENT_KEYWORDS: Record<string, string[]> = {
  randevu: ['randevu', 'appointment', 'tarih', 'saat', 'görüşme', 'buluşma', 'rezervasyon'],
  sikayet: ['şikayet', 'complaint', 'sorun', 'problem', 'memnun değil', 'kötü', 'berbat', 'rezalet'],
  bilgi: ['bilgi', 'info', 'nedir', 'nasıl', 'ne zaman', 'soru', 'öğrenmek', 'fiyat', 'ücret'],
  iptal: ['iptal', 'cancel', 'vazgeç', 'istemiyorum'],
};

export interface IntentResult {
  intent: string;
  confidence: number;
  summary: string;
  method: 'keyword' | 'llm';
}

// Keyword-based intent detection
export async function detectIntent(text: string): Promise<IntentResult> {
  const lowerText = text.toLowerCase();

  // Keyword-based detection
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          intent,
          confidence: 0.85,
          summary: `Keyword ile tespit edildi: "${keyword}"`,
          method: 'keyword',
        };
      }
    }
  }

  // Fallback: No intent detected
  return {
    intent: 'unknown',
    confidence: 0.3,
    summary: 'Belirsiz intent',
    method: 'keyword',
  };
}

// LLM-based intent detection with Ollama
export async function detectIntentWithLLM(
  text: string,
  model: string = 'llama3'
): Promise<IntentResult> {
  try {
    // Check if Ollama is available
    const ollamaAvailable = await isOllamaAvailable();

    if (!ollamaAvailable) {
      console.log('Ollama not available, falling back to keyword detection');
      return await detectIntent(text);
    }

    // Use Ollama for intent detection
    const result = await detectIntentWithOllama(text, model);

    return {
      intent: result.intent,
      confidence: result.confidence,
      summary: result.summary,
      method: 'llm',
    };
  } catch (error) {
    console.error('LLM intent detection error:', error);
    // Fallback to keyword detection on error
    return await detectIntent(text);
  }
}

// Main routing function
export async function routeIntent(
  text: string,
  useLLM: boolean = false,
  provider: string = 'ollama'
): Promise<IntentResult> {
  if (useLLM && provider === 'ollama') {
    return await detectIntentWithLLM(text);
  }
  return await detectIntent(text);
}

// Export for backward compatibility
export { isOllamaAvailable } from './ollama';
