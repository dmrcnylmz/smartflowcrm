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
    | 'out_of_scope'
    | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface IntentResult {
    intent: IntentCategory;
    confidence: ConfidenceLevel;
    detectedKeywords: string[];
    language: 'tr' | 'en' | 'de' | 'fr';
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
    // Out of Scope — kapsam dışı istekler (yüksek öncelik)
    {
        intent: 'out_of_scope',
        roots: ['taksi', 'otel', 'uçak', 'bilet', 'restoran', 'yemek', 'pizza', 'kargo', 'hava'],
        phrases: [
            'taksi çağır', 'taksi istiyorum', 'taksi lazım', 'taksi ayarla',
            'otel bul', 'otel ayırt', 'uçak bileti', 'uçuş bilgisi',
            'yemek sipariş', 'pizza sipariş', 'kargo takip', 'kargo gönder',
            'hava durumu', 'hava nasıl', 'yol tarifi', 'navigasyon',
            'futbol', 'maç skoru', 'film öner', 'şarkı çal', 'müzik aç',
            'matematik', 'hesapla', 'çeviri yap', 'tercüme et',
            'kahve sipariş', 'market sipariş',
        ],
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
    // Out of Scope — irrelevant requests (high priority)
    {
        intent: 'out_of_scope',
        roots: ['taxi', 'hotel', 'flight', 'pizza', 'uber', 'lyft', 'weather', 'recipe', 'movie', 'music', 'game', 'sport'],
        phrases: [
            'book a taxi', 'call a taxi', 'need a taxi', 'get a taxi', 'order a taxi',
            'need a ride', 'call an uber', 'uber me', 'get me a ride',
            'book a hotel', 'find a hotel', 'hotel room', 'hotel reservation',
            'book a flight', 'flight ticket', 'airline ticket', 'plane ticket',
            'order food', 'order pizza', 'food delivery', 'restaurant near',
            'weather forecast', 'what is the weather', 'is it going to rain',
            'play music', 'play a song', 'song lyrics',
            'tell me a joke', 'tell me a story',
            'translate this', 'calculate', 'math problem',
            'sports score', 'football score', 'game score',
            'movie recommendation', 'what to watch',
            'track my package', 'shipping status', 'cargo tracking',
            'navigate to', 'directions to', 'how to get to',
            'going to albania', 'going to turkey', 'travel to',
        ],
        confidence: 'high',
    },
    {
        intent: 'info',
        roots: ['info', 'learn', 'question', 'wonder', 'know'],
        phrases: ['i want to know', 'can you tell me', 'information about'],
        confidence: 'medium',
    },
];

const GERMAN_RULES: KeywordRule[] = [
    {
        intent: 'appointment',
        roots: ['termin', 'buchung', 'reservier', 'vereinbar'],
        phrases: ['termin buchen', 'termin vereinbaren', 'wann sind sie verfügbar', 'termin machen'],
        confidence: 'high',
    },
    {
        intent: 'complaint',
        roots: ['beschwerd', 'problem', 'reklamation', 'defekt', 'kaputt', 'mangel'],
        phrases: ['beschwerde einreichen', 'funktioniert nicht', 'bin nicht zufrieden', 'es ist kaputt', 'problem melden'],
        confidence: 'high',
    },
    {
        intent: 'pricing',
        roots: ['preis', 'kosten', 'tarif', 'gebühr', 'rabatt', 'angebot'],
        phrases: ['wie viel kostet', 'was kostet', 'preis erfahren', 'preisliste', 'gibt es rabatt'],
        confidence: 'high',
    },
    {
        intent: 'cancellation',
        roots: ['kündig', 'stornier', 'abbestell', 'widerruf'],
        phrases: ['kündigen möchte', 'vertrag kündigen', 'abo kündigen', 'stornieren möchte', 'abonnement kündigen'],
        confidence: 'high',
    },
    {
        intent: 'greeting',
        roots: [],
        phrases: ['hallo', 'guten tag', 'guten morgen', 'guten abend', 'grüß gott', 'servus', 'moin'],
        confidence: 'high',
    },
    {
        intent: 'farewell',
        roots: [],
        phrases: ['auf wiedersehen', 'tschüss', 'bis bald', 'schönen tag', 'auf wiederhören', 'ciao'],
        confidence: 'high',
    },
    {
        intent: 'escalation',
        roots: ['vorgesetzt', 'leiter', 'manager', 'verantwortlich'],
        phrases: ['mit vorgesetzten sprechen', 'mit dem chef sprechen', 'verantwortlichen sprechen', 'echte person', 'mensch sprechen'],
        confidence: 'high',
    },
    {
        intent: 'thanks',
        roots: ['dank'],
        phrases: ['danke', 'vielen dank', 'herzlichen dank', 'dankeschön', 'danke schön'],
        confidence: 'high',
    },
    {
        intent: 'out_of_scope',
        roots: ['taxi', 'hotel', 'flug', 'pizza', 'wetter', 'rezept', 'film', 'musik', 'spiel', 'sport'],
        phrases: [
            'taxi bestellen', 'taxi rufen', 'hotel buchen', 'hotel finden',
            'flug buchen', 'flugticket', 'essen bestellen', 'pizza bestellen',
            'wie wird das wetter', 'wettervorhersage', 'musik abspielen',
            'witz erzählen', 'route berechnen', 'navigiere zu',
            'paket verfolgen', 'lieferstatus',
        ],
        confidence: 'high',
    },
    {
        intent: 'info',
        roots: ['info', 'auskunft', 'frag', 'wiss'],
        phrases: ['ich möchte wissen', 'können sie mir sagen', 'information über', 'auskunft bitte'],
        confidence: 'medium',
    },
];

const FRENCH_RULES: KeywordRule[] = [
    {
        intent: 'appointment',
        roots: ['rendez', 'réserv', 'planifi'],
        phrases: ['prendre rendez-vous', 'réserver un créneau', 'planifier une réunion', 'quand êtes-vous disponible'],
        confidence: 'high',
    },
    {
        intent: 'complaint',
        roots: ['plainte', 'réclamation', 'problème', 'panne', 'défaut', 'mécontent'],
        phrases: ['déposer une plainte', 'ne fonctionne pas', 'pas satisfait', 'problème avec', 'faire une réclamation'],
        confidence: 'high',
    },
    {
        intent: 'pricing',
        roots: ['prix', 'tarif', 'coût', 'remise', 'offre', 'devis'],
        phrases: ['combien ça coûte', 'quel est le prix', 'tarif pour', 'demande de devis', 'y a-t-il une remise'],
        confidence: 'high',
    },
    {
        intent: 'cancellation',
        roots: ['annul', 'résili', 'désabonn'],
        phrases: ['annuler mon', 'je veux annuler', 'résilier mon', 'désabonner', 'annuler abonnement'],
        confidence: 'high',
    },
    {
        intent: 'greeting',
        roots: [],
        phrases: ['bonjour', 'salut', 'bonsoir', 'bonne journée', 'enchanté', 'coucou'],
        confidence: 'high',
    },
    {
        intent: 'farewell',
        roots: [],
        phrases: ['au revoir', 'à bientôt', 'bonne journée', 'bonne soirée', 'adieu', 'salut'],
        confidence: 'high',
    },
    {
        intent: 'escalation',
        roots: ['responsable', 'superviseur', 'directeur', 'supérieur'],
        phrases: ['parler au responsable', 'parler à quelqu\'un', 'personne réelle', 'agent humain', 'parler au directeur'],
        confidence: 'high',
    },
    {
        intent: 'thanks',
        roots: ['merci', 'remerci'],
        phrases: ['merci', 'merci beaucoup', 'je vous remercie', 'c\'est gentil'],
        confidence: 'high',
    },
    {
        intent: 'out_of_scope',
        roots: ['taxi', 'hôtel', 'vol', 'pizza', 'météo', 'recette', 'film', 'musique', 'jeu', 'sport'],
        phrases: [
            'appeler un taxi', 'commander un taxi', 'réserver un hôtel', 'trouver un hôtel',
            'réserver un vol', 'billet d\'avion', 'commander à manger', 'commander une pizza',
            'quel temps fait-il', 'prévisions météo', 'jouer de la musique',
            'raconter une blague', 'itinéraire vers', 'naviguer vers',
            'suivre mon colis', 'statut de livraison',
        ],
        confidence: 'high',
    },
    {
        intent: 'info',
        roots: ['info', 'renseign', 'question', 'savoir'],
        phrases: ['je voudrais savoir', 'pouvez-vous me dire', 'information sur', 'renseignement'],
        confidence: 'medium',
    },
];

// --- Language Detection ---

export function detectLanguage(text: string): 'tr' | 'en' | 'de' | 'fr' {
    // Turkish-specific characters (ç/Ç removed — shared with French)
    const turkishChars = /[ğışĞİŞ]/; // ğ, ı, ş are unique to Turkish
    if (turkishChars.test(text)) return 'tr';

    // German-specific characters + common German words
    const germanChars = /[äÄßẞ]/;
    if (germanChars.test(text)) return 'de';

    const germanWords = /\b(ich|und|das|ist|ein|eine|für|mit|nicht|auf|der|die|den|des|dem|hallo|guten|danke|bitte|möchte|können|haben|termin|beschwerde|kündigen|wie|viel|kostet|sprechen|wiedersehen|tschüss|mein|ihr|wir|sie)\b/i;
    if (germanWords.test(text)) return 'de';

    // French-specific characters + common French words
    const frenchChars = /[éèêëàâùûîïôœæç]/i;
    if (frenchChars.test(text)) return 'fr';

    const frenchWords = /\b(je|nous|vous|les|une|des|est|sont|pour|avec|pas|sur|bonjour|merci|rendez|plainte|annuler|combien|comment|voudrais|pouvez|revoir|bonsoir|oui|non|mon|votre|notre|cette)\b/i;
    if (frenchWords.test(text)) return 'fr';

    // Common Turkish words (including those without special characters)
    const turkishWords = /\b(bir|ve|bu|için|ile|var|olan|da|mi|mı|ne|nasıl|merhaba|selam|evet|hayır|tamam|randevu|fiyat|istiyorum|nedir|almak|etmek|olarak|benim|sizin|lütfen)\b/i;
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
    const rulesMap: Record<string, KeywordRule[]> = {
        tr: TURKISH_RULES,
        en: ENGLISH_RULES,
        de: GERMAN_RULES,
        fr: FRENCH_RULES,
    };
    const rules = rulesMap[language] || ENGLISH_RULES;

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
export function getSafeResponse(intent: IntentCategory, language: 'tr' | 'en' | 'de' | 'fr'): string {
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
            out_of_scope: 'Üzgünüm, bu konuda yardımcı olamıyorum. Ben yalnızca şirketimizin hizmetleri hakkında destek verebilirim. Size başka bir konuda yardımcı olabilir miyim?',
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
            out_of_scope: 'I\'m sorry, I can\'t help with that. I can only assist with our company\'s services. Is there anything else related to our business I can help you with?',
            unknown: 'I understand. Let me connect you with someone who can best assist you.',
        },
        de: {
            appointment: 'Ich habe Ihre Terminanfrage notiert. Ich verbinde Sie mit der zuständigen Abteilung.',
            complaint: 'Ihre Beschwerde wurde aufgenommen. Jemand wird sich in Kürze bei Ihnen melden.',
            pricing: 'Ich verbinde Sie mit jemandem, der Ihnen bei den Preisinformationen helfen kann.',
            info: 'Ich habe Ihre Anfrage notiert. Wir melden uns so schnell wie möglich bei Ihnen.',
            cancellation: 'Ich habe Ihre Kündigungsanfrage notiert. Ich verbinde Sie mit der zuständigen Abteilung.',
            greeting: 'Hallo, wie kann ich Ihnen helfen?',
            farewell: 'Vielen Dank für Ihren Anruf. Auf Wiederhören.',
            escalation: 'Ich verbinde Sie sofort mit einem Vorgesetzten.',
            thanks: 'Gerne geschehen. Kann ich Ihnen noch bei etwas anderem helfen?',
            out_of_scope: 'Es tut mir leid, dabei kann ich Ihnen nicht helfen. Ich kann nur bei Fragen zu unseren Dienstleistungen unterstützen. Kann ich Ihnen bei etwas anderem helfen?',
            unknown: 'Ich verstehe. Lassen Sie mich Sie mit jemandem verbinden, der Ihnen am besten helfen kann.',
        },
        fr: {
            appointment: 'J\'ai noté votre demande de rendez-vous. Je vous mets en relation avec le bon service.',
            complaint: 'Votre réclamation a été enregistrée. Quelqu\'un vous recontactera sous peu.',
            pricing: 'Je vous mets en relation avec quelqu\'un qui peut vous renseigner sur les tarifs.',
            info: 'J\'ai noté votre demande. Nous vous recontacterons dès que possible.',
            cancellation: 'J\'ai noté votre demande d\'annulation. Je vous mets en relation avec le service concerné.',
            greeting: 'Bonjour, comment puis-je vous aider ?',
            farewell: 'Merci de votre appel. Bonne journée.',
            escalation: 'Je vous mets immédiatement en relation avec un responsable.',
            thanks: 'Je vous en prie. Puis-je vous aider pour autre chose ?',
            out_of_scope: 'Je suis désolé, je ne peux pas vous aider avec cela. Je ne peux vous assister que pour les services de notre entreprise. Puis-je vous aider pour autre chose ?',
            unknown: 'Je comprends. Permettez-moi de vous mettre en relation avec quelqu\'un qui pourra mieux vous aider.',
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
    'out_of_scope',
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
    language: 'tr' | 'en' | 'de' | 'fr',
    agentName?: string,
): string {
    const name = agentName || (language === 'tr' ? 'Ben' : language === 'de' ? 'Ich' : language === 'fr' ? 'Je' : 'I');

    const responses: Record<string, Record<IntentCategory, string>> = {
        tr: {
            greeting: `Merhaba! ${name === 'Ben' ? '' : name + ' olarak '}size nasıl yardımcı olabilirim?`,
            farewell: `İyi günler dilerim! Tekrar ihtiyacınız olursa bizi arayabilirsiniz.`,
            thanks: `Rica ederim! Başka bir konuda yardımcı olabilir miyim?`,
            escalation: `Sizi hemen yetkili bir temsilciye bağlıyorum. Lütfen hatta kalın.`,
            out_of_scope: `Üzgünüm, bu konuda yardımcı olamıyorum. Yalnızca şirketimizin hizmetleriyle ilgili sorularda destek verebilirim.`,
            // Below should never be called via shortcut, but included for completeness
            appointment: '', complaint: '', pricing: '', info: '',
            cancellation: '', unknown: '',
        },
        en: {
            greeting: `Hello! How can I help you today?`,
            farewell: `Have a great day! Feel free to call us again anytime.`,
            thanks: `You're welcome! Is there anything else I can help you with?`,
            escalation: `Let me connect you with a supervisor right away. Please hold.`,
            out_of_scope: `I'm sorry, that's outside the scope of our services. I can only help with our company's offerings. Is there anything else I can assist you with?`,
            appointment: '', complaint: '', pricing: '', info: '',
            cancellation: '', unknown: '',
        },
        de: {
            greeting: `Hallo! Wie kann ich Ihnen heute helfen?`,
            farewell: `Schönen Tag noch! Rufen Sie uns gerne jederzeit wieder an.`,
            thanks: `Gerne geschehen! Kann ich Ihnen noch bei etwas anderem helfen?`,
            escalation: `Ich verbinde Sie sofort mit einem Vorgesetzten. Bitte bleiben Sie dran.`,
            out_of_scope: `Es tut mir leid, das liegt außerhalb unseres Leistungsbereichs. Ich kann nur bei Fragen zu unseren Dienstleistungen helfen.`,
            appointment: '', complaint: '', pricing: '', info: '',
            cancellation: '', unknown: '',
        },
        fr: {
            greeting: `Bonjour ! Comment puis-je vous aider aujourd'hui ?`,
            farewell: `Bonne journée ! N'hésitez pas à nous rappeler.`,
            thanks: `Je vous en prie ! Puis-je vous aider pour autre chose ?`,
            escalation: `Je vous mets immédiatement en relation avec un responsable. Veuillez patienter.`,
            out_of_scope: `Je suis désolé, cela ne relève pas de nos services. Je ne peux vous aider que pour les offres de notre entreprise.`,
            appointment: '', complaint: '', pricing: '', info: '',
            cancellation: '', unknown: '',
        },
    };

    return responses[language]?.[intent] || responses.tr.unknown;
}
