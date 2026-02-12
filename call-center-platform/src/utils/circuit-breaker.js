/**
 * Circuit Breaker — Phase 17 Reliability Layer
 * 
 * Protects against cascading failures in external provider calls.
 * 
 * States:
 *   CLOSED  → Normal operation, requests pass through
 *   OPEN    → Failures exceeded threshold, requests fast-fail
 *   HALF_OPEN → Testing recovery, limited requests allowed
 * 
 * Configurable per-provider thresholds.
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('../services/metrics.service');

const logger = rootLogger.child({ component: 'circuit-breaker' });

const STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' };

const DEFAULT_OPTIONS = {
    failureThreshold: 5,       // Failures before opening
    resetTimeout: 30000,       // Time in OPEN before trying HALF_OPEN (ms)
    halfOpenMax: 2,            // Max requests in HALF_OPEN
    successThresholdToClose: 2 // Successes in HALF_OPEN to close
};

class CircuitBreaker {
    /**
     * @param {string} name - Provider name (e.g., 'openai_llm')
     * @param {object} [options]
     */
    constructor(name, options = {}) {
        this.name = name;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.state = STATE.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.halfOpenRequests = 0;
        this.lastFailureTime = 0;
        this.lastStateChange = Date.now();
    }

    /**
     * Check if this breaker allows requests.
     */
    isAvailable() {
        if (this.state === STATE.CLOSED) return true;

        if (this.state === STATE.OPEN) {
            // Check if reset timeout has elapsed
            if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
                this._transition(STATE.HALF_OPEN);
                return true;
            }
            return false;
        }

        if (this.state === STATE.HALF_OPEN) {
            return this.halfOpenRequests < this.options.halfOpenMax;
        }

        return false;
    }

    /**
     * Record a successful call.
     */
    recordSuccess() {
        if (this.state === STATE.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.options.successThresholdToClose) {
                this._transition(STATE.CLOSED);
            }
        } else if (this.state === STATE.CLOSED) {
            // Reset failure count on success
            this.failures = Math.max(0, this.failures - 1);
        }

        metrics.inc('circuit_breaker_success', { provider: this.name });
    }

    /**
     * Record a failed call.
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        metrics.inc('circuit_breaker_failure', { provider: this.name });

        if (this.state === STATE.HALF_OPEN) {
            this._transition(STATE.OPEN);
        } else if (this.state === STATE.CLOSED) {
            if (this.failures >= this.options.failureThreshold) {
                this._transition(STATE.OPEN);
            }
        }
    }

    /**
     * Execute a function with circuit breaker protection.
     * @param {Function} fn - Async function to execute
     * @param {Function} [fallback] - Fallback function if circuit is open
     * @returns {Promise<any>}
     */
    async execute(fn, fallback) {
        if (!this.isAvailable()) {
            logger.warn('Circuit OPEN, using fallback', { provider: this.name });
            metrics.inc('circuit_breaker_rejected', { provider: this.name });

            if (fallback) return fallback();
            throw new Error(`Circuit breaker OPEN for ${this.name}`);
        }

        if (this.state === STATE.HALF_OPEN) {
            this.halfOpenRequests++;
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure();
            if (fallback) {
                logger.warn('Call failed, using fallback', {
                    provider: this.name, error: error.message
                });
                return fallback();
            }
            throw error;
        }
    }

    /**
     * Get current breaker status.
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
            lastStateChange: new Date(this.lastStateChange).toISOString(),
            config: this.options
        };
    }

    _transition(newState) {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = Date.now();

        if (newState === STATE.CLOSED) {
            this.failures = 0;
            this.successes = 0;
            this.halfOpenRequests = 0;
        }
        if (newState === STATE.HALF_OPEN) {
            this.halfOpenRequests = 0;
            this.successes = 0;
        }

        logger.info('Circuit breaker state change', {
            provider: this.name, oldState, newState
        });
        metrics.inc('circuit_breaker_transitions', {
            provider: this.name, from: oldState, to: newState
        });
    }
}

// ─── Breaker Registry ────────────────────────────────────

const breakers = {};

/**
 * Get or create a circuit breaker for a provider.
 * @param {string} name
 * @param {object} [options]
 * @returns {CircuitBreaker}
 */
function getBreaker(name, options = {}) {
    if (!breakers[name]) {
        breakers[name] = new CircuitBreaker(name, options);
    }
    return breakers[name];
}

/**
 * Get status of all breakers.
 */
function getAllStatus() {
    return Object.values(breakers).map(b => b.getStatus());
}

/**
 * Reset a breaker (for testing).
 */
function resetBreaker(name) {
    if (breakers[name]) {
        breakers[name]._transition(STATE.CLOSED);
    }
}

module.exports = { CircuitBreaker, getBreaker, getAllStatus, resetBreaker, STATE };
