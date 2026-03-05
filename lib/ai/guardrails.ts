/**
 * Guardrails — Anti-Hallucination & Output Safety
 *
 * Validates LLM responses against RAG context and tenant rules.
 * Priority: Correctness > Trust > Consistency > Fluency
 *
 * Hard rules:
 * - Never fabricate facts not in RAG context
 * - Never reveal AI identity
 * - Never mention competitors
 * - Never make unauthorized commitments
 * - If uncertain → escalate
 */

// --- Types ---

export interface GuardrailConfig {
    forbiddenTopics: string[];
    competitorNames: string[];
    allowPriceQuotes: boolean;
    allowContractTerms: boolean;
    maxResponseLength: number;
    language: 'tr' | 'en';
}

export interface GuardrailResult {
    approved: boolean;
    sanitizedResponse: string;
    violations: string[];
    confidence: number;
}

export interface RAGContext {
    text: string;
    score: number;
    source: string;
}

// --- Constants ---

const DEFAULT_CONFIG: GuardrailConfig = {
    forbiddenTopics: [],
    competitorNames: [],
    allowPriceQuotes: false,
    allowContractTerms: false,
    maxResponseLength: 500,
    language: 'tr',
};

// AI identity keywords (must never appear in responses)
const AI_IDENTITY_PATTERNS_TR = [
    /\byapay zeka\b/i,
    /\bYZ\b/,
    /\bbot\b/i,
    /\bchatbot\b/i,
    /\bai\b/i,
    /\basistan\b/i,
    /\bsanal\b/i,
    /\bdijital asistan\b/i,
    /\bmakine öğrenme\b/i,
    /\blanguage model\b/i,
    /\bGPT\b/,
    /\bOpenAI\b/i,
    /\bbir yapay\b/i,
    /\bben bir program\b/i,
];

const AI_IDENTITY_PATTERNS_EN = [
    /\bartificial intelligence\b/i,
    /\bAI\b/,
    /\bbot\b/i,
    /\bchatbot\b/i,
    /\bvirtual assistant\b/i,
    /\blanguage model\b/i,
    /\bGPT\b/,
    /\bOpenAI\b/i,
    /\bI am a program\b/i,
    /\bI'm an AI\b/i,
    /\bas an AI\b/i,
];

// Price/commitment patterns
const PRICE_PATTERNS_TR = [
    /\d+\s*(?:TL|lira|₺)/i,
    /fiyatı?\s+\d/i,
    /ücret\w*\s+\d/i,
    /\btaahhüt\b/i,
    /\bgaranti ediyorum\b/i,
    /\bsöz veriyorum\b/i,
];

const PRICE_PATTERNS_EN = [
    /\$\d+/,
    /\d+\s*(?:dollars?|USD|EUR)/i,
    /\bguarantee\b/i,
    /\bpromise\b/i,
    /\bcommit\b/i,
];

// Escalation phrases
const ESCALATION_RESPONSES: Record<string, string> = {
    tr: 'Bu konuda kesin bilgi veremiyorum, sizi yetkili birime bağlıyorum.',
    en: 'I cannot provide definitive information on this matter. Let me connect you with the appropriate department.',
};

const UNCERTAINTY_RESPONSES: Record<string, string> = {
    tr: 'Bu konuyu kontrol edip size dönmem gerekiyor. Bir saniye bekleyebilir misiniz?',
    en: 'I need to check on this and get back to you. Could you hold for a moment?',
};

// --- Core Guardrail Engine ---

/**
 * Validate an LLM response against guardrails.
 *
 * @param response - LLM generated response text
 * @param ragContexts - RAG context chunks with similarity scores
 * @param config - Tenant-specific guardrail configuration
 */
export function validateResponse(
    response: string,
    ragContexts: RAGContext[],
    config: Partial<GuardrailConfig> = {},
): GuardrailResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const violations: string[] = [];
    let sanitized = response;

    // --- 1. RAG Confidence Gate ---
    const maxRAGScore = ragContexts.length > 0
        ? Math.max(...ragContexts.map(c => c.score))
        : 0;

    if (ragContexts.length === 0 || maxRAGScore < 0.75) {
        return {
            approved: false,
            sanitizedResponse: ESCALATION_RESPONSES[cfg.language] || ESCALATION_RESPONSES.tr,
            violations: ['RAG confidence below threshold (< 0.75) — escalating to human'],
            confidence: maxRAGScore,
        };
    }

    // --- 2. AI Identity Leak Check ---
    const identityPatterns = cfg.language === 'tr'
        ? AI_IDENTITY_PATTERNS_TR
        : AI_IDENTITY_PATTERNS_EN;

    for (const pattern of identityPatterns) {
        if (pattern.test(sanitized)) {
            violations.push(`AI identity leak detected: ${pattern.source}`);
            // Remove the offending pattern
            sanitized = sanitized.replace(pattern, '');
        }
    }

    // --- 3. Competitor Mention Check ---
    for (const competitor of cfg.competitorNames) {
        const regex = new RegExp(`\\b${escapeRegex(competitor)}\\b`, 'gi');
        if (regex.test(sanitized)) {
            violations.push(`Competitor mention: ${competitor}`);
            sanitized = sanitized.replace(regex, '[firma]');
        }
    }

    // --- 4. Forbidden Topic Check ---
    for (const topic of cfg.forbiddenTopics) {
        const regex = new RegExp(`\\b${escapeRegex(topic)}\\b`, 'gi');
        if (regex.test(sanitized)) {
            violations.push(`Forbidden topic: ${topic}`);
            return {
                approved: false,
                sanitizedResponse: UNCERTAINTY_RESPONSES[cfg.language] || UNCERTAINTY_RESPONSES.tr,
                violations,
                confidence: maxRAGScore,
            };
        }
    }

    // --- 5. Unauthorized Price/Commitment Check ---
    if (!cfg.allowPriceQuotes) {
        const pricePatterns = cfg.language === 'tr' ? PRICE_PATTERNS_TR : PRICE_PATTERNS_EN;
        for (const pattern of pricePatterns) {
            if (pattern.test(sanitized)) {
                violations.push(`Unauthorized price/commitment: ${pattern.source}`);
                // Don't block, but flag — the price might come from RAG
                const priceInRAG = ragContexts.some(c => pattern.test(c.text));
                if (!priceInRAG) {
                    return {
                        approved: false,
                        sanitizedResponse: cfg.language === 'tr'
                            ? 'Fiyat bilgisi için sizi uzmanımıza bağlıyorum.'
                            : 'Let me connect you with our specialist for pricing information.',
                        violations,
                        confidence: maxRAGScore,
                    };
                }
            }
        }
    }

    // --- 6. Response Length Check ---
    if (sanitized.length > cfg.maxResponseLength) {
        sanitized = sanitized.slice(0, cfg.maxResponseLength).trim();
        // Find last complete sentence
        const lastPeriod = sanitized.lastIndexOf('.');
        if (lastPeriod > cfg.maxResponseLength * 0.5) {
            sanitized = sanitized.slice(0, lastPeriod + 1);
        }
        violations.push('Response truncated to max length');
    }

    // --- 7. Topic Drift Detection ---
    // Check if response content is grounded in RAG context
    const responseWords = extractMeaningfulWords(sanitized.toLowerCase());
    const ragWords = new Set(
        ragContexts.flatMap(c => extractMeaningfulWords(c.text.toLowerCase()))
    );

    const groundedWords = responseWords.filter(w => ragWords.has(w));
    const groundingRatio = responseWords.length > 0
        ? groundedWords.length / responseWords.length
        : 0;

    if (groundingRatio < 0.15 && responseWords.length > 5) {
        violations.push(`Low grounding ratio (${(groundingRatio * 100).toFixed(0)}%) — possible hallucination`);
        return {
            approved: false,
            sanitizedResponse: UNCERTAINTY_RESPONSES[cfg.language] || UNCERTAINTY_RESPONSES.tr,
            violations,
            confidence: groundingRatio,
        };
    }

    return {
        approved: violations.length === 0,
        sanitizedResponse: sanitized.trim(),
        violations,
        confidence: maxRAGScore,
    };
}

// --- Utilities ---

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turkish stop words to exclude from grounding check
const STOP_WORDS = new Set([
    // Turkish
    'bir', 'bu', 've', 'de', 'da', 'ile', 'için', 'var', 'yok', 'olan',
    'ben', 'sen', 'biz', 'siz', 'o', 'ne', 'nasıl', 'en', 'çok', 'az',
    'mi', 'mı', 'mu', 'mü', 'evet', 'hayır', 'ya', 'ki', 'gibi',
    // English
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'can', 'could', 'should', 'shall', 'may', 'might', 'must',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
    'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'and', 'or', 'but', 'not', 'no', 'yes',
]);

function extractMeaningfulWords(text: string): string[] {
    return text
        .split(/\s+/)
        .map(w => w.replace(/[^a-zçğıöşü0-9]/gi, ''))
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}
