/**
 * Unit Tests — CircuitBreaker
 *
 * Tests the full state machine (CLOSED → OPEN → HALF_OPEN → CLOSED),
 * failure counting with sliding window, fallback execution, event system,
 * stats tracking, and force reset.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';
import type { CircuitBreakerStats, CircuitState } from '@/lib/voice/circuit-breaker';

// ── Mock logger ──

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
        })),
    },
}));

// ── Test Suite ──

describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
        vi.useFakeTimers();
        breaker = new CircuitBreaker({
            name: 'test-breaker',
            failureThreshold: 3,
            resetTimeout: 5000,
            failureWindowMs: 10_000,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── Helper ──

    async function failN(n: number): Promise<void> {
        for (let i = 0; i < n; i++) {
            try {
                await breaker.execute(async () => {
                    throw new Error(`failure-${i}`);
                });
            } catch {
                // expected
            }
        }
    }

    // ----------------------------------------------------------------
    // 1. Default state is CLOSED
    // ----------------------------------------------------------------

    it('should start in CLOSED state', () => {
        expect(breaker.getState()).toBe('closed');
        expect(breaker.isClosed()).toBe(true);
        expect(breaker.isOpen()).toBe(false);
    });

    // ----------------------------------------------------------------
    // 2. Successful execution returns result
    // ----------------------------------------------------------------

    it('should return the result of a successful execution', async () => {
        const result = await breaker.execute(async () => 42);
        expect(result).toBe(42);
    });

    it('should return complex objects from successful execution', async () => {
        const payload = { id: 'abc', items: [1, 2, 3] };
        const result = await breaker.execute(async () => payload);
        expect(result).toEqual(payload);
    });

    // ----------------------------------------------------------------
    // 3. Failed execution throws and counts failure
    // ----------------------------------------------------------------

    it('should rethrow the error from a failed execution', async () => {
        const error = new Error('service down');
        await expect(
            breaker.execute(async () => { throw error; }),
        ).rejects.toThrow('service down');
    });

    it('should count a single failure in stats', async () => {
        await failN(1);
        const stats = breaker.getStats();
        expect(stats.failures).toBe(1);
        expect(stats.totalFailures).toBe(1);
        expect(stats.state).toBe('closed');
    });

    // ----------------------------------------------------------------
    // 4. Opens after failureThreshold consecutive failures
    // ----------------------------------------------------------------

    it('should transition to OPEN after reaching failureThreshold failures', async () => {
        await failN(3);
        expect(breaker.getState()).toBe('open');
        expect(breaker.isOpen()).toBe(true);
        expect(breaker.isClosed()).toBe(false);
    });

    it('should remain CLOSED when failures are below the threshold', async () => {
        await failN(2);
        expect(breaker.getState()).toBe('closed');
    });

    // ----------------------------------------------------------------
    // 5. OPEN state throws CircuitOpenError immediately
    // ----------------------------------------------------------------

    it('should throw CircuitOpenError immediately when OPEN', async () => {
        await failN(3);
        expect(breaker.getState()).toBe('open');

        await expect(
            breaker.execute(async () => 'should not run'),
        ).rejects.toThrow(CircuitOpenError);
    });

    it('should not invoke the function when circuit is OPEN', async () => {
        await failN(3);

        const fn = vi.fn(async () => 'hello');
        try {
            await breaker.execute(fn);
        } catch {
            // expected
        }
        expect(fn).not.toHaveBeenCalled();
    });

    // ----------------------------------------------------------------
    // 6. CircuitOpenError contains stats
    // ----------------------------------------------------------------

    it('should include stats in the CircuitOpenError', async () => {
        await failN(3);

        try {
            await breaker.execute(async () => 'unreachable');
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CircuitOpenError);
            const circuitErr = err as CircuitOpenError;
            expect(circuitErr.stats).toBeDefined();
            expect(circuitErr.stats.state).toBe('open');
            expect(circuitErr.stats.totalFailures).toBe(3);
            expect(circuitErr.stats.openCount).toBe(1);
            expect(circuitErr.name).toBe('CircuitOpenError');
        }
    });

    // ----------------------------------------------------------------
    // 7. After resetTimeout, transitions to HALF_OPEN
    // ----------------------------------------------------------------

    it('should transition to HALF_OPEN after resetTimeout elapses', async () => {
        await failN(3);
        expect(breaker.getState()).toBe('open');

        // Advance time past resetTimeout (5000ms)
        vi.advanceTimersByTime(5000);

        // The next execute call should transition to half_open internally
        // and attempt the function. We provide a successful fn so it goes
        // through half_open and then to closed.
        const fn = vi.fn(async () => 'recovered');
        const result = await breaker.execute(fn);

        expect(fn).toHaveBeenCalledOnce();
        expect(result).toBe('recovered');
        // After success in half_open, it should be closed
        expect(breaker.getState()).toBe('closed');
    });

    it('should NOT transition to HALF_OPEN before resetTimeout elapses', async () => {
        await failN(3);
        expect(breaker.getState()).toBe('open');

        // Advance time but not enough
        vi.advanceTimersByTime(4999);

        await expect(
            breaker.execute(async () => 'too early'),
        ).rejects.toThrow(CircuitOpenError);
    });

    // ----------------------------------------------------------------
    // 8. HALF_OPEN success → CLOSED
    // ----------------------------------------------------------------

    it('should transition from HALF_OPEN to CLOSED on success', async () => {
        await failN(3);
        vi.advanceTimersByTime(5000);

        // Execute a successful request — triggers half_open → closed
        await breaker.execute(async () => 'ok');
        expect(breaker.getState()).toBe('closed');
        expect(breaker.isClosed()).toBe(true);
    });

    it('should reset failure count after HALF_OPEN → CLOSED recovery', async () => {
        await failN(3);
        vi.advanceTimersByTime(5000);

        await breaker.execute(async () => 'recovered');
        const stats = breaker.getStats();
        expect(stats.failures).toBe(0);
        expect(stats.state).toBe('closed');
    });

    // ----------------------------------------------------------------
    // 9. HALF_OPEN failure → back to OPEN
    // ----------------------------------------------------------------

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
        await failN(3);
        expect(breaker.getState()).toBe('open');

        vi.advanceTimersByTime(5000);

        // Fail during half_open test request
        try {
            await breaker.execute(async () => {
                throw new Error('still broken');
            });
        } catch {
            // expected
        }

        expect(breaker.getState()).toBe('open');
        expect(breaker.isOpen()).toBe(true);
    });

    it('should increment openCount when re-entering OPEN from HALF_OPEN', async () => {
        await failN(3); // openCount = 1
        vi.advanceTimersByTime(5000);

        try {
            await breaker.execute(async () => { throw new Error('nope'); });
        } catch {
            // expected
        }

        const stats = breaker.getStats();
        expect(stats.openCount).toBe(2);
    });

    // ----------------------------------------------------------------
    // 10. executeWithFallback returns fallback when OPEN
    // ----------------------------------------------------------------

    it('should return fallback result when circuit is OPEN', async () => {
        await failN(3);

        const result = await breaker.executeWithFallback(
            async () => 'primary',
            (_err) => 'fallback-value',
        );

        expect(result).toBe('fallback-value');
    });

    it('should pass CircuitOpenError to fallback when circuit is OPEN', async () => {
        await failN(3);

        const fallback = vi.fn((_err: Error) => 'fallback');
        await breaker.executeWithFallback(async () => 'x', fallback);

        expect(fallback).toHaveBeenCalledOnce();
        const receivedError = fallback.mock.calls[0][0];
        expect(receivedError).toBeInstanceOf(CircuitOpenError);
    });

    // ----------------------------------------------------------------
    // 11. executeWithFallback returns fallback on function error
    // ----------------------------------------------------------------

    it('should use fallback when the primary function throws (non-circuit error)', async () => {
        const result = await breaker.executeWithFallback(
            async () => { throw new Error('api-error'); },
            (err) => `recovered: ${err.message}`,
        );

        expect(result).toBe('recovered: api-error');
    });

    it('should invoke fallback with the original error on function failure', async () => {
        const fallback = vi.fn((_err: Error) => 'safe');
        await breaker.executeWithFallback(
            async () => { throw new Error('boom'); },
            fallback,
        );

        expect(fallback).toHaveBeenCalledOnce();
        expect(fallback.mock.calls[0][0].message).toBe('boom');
    });

    // ----------------------------------------------------------------
    // 12. Success resets failure counter
    // ----------------------------------------------------------------

    it('should reset failure counter to zero after a success', async () => {
        // Two failures (below threshold)
        await failN(2);
        expect(breaker.getStats().failures).toBe(2);

        // One success
        await breaker.execute(async () => 'ok');
        expect(breaker.getStats().failures).toBe(0);

        // Two more failures should not open (counter was reset)
        await failN(2);
        expect(breaker.getState()).toBe('closed');
    });

    // ----------------------------------------------------------------
    // 13. Event listener fires on state changes
    // ----------------------------------------------------------------

    it('should emit stateChange event when transitioning to OPEN', async () => {
        const handler = vi.fn();
        breaker.on('stateChange', handler);

        await failN(3);

        expect(handler).toHaveBeenCalledOnce();
        const eventData = handler.mock.calls[0][0];
        expect(eventData.state).toBe('open');
        expect(eventData.previousState).toBe('closed');
        expect(eventData.error).toBeInstanceOf(Error);
        expect(eventData.stats).toBeDefined();
        expect(eventData.stats.state).toBe('open');
    });

    it('should emit stateChange events through the full lifecycle', async () => {
        const handler = vi.fn();
        breaker.on('stateChange', handler);

        // closed → open
        await failN(3);
        // open → half_open → closed (after timeout + success)
        vi.advanceTimersByTime(5000);
        await breaker.execute(async () => 'ok');

        // Should have fired: closed→open, open→half_open, half_open→closed
        expect(handler).toHaveBeenCalledTimes(3);

        const states = handler.mock.calls.map(
            (call: [{ state: CircuitState; previousState: CircuitState }]) => ({
                from: call[0].previousState,
                to: call[0].state,
            }),
        );
        expect(states).toEqual([
            { from: 'closed', to: 'open' },
            { from: 'open', to: 'half_open' },
            { from: 'half_open', to: 'closed' },
        ]);
    });

    it('should not break circuit breaker if event listener throws', async () => {
        breaker.on('stateChange', () => {
            throw new Error('listener crashed');
        });

        await failN(3);
        expect(breaker.getState()).toBe('open');
    });

    // ----------------------------------------------------------------
    // 14. getStats returns correct counters
    // ----------------------------------------------------------------

    it('should return accurate stats after mixed operations', async () => {
        // 2 successes
        await breaker.execute(async () => 'a');
        await breaker.execute(async () => 'b');

        // 3 failures → opens
        await failN(3);

        const stats = breaker.getStats();
        expect(stats.state).toBe('open');
        expect(stats.totalRequests).toBe(5);
        expect(stats.totalSuccesses).toBe(2);
        expect(stats.totalFailures).toBe(3);
        expect(stats.successes).toBe(2);
        expect(stats.openCount).toBe(1);
        expect(stats.lastFailureTime).not.toBeNull();
        expect(stats.lastSuccessTime).not.toBeNull();
    });

    it('should report initial stats correctly', () => {
        const stats = breaker.getStats();
        expect(stats).toEqual({
            state: 'closed',
            failures: 0,
            successes: 0,
            lastFailureTime: null,
            lastSuccessTime: null,
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            openCount: 0,
        });
    });

    it('should count totalRequests including rejected OPEN requests', async () => {
        await failN(3); // 3 requests → opens

        try {
            await breaker.execute(async () => 'rejected');
        } catch {
            // expected CircuitOpenError
        }

        // The rejected request in OPEN state still increments totalRequests
        expect(breaker.getStats().totalRequests).toBe(4);
    });

    // ----------------------------------------------------------------
    // 15. reset() force resets
    // ----------------------------------------------------------------

    it('should force reset to CLOSED from OPEN', async () => {
        await failN(3);
        expect(breaker.getState()).toBe('open');

        breaker.reset();

        expect(breaker.getState()).toBe('closed');
        expect(breaker.isClosed()).toBe(true);
        expect(breaker.getStats().failures).toBe(0);
    });

    it('should allow normal operation after force reset', async () => {
        await failN(3);
        breaker.reset();

        const result = await breaker.execute(async () => 'works again');
        expect(result).toBe('works again');
        expect(breaker.getState()).toBe('closed');
    });

    it('should emit stateChange event on reset', async () => {
        await failN(3);

        const handler = vi.fn();
        breaker.on('stateChange', handler);

        breaker.reset();

        // Should fire open → closed
        const resetCall = handler.mock.calls.find(
            (call: [{ state: CircuitState }]) => call[0].state === 'closed',
        );
        expect(resetCall).toBeDefined();
        expect(resetCall![0].previousState).toBe('open');
    });

    it('should not emit stateChange when resetting from already CLOSED', () => {
        const handler = vi.fn();
        breaker.on('stateChange', handler);

        // Already closed, reset should be a no-op for the transition
        breaker.reset();
        expect(handler).not.toHaveBeenCalled();
    });

    // ----------------------------------------------------------------
    // 16. Sliding window: old failures outside failureWindowMs
    // ----------------------------------------------------------------

    it('should not count old failures outside the sliding window', async () => {
        // Fail twice at t=0
        await failN(2);
        expect(breaker.getState()).toBe('closed');

        // Advance past the failure window (10_000ms)
        vi.advanceTimersByTime(11_000);

        // One more failure — should NOT open because the first two are expired
        await failN(1);
        expect(breaker.getState()).toBe('closed');
    });

    it('should open if all failures are within the sliding window', async () => {
        await failN(1);
        vi.advanceTimersByTime(3000); // still within 10s window

        await failN(1);
        vi.advanceTimersByTime(3000); // still within 10s window

        await failN(1);

        expect(breaker.getState()).toBe('open');
    });

    it('should handle mixed timing: some failures expire, new ones accumulate', async () => {
        // Fail twice at t=0
        await failN(2);

        // Advance 9s (still within window)
        vi.advanceTimersByTime(9000);

        // Fail once more at t=9s — all 3 within window → should open
        await failN(1);
        expect(breaker.getState()).toBe('open');
    });

    it('should handle sliding window with interleaved successes', async () => {
        // Fail twice
        await failN(2);

        // Success resets failure counter and timestamps
        await breaker.execute(async () => 'ok');

        // Fail twice more (below threshold of 3)
        await failN(2);
        expect(breaker.getState()).toBe('closed');
    });
});
