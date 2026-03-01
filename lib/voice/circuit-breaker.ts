/**
 * Circuit Breaker — Resilience Pattern for GPU/External Service Calls
 *
 * State Machine: CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * CLOSED:    Normal operation. Requests pass through. Failures counted.
 * OPEN:      Service deemed unhealthy. Requests rejected immediately.
 *            After timeout, transitions to HALF_OPEN.
 * HALF_OPEN: Allows ONE test request. Success → CLOSED, Failure → OPEN.
 *
 * Emits events for monitoring/alerting integration.
 */

import { logger } from '@/lib/utils/logger';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
    /** Number of consecutive failures before opening circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery (OPEN → HALF_OPEN) */
    resetTimeout: number;
    /** Name for logging */
    name: string;
    /** Optional: time window for failure counting (sliding window) */
    failureWindowMs?: number;
}

export interface CircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    openCount: number;
}

type CircuitEventHandler = (data: {
    state: CircuitState;
    previousState: CircuitState;
    error?: Error;
    stats: CircuitBreakerStats;
}) => void;

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 3,
    resetTimeout: 30_000, // 30 seconds
    name: 'default',
    failureWindowMs: 60_000, // 1 minute sliding window
};

export class CircuitBreaker {
    private state: CircuitState = 'closed';
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureTime: number | null = null;
    private lastSuccessTime: number | null = null;
    private failureTimestamps: number[] = [];

    // Lifetime counters
    private totalRequests = 0;
    private totalFailures = 0;
    private totalSuccesses = 0;
    private openCount = 0;

    private config: CircuitBreakerConfig;
    private listeners: Map<string, CircuitEventHandler[]> = new Map();

    constructor(config: Partial<CircuitBreakerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Execute a function through the circuit breaker.
     * If the circuit is OPEN, throws immediately with CircuitOpenError.
     * If HALF_OPEN, allows one test request.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        this.totalRequests++;

        // Check state
        if (this.state === 'open') {
            // Check if we should transition to half_open
            if (this.shouldAttemptRecovery()) {
                this.transitionTo('half_open');
            } else {
                throw new CircuitOpenError(
                    `Circuit breaker [${this.config.name}] is OPEN. Service unavailable.`,
                    this.getStats(),
                );
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Execute with a fallback function when circuit is open.
     */
    async executeWithFallback<T>(
        fn: () => Promise<T>,
        fallback: (error: Error) => T | Promise<T>,
    ): Promise<T> {
        try {
            return await this.execute(fn);
        } catch (error) {
            if (error instanceof CircuitOpenError) {
                console.warn(`[CircuitBreaker:${this.config.name}] Using fallback — circuit OPEN`);
                return fallback(error);
            }
            // For non-circuit errors, also use fallback
            return fallback(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private onSuccess(): void {
        this.successes++;
        this.totalSuccesses++;
        this.lastSuccessTime = Date.now();

        if (this.state === 'half_open') {
            // Recovery confirmed
            this.failures = 0;
            this.failureTimestamps = [];
            this.transitionTo('closed');
        } else {
            // Reset failure count on success in closed state
            this.failures = 0;
        }
    }

    private onFailure(error: Error): void {
        const now = Date.now();
        this.failures++;
        this.totalFailures++;
        this.lastFailureTime = now;
        this.failureTimestamps.push(now);

        // Clean old timestamps outside the sliding window
        if (this.config.failureWindowMs) {
            const cutoff = now - this.config.failureWindowMs;
            this.failureTimestamps = this.failureTimestamps.filter(t => t > cutoff);
        }

        const activeFailures = this.config.failureWindowMs
            ? this.failureTimestamps.length
            : this.failures;

        if (this.state === 'half_open') {
            // Recovery failed, reopen
            this.transitionTo('open', error);
        } else if (activeFailures >= this.config.failureThreshold) {
            this.transitionTo('open', error);
        }
    }

    private shouldAttemptRecovery(): boolean {
        if (!this.lastFailureTime) return true;
        return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
    }

    private transitionTo(newState: CircuitState, error?: Error): void {
        const previousState = this.state;
        if (previousState === newState) return;

        this.state = newState;

        if (newState === 'open') {
            this.openCount++;
        }

        logger.debug(
            `[CircuitBreaker:${this.config.name}] ${previousState} → ${newState}` +
            (error ? ` (${error.message})` : ''),
        );

        this.emit('stateChange', {
            state: newState,
            previousState,
            error,
            stats: this.getStats(),
        });
    }

    // --- Event System ---

    on(event: string, handler: CircuitEventHandler): void {
        const handlers = this.listeners.get(event) || [];
        handlers.push(handler);
        this.listeners.set(event, handlers);
    }

    private emit(event: string, data: Parameters<CircuitEventHandler>[0]): void {
        const handlers = this.listeners.get(event) || [];
        for (const handler of handlers) {
            try {
                handler(data);
            } catch {
                // Don't let listener errors break the circuit breaker
            }
        }
    }

    // --- Public Getters ---

    getState(): CircuitState { return this.state; }
    isOpen(): boolean { return this.state === 'open'; }
    isClosed(): boolean { return this.state === 'closed'; }

    getStats(): CircuitBreakerStats {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
            totalSuccesses: this.totalSuccesses,
            openCount: this.openCount,
        };
    }

    /** Force reset (for admin/testing) */
    reset(): void {
        this.transitionTo('closed');
        this.failures = 0;
        this.failureTimestamps = [];
    }
}

/**
 * Custom error thrown when the circuit is OPEN.
 * Contains stats for the caller to make decisions.
 */
export class CircuitOpenError extends Error {
    public readonly stats: CircuitBreakerStats;

    constructor(message: string, stats: CircuitBreakerStats) {
        super(message);
        this.name = 'CircuitOpenError';
        this.stats = stats;
    }
}

// ============================================
// Singleton Instances for Voice Pipeline
// ============================================

/** Circuit breaker for Personaplex GPU calls */
export const gpuCircuitBreaker = new CircuitBreaker({
    name: 'personaplex-gpu',
    failureThreshold: 3,
    resetTimeout: 30_000,  // 30s before retry
    failureWindowMs: 60_000, // 1 min sliding window
});

/** Circuit breaker for OpenAI API calls */
export const openaiCircuitBreaker = new CircuitBreaker({
    name: 'openai-api',
    failureThreshold: 5,
    resetTimeout: 15_000,  // 15s (OpenAI recovers faster)
    failureWindowMs: 120_000,
});

/** Circuit breaker for ElevenLabs TTS calls */
export const ttsCircuitBreaker = new CircuitBreaker({
    name: 'elevenlabs-tts',
    failureThreshold: 3,
    resetTimeout: 20_000,
    failureWindowMs: 60_000,
});
