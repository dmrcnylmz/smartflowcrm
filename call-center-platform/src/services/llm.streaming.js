/**
 * LLM Streaming Service — Phase 7 Real-Time Voice Streaming
 * 
 * Streaming LLM responses with sentence-boundary flush.
 * - Local engine: uses existing ai.service.js NLP, streams token-by-token
 * - OpenAI engine: real streaming via openai SDK when OPENAI_API_KEY is set
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'llm' });

// ─── Local LLM Engine (uses existing NLP) ────────────────

class LocalLlmEngine {
    constructor() {
        this._responses = {
            en: {
                appointment: [
                    "I'd be happy to help you schedule an appointment. Let me check our available time slots for you.",
                    "Sure, I can help with scheduling. What day and time works best for you?",
                    "I'll get that appointment set up right away. Can you tell me your preferred date?"
                ],
                complaint: [
                    "I understand your frustration, and I sincerely apologize for the inconvenience. Let me look into this for you right away.",
                    "I'm sorry to hear about this issue. I want to make sure we get this resolved for you today.",
                    "Thank you for bringing this to our attention. I'm going to personally make sure this gets resolved."
                ],
                pricing: [
                    "I'd be glad to go over our pricing options with you. We have several plans that might fit your needs.",
                    "Let me pull up our current pricing information for you. We have flexible options available.",
                    "Great question about pricing. Let me walk you through what we offer."
                ],
                human: [
                    "I completely understand. Let me connect you with one of our specialists right away.",
                    "Of course, I'll transfer you to a live agent who can help you further.",
                    "Absolutely. Let me get a human agent on the line for you."
                ],
                other: [
                    "Thank you for reaching out. I'm here to help you with that.",
                    "I'd be happy to assist you with your request. Let me see what I can do.",
                    "Let me look into that for you. Can you provide me with a few more details?"
                ]
            },
            tr: {
                appointment: [
                    "Randevu planlamanıza yardımcı olmaktan memnuniyet duyarım. Müsait zaman dilimlerimize hemen bakayım.",
                    "Elbette, randevu ayarlamak için yardımcı olabilirim. Hangi gün ve saat sizin için uygun olur?",
                    "Randevunuzu hemen ayarlayalım. Tercih ettiğiniz tarihi söyler misiniz?"
                ],
                complaint: [
                    "Yaşadığınız sorunu anlıyorum ve verdiğimiz rahatsızlıktan dolayı içtenlikle özür dilerim. Hemen incelemeye alıyorum.",
                    "Bu durumu duyduğuma üzüldüm. Bugün bu sorunu sizin için çözmek istiyorum.",
                    "Bunu dikkatimize sunduğunuz için teşekkür ederim. Bu konunun çözüme kavuşmasını bizzat takip edeceğim."
                ],
                pricing: [
                    "Fiyatlandırma seçeneklerimizi sizinle incelemekten memnuniyet duyarım. İhtiyaçlarınıza uygun birçok planımız var.",
                    "Güncel fiyat bilgilerimize hemen bakayım. Esnek seçeneklerimiz mevcut.",
                    "Fiyatlandırma hakkında güzel bir soru. Size sunduklarımızı anlatayım."
                ],
                human: [
                    "Sizi tamamen anlıyorum. Hemen uzmanlarımızdan biriyle bağlantı kurayım.",
                    "Tabii ki, sizi daha fazla yardımcı olabilecek bir temsilciye aktarıyorum.",
                    "Kesinlikle. Sizin için hemen bir müşteri temsilcisine bağlanıyorum."
                ],
                other: [
                    "Bize ulaştığınız için teşekkür ederim. Bu konuda size yardımcı olmak için buradayım.",
                    "Talebinize yardımcı olmaktan memnuniyet duyarım. Neler yapabileceğime bakayım.",
                    "Bu konuyu sizin için araştırayım. Biraz daha detay verebilir misiniz?"
                ]
            }
        };
    }

    async streamResponse(userMessage, tenantSettings, memoryContext, onChunk, language) {
        const timer = logger.startTimer('llm_local_response');

        // Determine language: explicit param > tenant setting > auto-detect > default 'en'
        const lang = language
            || (tenantSettings && tenantSettings.language)
            || this._detectLanguage(userMessage)
            || 'en';

        // Detect intent from user message
        let aiService;
        try {
            aiService = require('./ai.service');
        } catch (e) { /* fallback below */ }

        let intent = 'other';
        if (aiService) {
            intent = aiService.detectIntent(userMessage);
        }

        const langResponses = this._responses[lang] || this._responses.en;
        const responses = langResponses[intent] || langResponses.other;
        let response = responses[Math.floor(Math.random() * responses.length)];

        // Personalize with tenant settings
        if (tenantSettings) {
            if (tenantSettings.tone === 'formal' && lang === 'en') {
                response = response.replace("I'd be", "I would be")
                    .replace("I'm", "I am")
                    .replace("Let me", "Allow me to")
                    .replace("I'll", "I will");
            }
            if (tenantSettings.tone === 'formal' && lang === 'tr') {
                response = response.replace("bakayım", "bakıyorum")
                    .replace("ayarlayalım", "ayarlıyorum");
            }
            if (tenantSettings.company_name) {
                const suffix = lang === 'tr'
                    ? `${tenantSettings.company_name} olarak başka yardımcı olabileceğim bir konu var mı?`
                    : `Is there anything else I can help you with at ${tenantSettings.company_name}?`;
                response = `${response} ${suffix}`;
            }
        }

        // Stream token by token with sentence boundary flush
        const words = response.split(' ');
        let currentSentence = '';
        let totalTokens = 0;
        let firstTokenSent = false;

        for (let i = 0; i < words.length; i++) {
            currentSentence += (currentSentence ? ' ' : '') + words[i];
            totalTokens++;

            // Simulate token-by-token streaming delay
            await new Promise(r => setTimeout(r, 15 + Math.random() * 25));

            if (!firstTokenSent) {
                firstTokenSent = true;
                const elapsed = timer.end();
                metrics.observe('llm_first_token_ms', elapsed);
            }

            // Sentence boundary flush
            if (words[i].endsWith('.') || words[i].endsWith('?') || words[i].endsWith('!') || i === words.length - 1) {
                onChunk(currentSentence, i === words.length - 1);
                currentSentence = '';
            }
        }

        metrics.inc('llm_responses_total', { provider: 'local', intent, language: lang });
        metrics.observe('llm_tokens_total', totalTokens);

        return { intent, totalTokens, response };
    }

    /**
     * Simple Turkish detection based on Turkish-specific characters
     */
    _detectLanguage(text) {
        const turkishChars = /[çğıöşüÇĞİÖŞÜ]/;
        const turkishWords = /\b(merhaba|selam|yardım|lütfen|teşekkür|randevu|şikayet|fiyat|bilgi|istiyorum|nasıl|nedir|mı|mi|mu|mü|evet|hayır)\b/i;
        if (turkishChars.test(text) || turkishWords.test(text)) {
            return 'tr';
        }
        return null; // Unknown — fallback to setting
    }
}

// ─── OpenAI LLM Engine ───────────────────────────────────

class OpenAiLlmEngine {
    constructor(apiKey) {
        this._apiKey = apiKey;
        logger.info('OpenAI LLM engine initialized');
    }

    async streamResponse(userMessage, tenantSettings, memoryContext, onChunk, language) {
        const timer = logger.startTimer('llm_openai_response');

        try {
            const lang = language || (tenantSettings && tenantSettings.language) || 'en';
            const systemPrompt = this._buildSystemPrompt(tenantSettings, lang);
            const messages = [
                { role: 'system', content: systemPrompt }
            ];

            // Add memory context
            if (memoryContext) {
                const turns = memoryContext.split('\n').filter(Boolean);
                for (const turn of turns.slice(-10)) {
                    const [role, ...contentParts] = turn.split(': ');
                    const content = contentParts.join(': ');
                    if (role === 'user' || role === 'assistant') {
                        messages.push({ role, content });
                    }
                }
            }

            messages.push({ role: 'user', content: userMessage });

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this._apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages,
                    stream: true,
                    max_tokens: 300,
                    temperature: 0.7
                })
            });

            let fullResponse = '';
            let currentSentence = '';
            let totalTokens = 0;
            let firstTokenSent = false;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line.slice(6));
                        const token = json.choices?.[0]?.delta?.content;
                        if (token) {
                            fullResponse += token;
                            currentSentence += token;
                            totalTokens++;

                            if (!firstTokenSent) {
                                firstTokenSent = true;
                                const elapsed = timer.end();
                                metrics.observe('llm_first_token_ms', elapsed);
                            }

                            // Sentence boundary flush
                            if (token.includes('.') || token.includes('?') || token.includes('!')) {
                                onChunk(currentSentence.trim(), false);
                                currentSentence = '';
                            }
                        }
                    } catch (e) { /* skip malformed chunks */ }
                }
            }

            // Flush remaining
            if (currentSentence.trim()) {
                onChunk(currentSentence.trim(), true);
            }

            metrics.inc('llm_responses_total', { provider: 'openai' });
            metrics.observe('llm_tokens_total', totalTokens);

            return { totalTokens, response: fullResponse };
        } catch (e) {
            logger.error('OpenAI streaming failed', { error: e.message });
            // Fallback to local
            const fallback = new LocalLlmEngine();
            return fallback.streamResponse(userMessage, tenantSettings, memoryContext, onChunk, language);
        }
    }

    _buildSystemPrompt(tenantSettings, lang) {
        let prompt = lang === 'tr'
            ? 'Sen bir çağrı merkezi AI müşteri hizmetleri temsilcisisin. Yardımsever, özlü ve profesyonel ol. Türkçe yanıt ver.'
            : 'You are an AI customer service agent for a call center. Be helpful, concise, and professional.';
        if (tenantSettings) {
            if (tenantSettings.company_name) {
                prompt += lang === 'tr'
                    ? ` ${tenantSettings.company_name} için çalışıyorsun.`
                    : ` You work for ${tenantSettings.company_name}.`;
            }
            if (tenantSettings.tone === 'formal') {
                prompt += lang === 'tr' ? ' Resmi ve profesyonel bir dil kullan.' : ' Use formal, professional language.';
            } else {
                prompt += lang === 'tr' ? ' Samimi ve yaklaşılabilir bir ton kullan.' : ' Use a friendly, approachable tone.';
            }
            if (tenantSettings.forbidden_topics) {
                prompt += lang === 'tr'
                    ? ` Şu konulardan asla bahsetme: ${tenantSettings.forbidden_topics}.`
                    : ` Never discuss: ${tenantSettings.forbidden_topics}.`;
            }
            if (tenantSettings.escalation_rules) {
                prompt += ` Escalation rules: ${tenantSettings.escalation_rules}`;
            }
        }
        return prompt;
    }
}

// ─── Unified LLM Streaming Interface ─────────────────────

class LlmStreamingService {
    constructor() {
        this._engine = process.env.OPENAI_API_KEY
            ? new OpenAiLlmEngine(process.env.OPENAI_API_KEY)
            : new LocalLlmEngine();

        this._provider = process.env.OPENAI_API_KEY ? 'openai' : 'local';
        logger.info('LLM streaming service initialized', { provider: this._provider });
    }

    get provider() { return this._provider; }

    /**
     * Stream a response to user input.
     * @param {string} userMessage - User's transcribed speech
     * @param {object} tenantSettings - From tenant_settings table
     * @param {string} memoryContext - Formatted conversation history
     * @param {function} onChunk - Called with (sentenceText, isFinal)
     * @param {string} [language] - Optional language override ('en' or 'tr')
     * @returns {Promise<{intent, totalTokens, response}>}
     */
    async streamResponse(userMessage, tenantSettings, memoryContext, onChunk, language) {
        return this._engine.streamResponse(userMessage, tenantSettings, memoryContext, onChunk, language);
    }
}

const service = new LlmStreamingService();
service.LocalLlmEngine = LocalLlmEngine;
service.OpenAiLlmEngine = OpenAiLlmEngine;
module.exports = service;
