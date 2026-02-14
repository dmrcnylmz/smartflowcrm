/**
 * Sentiment Detection — Real-Time Caller Emotion Analysis
 *
 * Multi-signal approach:
 * 1. Keyword Analysis (positive/negative word matching)
 * 2. Punctuation Patterns (!! ?? caps usage)
 * 3. Turn Length Analysis (short frustrated replies vs engaged longer ones)
 * 4. Repeat Detection (frustration indicator)
 *
 * Score range: [-1.0, +1.0]
 *   -1.0 = Very Angry/Frustrated
 *    0.0 = Neutral
 *   +1.0 = Very Happy/Satisfied
 */

// =============================================
// Types
// =============================================

export interface SentimentResult {
    /** Overall sentiment score [-1.0, 1.0] */
    score: number;
    /** Human-readable label */
    label: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
    /** Individual signal scores for debugging */
    signals: {
        keyword: number;
        punctuation: number;
        turnLength: number;
        repetition: number;
    };
    /** Should this trigger an escalation? */
    shouldEscalate: boolean;
    /** Suggested action based on sentiment */
    suggestedAction?: string;
}

export interface ConversationContext {
    /** All turns in the conversation so far */
    turns: string[];
    /** Running average sentiment */
    averageSentiment: number;
    /** Count of consecutive negative turns */
    negativeStreak: number;
}

// =============================================
// Keyword Dictionaries (Turkish + English)
// =============================================

const POSITIVE_KEYWORDS_TR = [
    'teşekkür', 'memnun', 'harika', 'güzel', 'mükemmel', 'süper',
    'çok iyi', 'sağol', 'sevindim', 'mutlu', 'tebrik', 'bravo',
    'başarılı', 'olumlu', 'kabul', 'tamam', 'evet', 'kesinlikle',
    'memnuniyet', 'çözüm', 'yardımcı', 'anlayışlı', 'hızlı',
    'kaliteli', 'profesyonel', 'ilgili', 'nazik', 'güler yüzlü',
];

const NEGATIVE_KEYWORDS_TR = [
    'şikayet', 'sorun', 'problem', 'hata', 'yanlış', 'kötü',
    'berbat', 'rezalet', 'saçma', 'kabul edilemez', 'utanç',
    'memnun değil', 'mutsuz', 'sinirli', 'kızgın', 'öfkeli',
    'hayal kırıklığı', 'bekliyorum', 'cevap yok', 'ilgisiz',
    'lütfen artık', 'kaç kez', 'daha önce', 'hala', 'yine',
    'şikayet edeceğim', 'avukat', 'tüketici', 'mecbur',
    'zaman kaybı', 'para iadesi', 'iptal', 'vazgeçtim',
];

const POSITIVE_KEYWORDS_EN = [
    'thank', 'thanks', 'great', 'excellent', 'wonderful', 'perfect',
    'amazing', 'happy', 'satisfied', 'pleased', 'awesome', 'fantastic',
    'appreciate', 'helpful', 'resolved', 'fixed', 'working',
];

const NEGATIVE_KEYWORDS_EN = [
    'complaint', 'problem', 'issue', 'error', 'wrong', 'bad',
    'terrible', 'horrible', 'unacceptable', 'frustrated', 'angry',
    'disappointed', 'waiting', 'no response', 'again', 'still',
    'refund', 'cancel', 'lawsuit', 'lawyer', 'waste of time',
];

// =============================================
// Sentiment Analyzer
// =============================================

/**
 * Analyze sentiment of a single text input.
 */
export function analyzeSentiment(text: string): SentimentResult {
    const lower = text.toLowerCase().trim();

    // Signal 1: Keyword matching
    const keywordScore = analyzeKeywords(lower);

    // Signal 2: Punctuation patterns
    const punctuationScore = analyzePunctuation(text);

    // Signal 3: Turn length
    const turnLengthScore = analyzeTurnLength(text);

    // Signal 4: Repetition (single turn)
    const repetitionScore = analyzeRepetition(lower);

    // Weighted combination
    const score = clamp(
        keywordScore * 0.5 +
        punctuationScore * 0.15 +
        turnLengthScore * 0.15 +
        repetitionScore * 0.2,
        -1, 1,
    );

    const label = scoreToLabel(score);
    const shouldEscalate = score < -0.5;

    return {
        score: Math.round(score * 100) / 100,
        label,
        signals: {
            keyword: Math.round(keywordScore * 100) / 100,
            punctuation: Math.round(punctuationScore * 100) / 100,
            turnLength: Math.round(turnLengthScore * 100) / 100,
            repetition: Math.round(repetitionScore * 100) / 100,
        },
        shouldEscalate,
        suggestedAction: getSuggestedAction(score, label),
    };
}

/**
 * Analyze sentiment with conversation context (rolling turns).
 * More accurate as it considers conversation history.
 */
export function analyzeConversationSentiment(
    currentTurn: string,
    context: ConversationContext,
): { result: SentimentResult; updatedContext: ConversationContext } {
    const result = analyzeSentiment(currentTurn);

    // Update context
    const turns = [...context.turns, currentTurn].slice(-10); // Keep last 10 turns
    const newNegativeStreak = result.score < -0.2
        ? context.negativeStreak + 1
        : 0;

    // Calculate running average
    const alpha = 0.3; // Weight for new measurement
    const newAverage = (1 - alpha) * context.averageSentiment + alpha * result.score;

    // Override escalation if negative streak
    if (newNegativeStreak >= 3) {
        result.shouldEscalate = true;
        result.suggestedAction = 'Müşteri 3+ tur boyunca olumsuz — yöneticiye devret';
    }

    return {
        result,
        updatedContext: {
            turns,
            averageSentiment: Math.round(newAverage * 100) / 100,
            negativeStreak: newNegativeStreak,
        },
    };
}

/**
 * Create an initial conversation context.
 */
export function createConversationContext(): ConversationContext {
    return {
        turns: [],
        averageSentiment: 0,
        negativeStreak: 0,
    };
}

// =============================================
// Signal Analyzers
// =============================================

function analyzeKeywords(text: string): number {
    let positiveCount = 0;
    let negativeCount = 0;

    // Turkish keywords
    for (const kw of POSITIVE_KEYWORDS_TR) {
        if (text.includes(kw)) positiveCount++;
    }
    for (const kw of NEGATIVE_KEYWORDS_TR) {
        if (text.includes(kw)) negativeCount++;
    }

    // English keywords
    for (const kw of POSITIVE_KEYWORDS_EN) {
        if (text.includes(kw)) positiveCount++;
    }
    for (const kw of NEGATIVE_KEYWORDS_EN) {
        if (text.includes(kw)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;

    return (positiveCount - negativeCount) / total;
}

function analyzePunctuation(text: string): number {
    let score = 0;

    // Multiple exclamation marks = anger/frustration
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount >= 3) score -= 0.5;
    else if (exclamationCount >= 2) score -= 0.2;

    // Multiple question marks = confusion/frustration
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount >= 3) score -= 0.3;

    // ALL CAPS = shouting
    const words = text.split(/\s+/);
    const capsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(w));
    if (capsWords.length >= 3) score -= 0.5;
    else if (capsWords.length >= 1) score -= 0.2;

    // Emoji-like patterns
    if (/:\)|😊|👍|❤️|😀|🙏/.test(text)) score += 0.3;
    if (/:\(|😡|😤|👎|😠/.test(text)) score -= 0.3;

    return clamp(score, -1, 1);
}

function analyzeTurnLength(text: string): number {
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // Very short replies often indicate frustration
    if (wordCount <= 2) return -0.2;
    // Very long replies could be venting frustration or engaged explanation
    if (wordCount > 50) return -0.1; // Slightly negative (venting)
    // Medium length = engaged = neutral-positive
    if (wordCount >= 10 && wordCount <= 30) return 0.1;

    return 0;
}

function analyzeRepetition(text: string): number {
    const words = text.split(/\s+/).filter(w => w.length > 3);
    const wordCounts = new Map<string, number>();

    for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Count repeated words (3+ times)
    let repeatedCount = 0;
    for (const count of wordCounts.values()) {
        if (count >= 3) repeatedCount++;
    }

    // Repetition usually indicates frustration
    if (repeatedCount >= 3) return -0.5;
    if (repeatedCount >= 1) return -0.2;
    return 0;
}

// =============================================
// Helpers
// =============================================

function scoreToLabel(score: number): SentimentResult['label'] {
    if (score <= -0.5) return 'very_negative';
    if (score <= -0.2) return 'negative';
    if (score >= 0.5) return 'very_positive';
    if (score >= 0.2) return 'positive';
    return 'neutral';
}

function getSuggestedAction(score: number, label: string): string | undefined {
    switch (label) {
        case 'very_negative':
            return 'Müşteriyi yöneticiye devret — yüksek memnuniyetsizlik';
        case 'negative':
            return 'Empati göster ve çözüm odaklı yaklaş';
        case 'very_positive':
            return 'Fırsat: Üst satış veya referans talebi';
        case 'positive':
            return 'Pozitif deneyimi sürdür';
        default:
            return undefined;
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
