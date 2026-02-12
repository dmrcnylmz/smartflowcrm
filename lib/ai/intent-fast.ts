/**
 * Fast Intent Detector
 *
 * Deterministic keyword/regex-based intent detection.
 * Runs BEFORE LLM — LLM never decides intent.
 *
 * Triggers on 2-3 meaningful tokens from STT partial output.
 * Turkish root-based matching for partial word detection.
 */

// --- Types ---

export type IntentCategory =
    | 'appointment'
    | 'complaint'
    | 'pricing'
    | 'info'
    | 'cancellation'
    | 'greeting'
    | 'farewell'
    | 'escalation'
    | 'thanks'
    | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface IntentResult {
    intent: IntentCategory;
    confidence: ConfidenceLevel;
    detectedKeywords: string[];
    language: 'tr' | 'en';
}

// --- Keyword Maps ---
// Turkish roots (stems) for partial word matching

interface KeywordRule {
    intent: IntentCategory;
    // Roots/stems that match beginning of words
    roots: string[];
    // Exact phrases that match anywhere
    phrases: string[];
    confidence: ConfidenceLevel;
}

const TURKISH_RULES: KeywordRule[] = [
    // Appointment
    {
        intent: 'appointment',
        roots: ['randev', 'rezerv', 'görüşm'],
        phrases: ['randevu almak', 'randevu istiyorum', 'görüşme ayarla', 'ne zaman müsait', 'saat kaçta'],
        confidence: 'high',
    },
    // Complaint
    {
        intent: 'complaint',
        roots: ['şikay', 'şikayet', 'problem', 'sorun', 'arıza', 'bozul', 'çalışm', 'memnun'],
        phrases: [
            'şikayet etmek', 'sorun yaşıyorum', 'problem var', 'çalışmıyor',
            'memnun değilim', 'arıza var', 'bozuldu', 'düzeltilmedi',
        ],
        confidence: 'high',
    },
    // Pricing
    {
        intent: 'pricing',
        roots: ['fiyat', 'ücret', 'maliyet', 'tarife', 'paket', 'kampanya', 'indirim', 'teklif'],
        phrases: ['ne kadar', 'fiyatı nedir', 'ücret ne', 'kaç lira', 'kaç TL', 'teklif ver'],
        confidence: 'high',
    },
    // Cancellation
    {
        intent: 'cancellation',
        roots: ['iptal', 'vazgeç', 'sonlandır', 'bitir', 'kapat'],
        phrases: ['iptal etmek istiyorum', 'vazgeçtim', 'sonlandırmak istiyorum', 'aboneliği iptal'],
        confidence: 'high',
    },
    // Greeting
    {
        intent: 'greeting',
        roots: [],
        phrases: [
            'merhaba', 'selam', 'iyi günler', 'günaydın', 'iyi akşamlar',
            'hayırlı günler', 'nasılsınız', 'nasılsın',
        ],
        confidence: 'high',
    },
    // Farewell
    {
        intent: 'farewell',
        roots: [],
        phrases: [
            'hoşça kal', 'güle güle', 'görüşürüz', 'iyi günler',
            'iyi akşamlar', 'teşekkürler görüşürüz', 'kapatabiliriz',
        ],
        confidence: 'high',
    },
    // Escalation
    {
        intent: 'escalation',
        roots: ['yönetici', 'müdür', 'amir', 'yetkili'],
        phrases: [
            'yöneticiyle görüşmek', 'müdürle konuşmak', 'yetkili birini',
            'üst birime', 'gerçek birisi', 'insanla konuşmak',
        ],
        confidence: 'high',
    },
    // Thanks
    {
        intent: 'thanks',
        roots: ['teşekkür', 'sağol'],
        phrases: ['teşekkür ederim', 'sağ olun', 'çok teşekkürler', 'teşekkürler'],
        confidence: 'high',
    },
    // Info (broad — lowest priority)
    {
        intent: 'info',
        roots: ['bilgi', 'öğren', 'soru', 'merak'],
        phrases: ['bilgi almak', 'öğrenmek istiyorum', 'sorum var', 'nasıl yapılır', 'ne yapmalıyım'],
        confidence: 'medium',
    },
];

const ENGLISH_RULES: KeywordRule[] = [
    {
        intent: 'appointment',
        roots: ['appoint', 'book', 'reserv', 'schedul', 'meet'],
        phrases: ['book an appointment', 'schedule a meeting', 'when are you available'],
        confidence: 'high',
    },
    {
        intent: 'complaint',
        roots: ['complain', 'problem', 'issue', 'broken', 'fault', 'dissatisf'],
        phrases: ['file a complaint', 'not working', 'having issues', 'not satisfied'],
        confidence: 'high',
    },
    {
        intent: 'pricing',
        roots: ['price', 'cost', 'rate', 'fee', 'discount', 'offer'],
        phrases: ['how much', 'what is the price', 'pricing info'],
        confidence: 'high',
    },
    {
        intent: 'cancellation',
        roots: ['cancel', 'terminat', 'end', 'stop'],
        phrases: ['cancel my', 'want to cancel', 'terminate my'],
        confidence: 'high',
    },
    {
        intent: 'greeting',
        roots: [],
        phrases: ['hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'hey'],
        confidence: 'high',
    },
    {
        intent: 'farewell',
        roots: [],
        phrases: ['goodbye', 'bye', 'see you', 'thank you goodbye', 'have a nice day'],
        confidence: 'high',
    },
    {
        intent: 'escalation',
        roots: ['manager', 'supervis', 'escalat'],
        phrases: ['speak to a manager', 'talk to someone', 'real person', 'human agent'],
        confidence: 'high',
    },
    {
        intent: 'thanks',
        roots: ['thank'],
        phrases: ['thank you', 'thanks', 'appreciate it'],
        confidence: 'high',
    },
    {
        intent: 'info',
        roots: ['info', 'learn', 'question', 'wonder', 'know'],
        phrases: ['i want to know', 'can you tell me', 'information about'],
        confidence: 'medium',
    },
];

// --- Language Detection ---

function detectLanguage(text: string): 'tr' | 'en' {
    // Turkish-specific characters
    const turkishChars = /[çğıöşüÇĞİÖŞÜ]/;
    if (turkishChars.test(text)) return 'tr';

    // Common Turkish words
    const turkishWords = /\b(bir|ve|bu|için|ile|var|olan|da|de|mi|mı|ne|nasıl)\b/i;
    if (turkishWords.test(text)) return 'tr';

    return 'en';
}

// --- Core Detection ---

/**
 * Detect intent from partial or complete transcript.
 * Pure function — no side effects, no async, no LLM.
 *
 * Triggers on 2+ meaningful tokens.
 */
export function detectIntentFast(text: string): IntentResult {
    const normalized = text.toLowerCase().trim();

    if (!normalized || normalized.split(/\s+/).length < 1) {
        return { intent: 'unknown', confidence: 'low', detectedKeywords: [], language: 'tr' };
    }

    const language = detectLanguage(normalized);
    const rules = language === 'tr' ? TURKISH_RULES : ENGLISH_RULES;

    let bestMatch: IntentResult = {
        intent: 'unknown',
        confidence: 'low',
        detectedKeywords: [],
        language,
    };
    let bestScore = 0;

    for (const rule of rules) {
        const matchedKeywords: string[] = [];
        let score = 0;

        // Check exact phrase matches (highest priority)
        for (const phrase of rule.phrases) {
            if (normalized.includes(phrase)) {
                matchedKeywords.push(phrase);
                score += 3; // Phrase match = high score
            }
        }

        // Check root/stem matches
        const words = normalized.split(/\s+/);
        for (const word of words) {
            for (const root of rule.roots) {
                if (word.startsWith(root)) {
                    matchedKeywords.push(word);
                    score += 2; // Root match = medium score
                }
            }
        }

        if (score > bestScore && matchedKeywords.length > 0) {
            bestScore = score;
            bestMatch = {
                intent: rule.intent,
                confidence: score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low',
                detectedKeywords: [...new Set(matchedKeywords)],
                language,
            };
        }
    }

    return bestMatch;
}

/**
 * Check if we have enough tokens for intent detection.
 * Returns true when 2+ meaningful tokens are available.
 */
export function hasEnoughTokensForIntent(partialText: string): boolean {
    const words = partialText.trim().split(/\s+/).filter(w => w.length >= 2);
    return words.length >= 2;
}

/**
 * Get safe response template based on intent (used when LLM/RAG fails).
 */
export function getSafeResponse(intent: IntentCategory, language: 'tr' | 'en'): string {
    const responses: Record<string, Record<IntentCategory, string>> = {
        tr: {
            appointment: 'Randevu talebinizi aldım. Sizi ilgili birime yönlendiriyorum.',
            complaint: 'Şikayetinizi kaydettim. En kısa sürede size dönüş yapılacaktır.',
            pricing: 'Fiyat bilgisi için sizi yetkili birime bağlıyorum.',
            info: 'Bilgi talebinizi ilettim. Size en kısa sürede dönüş yapılacaktır.',
            cancellation: 'İptal talebinizi aldım. Sizi ilgili birime yönlendiriyorum.',
            greeting: 'Merhaba, size nasıl yardımcı olabilirim?',
            farewell: 'İyi günler, tekrar arayabilirsiniz.',
            escalation: 'Sizi hemen yetkili birime bağlıyorum.',
            thanks: 'Rica ederim, başka bir konuda yardımcı olabilir miyim?',
            unknown: 'Anlıyorum. Size en iyi şekilde yardımcı olmak için sizi yetkili birime bağlıyorum.',
        },
        en: {
            appointment: 'I\'ve noted your appointment request. Let me connect you with the right department.',
            complaint: 'I\'ve recorded your complaint. Someone will get back to you shortly.',
            pricing: 'Let me connect you with someone who can help with pricing information.',
            info: 'I\'ve noted your request. We\'ll get back to you as soon as possible.',
            cancellation: 'I\'ve noted your cancellation request. Let me connect you with the right department.',
            greeting: 'Hello, how can I help you today?',
            farewell: 'Thank you for calling, have a great day.',
            escalation: 'Let me connect you with a supervisor right away.',
            thanks: 'You\'re welcome. Is there anything else I can help you with?',
            unknown: 'I understand. Let me connect you with someone who can best assist you.',
        },
    };

    return responses[language]?.[intent] || responses.tr.unknown;
}

// --- Intent Shortcut System ---

/**
 * Intents that can be answered without LLM.
 * These have deterministic, predictable responses.
 */
export const SHORTCUTTABLE_INTENTS: ReadonlySet<IntentCategory> = new Set([
    'greeting',
    'farewell',
    'thanks',
    'escalation',
]);

/**
 * Check if an intent result qualifies for LLM bypass.
 * Only shortcuts on HIGH confidence to avoid false positives.
 */
export function shouldShortcut(intentResult: IntentResult): boolean {
    return (
        intentResult.confidence === 'high' &&
        SHORTCUTTABLE_INTENTS.has(intentResult.intent)
    );
}

/**
 * Get a rich shortcut response that includes tenant persona name.
 * These are more natural than safe fallbacks — designed for direct use.
 */
export function getShortcutResponse(
    intent: IntentCategory,
    language: 'tr' | 'en',
    agentName?: string,
): string {
    const name = agentName || (language === 'tr' ? 'Ben' : 'I');

    const responses: Record<string, Record<IntentCategory, string>> = {
        tr: {
            greeting: `Merhaba! ${name === 'Ben' ? '' : name + ' olarak '}size nasıl yardımcı olabilirim?`,
            farewell: `İyi günler dilerim! Tekrar ihtiyacınız olursa bizi arayabilirsiniz.`,
            thanks: `Rica ederim! Başka bir konuda yardımcı olabilir miyim?`,
            escalation: `Sizi hemen yetkili bir temsilciye bağlıyorum. Lütfen hatta kalın.`,
            // Below should never be called via shortcut, but included for completeness
            appointment: '', complaint: '', pricing: '', info: '',
            cancellation: '', unknown: '',
        },
        en: {
            greeting: `Hello! How can I help you today?`,
            farewell: `Have a great day! Feel free to call us again anytime.`,
            thanks: `You're welcome! Is there anything else I can help you with?`,
            escalation: `Let me connect you with a supervisor right away. Please hold.`,
            appointment: '', complaint: '', pricing: '', info: '',
            cancellation: '', unknown: '',
        },
    };

    return responses[language]?.[intent] || responses.tr.unknown;
}
