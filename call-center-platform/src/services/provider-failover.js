/**
 * Provider Failover — Phase 17 Reliability Layer
 * 
 * Wraps STT/LLM/TTS providers with:
 *   - Retry with exponential backoff
 *   - Circuit breaker integration
 *   - Automatic fallback to local engines
 *   - Graceful degradation to text-only mode
 * 
 * Tracks provider health and failover events.
 */
const { getBreaker, getAllStatus } = require('../utils/circuit-breaker');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'failover' });

const DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    baseDelay: 100,   // ms
    maxDelay: 5000,    // ms
    backoffFactor: 2
};

class ProviderFailover {
    constructor() {
        this._providerHealth = {};
    }

    /**
     * Execute with retry and fallback.
     * @param {string} providerName - e.g. 'openai_llm', 'deepgram_stt'
     * @param {Function} primaryFn - Primary provider function
     * @param {Function} fallbackFn - Fallback provider function
     * @param {object} [retryOptions]
     * @returns {Promise<{result: any, provider: string, retries: number}>}
     */
    async executeWithFallback(providerName, primaryFn, fallbackFn, retryOptions = {}) {
        const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
        const breaker = getBreaker(providerName, {
            failureThreshold: 5,
            resetTimeout: 30000
        });

        // Try primary with circuit breaker
        try {
            const result = await breaker.execute(
                () => this._retryWithBackoff(primaryFn, opts, providerName),
                null // Don't use breaker's fallback, we handle it below
            );

            this._updateHealth(providerName, true);
            return { result, provider: providerName, retries: 0 };

        } catch (primaryError) {
            logger.warn('Primary provider failed, trying fallback', {
                provider: providerName,
                error: primaryError.message
            });
            metrics.inc('provider_failover_total', { from: providerName });

            // Try fallback
            if (fallbackFn) {
                try {
                    const result = await fallbackFn();
                    this._updateHealth(providerName, false);
                    return { result, provider: `${providerName}_fallback`, retries: 0 };
                } catch (fallbackError) {
                    logger.error('Fallback also failed', {
                        provider: providerName,
                        error: fallbackError.message
                    });
                    metrics.inc('provider_failover_exhausted', { provider: providerName });
                    throw fallbackError;
                }
            }

            throw primaryError;
        }
    }

    /**
     * Retry with exponential backoff.
     */
    async _retryWithBackoff(fn, opts, providerName) {
        let lastError;

        for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
            try {
                const result = await fn();
                if (attempt > 0) {
                    metrics.inc('provider_retry_success', {
                        provider: providerName, attempt: String(attempt)
                    });
                }
                return result;
            } catch (error) {
                lastError = error;

                if (attempt < opts.maxRetries) {
                    const delay = Math.min(
                        opts.baseDelay * Math.pow(opts.backoffFactor, attempt),
                        opts.maxDelay
                    );
                    const jitter = delay * (0.5 + Math.random() * 0.5);

                    logger.warn('Retrying provider call', {
                        provider: providerName,
                        attempt: attempt + 1,
                        maxRetries: opts.maxRetries,
                        delayMs: Math.round(jitter)
                    });
                    metrics.inc('provider_retries', { provider: providerName });

                    await new Promise(resolve => setTimeout(resolve, jitter));
                }
            }
        }

        throw lastError;
    }

    /**
     * Check if a provider is healthy.
     */
    isHealthy(providerName) {
        const health = this._providerHealth[providerName];
        if (!health) return true; // Unknown = assume healthy
        return health.healthy;
    }

    /**
     * Get health status for all providers.
     */
    getHealthStatus() {
        const circuitBreakers = getAllStatus();
        return {
            providers: this._providerHealth,
            circuitBreakers,
            textOnlyMode: this._isTextOnlyMode()
        };
    }

    /**
     * Check if system should degrade to text-only mode.
     * Text-only when both STT and TTS are unavailable.
     */
    _isTextOnlyMode() {
        const sttHealth = this._providerHealth['deepgram_stt'];
        const ttsHealth = this._providerHealth['elevenlabs_tts'];

        // Only enter text-only mode if external providers are configured AND failing
        return (sttHealth?.healthy === false) || (ttsHealth?.healthy === false);
    }

    _updateHealth(providerName, success) {
        if (!this._providerHealth[providerName]) {
            this._providerHealth[providerName] = {
                healthy: true,
                consecutiveFailures: 0,
                lastSuccess: null,
                lastFailure: null,
                totalSuccesses: 0,
                totalFailures: 0
            };
        }

        const h = this._providerHealth[providerName];

        if (success) {
            h.healthy = true;
            h.consecutiveFailures = 0;
            h.lastSuccess = new Date().toISOString();
            h.totalSuccesses++;
        } else {
            h.consecutiveFailures++;
            h.lastFailure = new Date().toISOString();
            h.totalFailures++;
            if (h.consecutiveFailures >= 3) {
                h.healthy = false;
            }
        }
    }
}

module.exports = new ProviderFailover();
