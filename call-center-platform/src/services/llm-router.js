/**
 * LLM Router — Phase 14 Hybrid LLM Strategy
 * 
 * Routes requests to the optimal LLM engine based on:
 *   - Detected intent (simple → local, complex → OpenAI)
 *   - Token budget remaining
 *   - Provider health (circuit breaker state)
 * 
 * Simple intents: greeting, appointment, complaint, pricing, farewell
 *   → Local engine (0ms latency, zero cost)
 * 
 * Complex intents: technical, multi-step reasoning, unknown
 *   → OpenAI GPT-4o (high accuracy)
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'llm-router' });

const SIMPLE_INTENTS = new Set([
    'greeting', 'farewell', 'appointment', 'complaint',
    'pricing', 'hours', 'status', 'thanks'
]);

const COMPLEX_INDICATORS = [
    'explain', 'why', 'how does', 'compare', 'difference between',
    'step by step', 'detailed', 'debug', 'troubleshoot',
    'integrate', 'configure', 'custom', 'advanced', 'technical'
];

class LlmRouter {
    constructor() {
        this._localEngine = null;
        this._openAiEngine = null;
        this._costControl = null;
        this._circuitBreaker = null;
        this._initialized = false;
    }

    /**
     * Lazy initialization to avoid circular dependencies.
     */
    _init() {
        if (this._initialized) return;

        const { LocalLlmEngine, OpenAiLlmEngine } = require('./llm.streaming');
        this._localEngine = new LocalLlmEngine();

        if (process.env.OPENAI_API_KEY) {
            this._openAiEngine = new OpenAiLlmEngine(process.env.OPENAI_API_KEY);
        }

        try {
            this._costControl = require('./cost-control');
        } catch (e) { /* optional dependency */ }

        try {
            this._circuitBreaker = require('../utils/circuit-breaker');
        } catch (e) { /* optional dependency */ }

        this._initialized = true;
        logger.info('LLM Router initialized', {
            hasOpenAi: !!this._openAiEngine,
            hasCostControl: !!this._costControl
        });
    }

    /**
     * Route a request to the optimal LLM engine.
     * @param {string} userMessage - User's message
     * @param {object} tenantSettings - Tenant configuration
     * @param {string} memoryContext - Conversation memory
     * @param {function} onChunk - Streaming callback
     * @param {string} language - Language code
     * @param {object} options - Additional routing options
     * @returns {Promise<{intent, totalTokens, response, provider, routeReason}>}
     */
    async route(userMessage, tenantSettings, memoryContext, onChunk, language, options = {}) {
        this._init();

        const intent = this._detectIntent(userMessage);
        const complexity = this._assessComplexity(userMessage);
        const tenantId = tenantSettings?.company_name || 'unknown';

        // Determine routing decision
        let provider = 'local';
        let routeReason = 'default_local';
        let engine = this._localEngine;

        // Check cost control first
        if (this._costControl) {
            const budget = this._costControl.checkBudget(
                tenantSettings?.tenant_id || tenantId,
                'tokens'
            );
            if (budget.exceeded) {
                provider = 'local';
                routeReason = 'budget_exceeded';
                engine = this._localEngine;
                logger.warn('Budget exceeded, forcing local engine', { tenantId });
                metrics.inc('llm_route_decisions', { provider, reason: routeReason });

                const result = await engine.streamResponse(
                    userMessage, tenantSettings, memoryContext, onChunk, language
                );
                return { ...result, provider, routeReason };
            }
            if (budget.degraded) {
                provider = 'local';
                routeReason = 'budget_degraded';
                engine = this._localEngine;
            }
        }

        // Route based on intent + complexity
        if (this._openAiEngine && routeReason === 'default_local') {
            if (!SIMPLE_INTENTS.has(intent) || complexity === 'high') {
                // Check circuit breaker for OpenAI
                if (this._circuitBreaker) {
                    const breaker = this._circuitBreaker.getBreaker('openai_llm');
                    if (breaker && !breaker.isAvailable()) {
                        provider = 'local';
                        routeReason = 'circuit_open';
                    } else {
                        provider = 'openai';
                        routeReason = `complex_intent:${intent}`;
                        engine = this._openAiEngine;
                    }
                } else {
                    provider = 'openai';
                    routeReason = `complex_intent:${intent}`;
                    engine = this._openAiEngine;
                }
            } else {
                routeReason = `simple_intent:${intent}`;
            }
        }

        // Forced provider override
        if (options.forceProvider === 'local') {
            provider = 'local';
            engine = this._localEngine;
            routeReason = 'forced_local';
        } else if (options.forceProvider === 'openai' && this._openAiEngine) {
            provider = 'openai';
            engine = this._openAiEngine;
            routeReason = 'forced_openai';
        }

        // Record routing decision
        metrics.inc('llm_route_decisions', { provider, reason: routeReason.split(':')[0] });
        logger.info('LLM routed', { tenantId, provider, routeReason, intent, complexity });

        // Execute with failover
        try {
            const result = await engine.streamResponse(
                userMessage, tenantSettings, memoryContext, onChunk, language
            );

            metrics.inc('llm_route_success', { provider });
            return { ...result, provider, routeReason };

        } catch (error) {
            logger.error('Primary engine failed, falling back', {
                provider, error: error.message
            });
            metrics.inc('llm_route_failures', { provider });

            // Failover to local
            if (provider !== 'local') {
                const result = await this._localEngine.streamResponse(
                    userMessage, tenantSettings, memoryContext, onChunk, language
                );
                metrics.inc('llm_route_fallbacks', { from: provider, to: 'local' });
                return { ...result, provider: 'local', routeReason: 'failover_from_' + provider };
            }

            throw error;
        }
    }

    /**
     * Detect intent from user message.
     */
    _detectIntent(message) {
        try {
            const aiService = require('./ai.service');
            return aiService.detectIntent(message);
        } catch (e) {
            return this._simpleIntentDetect(message);
        }
    }

    /**
     * Fallback intent detection.
     */
    _simpleIntentDetect(message) {
        const lower = message.toLowerCase();
        if (/\b(hi|hello|hey|merhaba|selam)\b/i.test(lower)) return 'greeting';
        if (/\b(bye|goodbye|thanks|thank you|teşekkür)\b/i.test(lower)) return 'farewell';
        if (/\b(appointment|schedule|book|randevu)\b/i.test(lower)) return 'appointment';
        if (/\b(complaint|complain|unhappy|şikayet)\b/i.test(lower)) return 'complaint';
        if (/\b(price|pricing|cost|how much|fiyat|ücret)\b/i.test(lower)) return 'pricing';
        return 'other';
    }

    /**
     * Assess message complexity.
     * @returns {'low'|'medium'|'high'}
     */
    _assessComplexity(message) {
        const wordCount = message.split(/\s+/).length;
        const hasComplexIndicator = COMPLEX_INDICATORS.some(ind =>
            message.toLowerCase().includes(ind)
        );
        const hasMultipleQuestions = (message.match(/\?/g) || []).length > 1;

        if (hasComplexIndicator || hasMultipleQuestions || wordCount > 30) return 'high';
        if (wordCount > 15) return 'medium';
        return 'low';
    }

    /**
     * Get routing statistics.
     */
    getStats() {
        return {
            local_routes: metrics.getCounter('llm_route_decisions', { provider: 'local' }),
            openai_routes: metrics.getCounter('llm_route_decisions', { provider: 'openai' }),
            successes: {
                local: metrics.getCounter('llm_route_success', { provider: 'local' }),
                openai: metrics.getCounter('llm_route_success', { provider: 'openai' })
            },
            failures: {
                local: metrics.getCounter('llm_route_failures', { provider: 'local' }),
                openai: metrics.getCounter('llm_route_failures', { provider: 'openai' })
            },
            fallbacks: metrics.getCounter('llm_route_fallbacks', { from: 'openai', to: 'local' })
        };
    }
}

module.exports = new LlmRouter();
