/**
 * Personaplex Intent Detection
 * Uses the Personaplex RunPod-based voice AI for intent classification.
 */

const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || '';
const PERSONAPLEX_CONTEXT_URL = process.env.PERSONAPLEX_CONTEXT_URL || '';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';

export interface PersonaplexIntentResult {
  intent: string;
  confidence: number;
  entities?: Record<string, string>;
  language?: string;
}

/**
 * Check if Personaplex service is available.
 */
export async function isPersonaplexAvailable(): Promise<boolean> {
  if (!PERSONAPLEX_URL) return false;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${PERSONAPLEX_URL}/health`, {
      signal: controller.signal,
      headers: PERSONAPLEX_API_KEY ? { 'Authorization': `Bearer ${PERSONAPLEX_API_KEY}` } : {},
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Detect intent using Personaplex.
 */
export async function detectIntentWithPersonaplex(
  text: string
): Promise<PersonaplexIntentResult> {
  if (!PERSONAPLEX_URL) {
    return { intent: 'unknown', confidence: 0 };
  }
  
  try {
    const response = await fetch(`${PERSONAPLEX_CONTEXT_URL}/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PERSONAPLEX_API_KEY ? { 'Authorization': `Bearer ${PERSONAPLEX_API_KEY}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      return { intent: 'unknown', confidence: 0 };
    }
    
    const data = await response.json();
    return {
      intent: data.intent || 'unknown',
      confidence: data.confidence || 0,
      entities: data.entities,
      language: data.language,
    };
  } catch (error) {
    console.error('[Personaplex] Intent detection failed:', error);
    return { intent: 'unknown', confidence: 0 };
  }
}
