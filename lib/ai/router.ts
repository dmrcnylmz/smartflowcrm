// AI Intent Router
// Keyword-based detection with LLM fallback

const INTENT_KEYWORDS: Record<string, string[]> = {
  randevu: ['randevu', 'appointment', 'tarih', 'saat', 'görüşme', 'buluşma'],
  sikayet: ['şikayet', 'complaint', 'sorun', 'problem', 'memnun değil', 'kötü'],
  bilgi: ['bilgi', 'info', 'nedir', 'nasıl', 'ne zaman', 'soru', 'öğrenmek'],
  iptal: ['iptal', 'cancel', 'vazgeç'],
};

export interface IntentResult {
  intent: string;
  confidence: number;
  summary: string;
}

export async function detectIntent(text: string): Promise<IntentResult> {
  const lowerText = text.toLowerCase();

  // Keyword-based detection
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          intent,
          confidence: 0.85,
          summary: `Detected "${intent}" intent from keyword: ${keyword}`,
        };
      }
    }
  }

  // Fallback: No intent detected
  return {
    intent: 'unknown',
    confidence: 0.3,
    summary: 'No clear intent detected',
  };
}

// LLM-based intent detection (optional, requires Ollama or OpenAI)
export async function detectIntentWithLLM(text: string): Promise<IntentResult> {
  try {
    // Check if we have an LLM provider configured
    const provider = process.env.LLM_PROVIDER || 'none';
    
    if (provider === 'none') {
      // Fallback to keyword detection
      return await detectIntent(text);
    }

    // TODO: Implement LLM-based detection
    // For now, fallback to keyword detection
    return await detectIntent(text);
  } catch (error) {
    console.error('LLM intent detection error:', error);
    return await detectIntent(text);
  }
}

// Main routing function (alias for compatibility)
export async function routeIntent(
  text: string,
  useLLM: boolean = false,
  provider: string = 'local'
): Promise<IntentResult> {
  if (useLLM) {
    return await detectIntentWithLLM(text);
  }
  return await detectIntent(text);
}

