/**
 * AI Intent Router
 * Routes detected intents to appropriate handlers.
 */

import { detectIntentFast, type IntentResult, type IntentCategory } from './intent-fast';

export interface RouteResult {
  intent: IntentCategory;
  handler: 'shortcut' | 'rag' | 'llm' | 'escalation' | 'fallback';
  confidence: string;
  context?: Record<string, unknown>;
}

/**
 * Detect intent (wrapper around fast detection).
 */
export function detectIntent(text: string): IntentResult {
  return detectIntentFast(text);
}

/**
 * Detect intent with LLM fallback when fast detection returns low confidence.
 */
export async function detectIntentWithLLM(
  text: string,
  _options?: { model?: string }
): Promise<IntentResult> {
  const fastResult = detectIntentFast(text);
  
  // If fast detection has high confidence, use it
  if (fastResult.confidence === 'high') {
    return fastResult;
  }
  
  // For now, return fast result even for low confidence
  // LLM-based detection can be added when OpenAI is configured
  return fastResult;
}

/**
 * Route an intent to the appropriate handler.
 */
export function routeIntent(intentResult: IntentResult): RouteResult {
  const { intent, confidence } = intentResult;
  
  // High-confidence simple intents -> shortcut response
  const shortcutIntents: IntentCategory[] = ['greeting', 'farewell', 'thanks', 'escalation'];
  if (confidence === 'high' && shortcutIntents.includes(intent)) {
    return {
      intent,
      handler: intent === 'escalation' ? 'escalation' : 'shortcut',
      confidence,
    };
  }
  
  // Business intents -> RAG + LLM
  const ragIntents: IntentCategory[] = ['appointment', 'complaint', 'pricing', 'info', 'cancellation'];
  if (ragIntents.includes(intent)) {
    return {
      intent,
      handler: 'rag',
      confidence,
    };
  }
  
  // Unknown or low confidence -> LLM
  if (intent === 'unknown' || confidence === 'low') {
    return {
      intent,
      handler: 'llm',
      confidence,
    };
  }
  
  return {
    intent,
    handler: 'fallback',
    confidence,
  };
}
