// Personaplex Intent Integration
// Analyzes voice transcripts for intent detection

import { detectIntent, detectIntentWithLLM, type IntentResult } from './router';

export interface VoiceMetadata {
    sessionId: string;
    persona: string;
    duration: number;
    turnCount: number;
    avgLatency?: number;
}

export interface VoiceIntentResult extends IntentResult {
    voiceMetadata?: VoiceMetadata;
    fullTranscript: string;
    keyPhrases: string[];
}

/**
 * Extract key phrases from transcript for better intent detection
 */
function extractKeyPhrases(transcript: string): string[] {
    const phrases: string[] = [];

    // Common intent indicators in Turkish
    const patterns = [
        /randevu\s+\w+/gi,
        /iptal\s+\w+/gi,
        /şikayet\s+\w+/gi,
        /problem\s+\w+/gi,
        /bilgi\s+\w+/gi,
        /yardım\s+\w+/gi,
        /fiyat\s+\w+/gi,
        /ücret\s+\w+/gi,
    ];

    for (const pattern of patterns) {
        const matches = transcript.match(pattern);
        if (matches) {
            phrases.push(...matches);
        }
    }

    return [...new Set(phrases)]; // Remove duplicates
}

/**
 * Analyze voice transcript and detect intent
 */
export async function analyzeVoiceTranscript(
    transcript: string,
    metadata?: VoiceMetadata,
    useLLM: boolean = false
): Promise<VoiceIntentResult> {
    // Clean transcript - remove speaker labels if present
    const cleanTranscript = transcript
        .replace(/^(user|assistant|müşteri|asistan):\s*/gmi, '')
        .trim();

    // Extract key phrases
    const keyPhrases = extractKeyPhrases(cleanTranscript);

    // Detect intent
    let intentResult: IntentResult;

    if (useLLM) {
        intentResult = await detectIntentWithLLM(cleanTranscript);
    } else {
        intentResult = await detectIntent(cleanTranscript);
    }

    return {
        ...intentResult,
        voiceMetadata: metadata,
        fullTranscript: transcript,
        keyPhrases,
    };
}

/**
 * Summarize a voice conversation transcript
 */
export function summarizeConversation(
    transcript: string,
    intent: string
): string {
    const lines = transcript.split('\n').filter(l => l.trim());
    const turnCount = lines.length;

    // Create a brief summary based on intent
    const intentSummaries: Record<string, string> = {
        randevu: 'Randevu talebi görüşmesi',
        sikayet: 'Şikayet bildirimi görüşmesi',
        bilgi: 'Bilgi talebi görüşmesi',
        iptal: 'İptal talebi görüşmesi',
        unknown: 'Genel görüşme',
    };

    const baseDescription = intentSummaries[intent] || intentSummaries.unknown;

    return `${baseDescription}. ${turnCount} konuşma dönüşü.`;
}

/**
 * Process and save voice call result to Firestore
 */
export async function processVoiceCallResult(
    sessionId: string,
    transcript: string,
    metadata: VoiceMetadata,
    customerId?: string
): Promise<{
    intent: VoiceIntentResult;
    summary: string;
}> {
    // Analyze transcript
    const intent = await analyzeVoiceTranscript(transcript, metadata, true);

    // Generate summary
    const summary = summarizeConversation(transcript, intent.intent);

    return {
        intent,
        summary,
    };
}
