/**
 * Webhook Retry System — Unit Tests
 *
 * Tests retry delay calculation, processRetry logic, and queue management.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

import {
    calculateNextRetryAt,
    processRetry,
    signPayload,
} from '@/lib/webhook/dispatcher';
import {
    RETRY_DELAYS_SEC,
    MAX_RETRY_ATTEMPTS,
    type WebhookRetryRecord,
    type WebhookPayload,
} from '@/lib/webhook/types';

// ─── Retry Delay Calculation ────────────────────────────────────────────────

describe('Webhook Retry System', () => {
    describe('calculateNextRetryAt()', () => {
        it('returns correct delay for attempt 0 (60s)', () => {
            const before = Date.now();
            const result = new Date(calculateNextRetryAt(0)).getTime();
            const after = Date.now();

            // Should be ~60 seconds in the future
            expect(result - before).toBeGreaterThanOrEqual(59_000);
            expect(result - after).toBeLessThanOrEqual(61_000);
        });

        it('returns correct delay for attempt 1 (300s / 5min)', () => {
            const before = Date.now();
            const result = new Date(calculateNextRetryAt(1)).getTime();

            expect(result - before).toBeGreaterThanOrEqual(299_000);
            expect(result - before).toBeLessThanOrEqual(301_000);
        });

        it('returns correct delay for attempt 2 (900s / 15min)', () => {
            const before = Date.now();
            const result = new Date(calculateNextRetryAt(2)).getTime();

            expect(result - before).toBeGreaterThanOrEqual(899_000);
            expect(result - before).toBeLessThanOrEqual(901_000);
        });

        it('returns correct delay for attempt 3 (3600s / 1h)', () => {
            const before = Date.now();
            const result = new Date(calculateNextRetryAt(3)).getTime();

            expect(result - before).toBeGreaterThanOrEqual(3599_000);
            expect(result - before).toBeLessThanOrEqual(3601_000);
        });

        it('returns correct delay for attempt 4 (14400s / 4h)', () => {
            const before = Date.now();
            const result = new Date(calculateNextRetryAt(4)).getTime();

            expect(result - before).toBeGreaterThanOrEqual(14399_000);
            expect(result - before).toBeLessThanOrEqual(14401_000);
        });

        it('uses last delay for attempts beyond max', () => {
            const before = Date.now();
            const result = new Date(calculateNextRetryAt(10)).getTime();
            const lastDelay = RETRY_DELAYS_SEC[RETRY_DELAYS_SEC.length - 1];

            expect(result - before).toBeGreaterThanOrEqual((lastDelay - 1) * 1000);
            expect(result - before).toBeLessThanOrEqual((lastDelay + 1) * 1000);
        });

        it('returns a valid ISO string', () => {
            const result = calculateNextRetryAt(0);
            expect(() => new Date(result)).not.toThrow();
            expect(new Date(result).toISOString()).toBe(result);
        });
    });

    // ─── Constants ──────────────────────────────────────────────────────────

    describe('Retry Constants', () => {
        it('has 5 retry delay entries', () => {
            expect(RETRY_DELAYS_SEC.length).toBe(5);
        });

        it('MAX_RETRY_ATTEMPTS equals delay count', () => {
            expect(MAX_RETRY_ATTEMPTS).toBe(RETRY_DELAYS_SEC.length);
        });

        it('delays are in ascending order', () => {
            for (let i = 1; i < RETRY_DELAYS_SEC.length; i++) {
                expect(RETRY_DELAYS_SEC[i]).toBeGreaterThan(RETRY_DELAYS_SEC[i - 1]);
            }
        });

        it('delays are: 1m, 5m, 15m, 1h, 4h', () => {
            expect(RETRY_DELAYS_SEC[0]).toBe(60);
            expect(RETRY_DELAYS_SEC[1]).toBe(300);
            expect(RETRY_DELAYS_SEC[2]).toBe(900);
            expect(RETRY_DELAYS_SEC[3]).toBe(3600);
            expect(RETRY_DELAYS_SEC[4]).toBe(14400);
        });
    });

    // ─── processRetry() ─────────────────────────────────────────────────────

    describe('processRetry()', () => {
        let fetchSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            fetchSpy = vi.spyOn(globalThis, 'fetch');
        });

        afterEach(() => {
            fetchSpy?.mockRestore();
        });

        it('marks as delivered on successful retry', async () => {
            fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

            const { db, retryRef, webhookRef } = mockRetryFirestore();
            const record = makeRetryRecord({ attemptNumber: 1 });

            const result = await processRetry(db, record);

            expect(result.success).toBe(true);
            expect(retryRef.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'delivered' }),
            );
            // Should also reset webhook failure count
            expect(webhookRef.update).toHaveBeenCalledWith(
                expect.objectContaining({ failureCount: 0 }),
            );
        });

        it('reschedules on failed retry (not max attempts)', async () => {
            fetchSpy.mockResolvedValue(new Response('Server Error', { status: 500 }));

            const { db, retryRef } = mockRetryFirestore();
            const record = makeRetryRecord({ attemptNumber: 1 });

            const result = await processRetry(db, record);

            expect(result.success).toBe(false);
            expect(result.error).toBe('HTTP 500');
            expect(retryRef.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    attemptNumber: 2,
                    lastError: 'HTTP 500',
                }),
            );
        });

        it('marks as failed when max retries exhausted', async () => {
            fetchSpy.mockResolvedValue(new Response('Server Error', { status: 500 }));

            const { db, retryRef } = mockRetryFirestore();
            // attemptNumber 4 → next would be 5 which equals MAX_RETRY_ATTEMPTS
            const record = makeRetryRecord({ attemptNumber: MAX_RETRY_ATTEMPTS - 1 });

            const result = await processRetry(db, record);

            expect(result.success).toBe(false);
            expect(retryRef.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'failed' }),
            );
        });

        it('handles network errors gracefully', async () => {
            fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

            const { db, retryRef } = mockRetryFirestore();
            const record = makeRetryRecord({ attemptNumber: 0 });

            const result = await processRetry(db, record);

            expect(result.success).toBe(false);
            expect(result.error).toBe('ECONNREFUSED');
            expect(retryRef.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    attemptNumber: 1,
                    lastError: 'ECONNREFUSED',
                }),
            );
        });

        it('sends correct headers including X-Webhook-Retry', async () => {
            fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

            const { db } = mockRetryFirestore();
            const record = makeRetryRecord({ attemptNumber: 2 });

            await processRetry(db, record);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [url, opts] = fetchSpy.mock.calls[0];
            expect(url).toBe(record.url);

            const headers = opts?.headers as Record<string, string>;
            expect(headers['X-Webhook-Retry']).toBe('3'); // attemptNumber + 1
            expect(headers['X-Webhook-Signature']).toMatch(/^sha256=/);
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['User-Agent']).toBe('Callception-Webhook/1.0');
        });

        it('sends correct payload body', async () => {
            fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

            const { db } = mockRetryFirestore();
            const payload = makePayload();
            const record = makeRetryRecord({ payload });

            await processRetry(db, record);

            const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
            expect(body.event).toBe(payload.event);
            expect(body.eventId).toBe(payload.eventId);
            expect(body.tenantId).toBe(payload.tenantId);
        });

        it('verifies HMAC signature is correct', async () => {
            fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

            const { db } = mockRetryFirestore();
            const record = makeRetryRecord();

            await processRetry(db, record);

            const body = fetchSpy.mock.calls[0][1]?.body as string;
            const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
            const sentSignature = headers['X-Webhook-Signature'].replace('sha256=', '');
            const expectedSignature = signPayload(body, record.secret);

            expect(sentSignature).toBe(expectedSignature);
        });

        it('logs delivery attempt to webhook_logs', async () => {
            fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

            const { db, logsAdd } = mockRetryFirestore();
            const record = makeRetryRecord();

            await processRetry(db, record);

            expect(logsAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    webhookId: record.webhookId,
                    eventId: record.payload.eventId,
                    event: record.event,
                    success: true,
                }),
            );
        });
    });
});

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makePayload(overrides?: Partial<WebhookPayload>): WebhookPayload {
    return {
        event: 'call.completed',
        eventId: 'evt-test-123',
        timestamp: '2025-06-01T10:00:00Z',
        tenantId: 'tenant-1',
        data: { callId: 'call-456' },
        ...overrides,
    };
}

function makeRetryRecord(
    overrides?: Partial<WebhookRetryRecord & { id: string }>,
): WebhookRetryRecord & { id: string } {
    return {
        id: 'retry-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        url: 'https://example.com/webhook',
        secret: 'whsec_testsecret',
        event: 'call.completed',
        payload: makePayload(),
        attemptNumber: 0,
        nextRetryAt: '2025-06-01T10:01:00Z',
        status: 'pending',
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
        ...overrides,
    };
}

function mockRetryFirestore() {
    const retryRef = { update: vi.fn().mockResolvedValue(undefined) };
    const webhookRef = { update: vi.fn().mockResolvedValue(undefined) };
    const logsAdd = vi.fn().mockResolvedValue({ id: 'log-1' });

    const db = {
        collection: vi.fn((name: string) => {
            if (name === 'webhook_retry_queue') {
                return {
                    doc: vi.fn().mockReturnValue(retryRef),
                    add: vi.fn().mockResolvedValue({ id: 'retry-new' }),
                };
            }
            if (name === 'tenants') {
                return {
                    doc: vi.fn().mockReturnValue({
                        collection: vi.fn((sub: string) => {
                            if (sub === 'webhooks') {
                                return { doc: vi.fn().mockReturnValue(webhookRef) };
                            }
                            if (sub === 'webhook_logs') {
                                return { add: logsAdd };
                            }
                            return {};
                        }),
                    }),
                };
            }
            return {};
        }),
    } as unknown as FirebaseFirestore.Firestore;

    return { db, retryRef, webhookRef, logsAdd };
}
