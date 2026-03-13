/**
 * Webhook Dispatcher — Unit Tests
 *
 * Tests HMAC signing, verification, and dispatcher logic.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

import {
    signPayload,
    verifySignature,
    generateWebhookSecret,
    dispatchWebhookEvent,
} from '@/lib/webhook/dispatcher';
import type { WebhookConfig, WebhookEventType } from '@/lib/webhook/types';
import { WEBHOOK_EVENT_LABELS } from '@/lib/webhook/types';

describe('Webhook Dispatcher', () => {
    // ─── HMAC Signing ───────────────────────────────────────────────
    describe('signPayload()', () => {
        it('returns hex string', () => {
            const sig = signPayload('hello', 'secret');
            expect(sig).toMatch(/^[a-f0-9]{64}$/); // SHA-256 = 64 hex chars
        });

        it('produces consistent signatures for same input', () => {
            const sig1 = signPayload('{"event":"test"}', 'mysecret');
            const sig2 = signPayload('{"event":"test"}', 'mysecret');
            expect(sig1).toBe(sig2);
        });

        it('produces different signatures for different secrets', () => {
            const sig1 = signPayload('data', 'secret1');
            const sig2 = signPayload('data', 'secret2');
            expect(sig1).not.toBe(sig2);
        });

        it('produces different signatures for different payloads', () => {
            const sig1 = signPayload('data1', 'secret');
            const sig2 = signPayload('data2', 'secret');
            expect(sig1).not.toBe(sig2);
        });
    });

    // ─── Signature Verification ─────────────────────────────────────
    describe('verifySignature()', () => {
        it('returns true for valid signature', () => {
            const payload = '{"event":"call.completed"}';
            const secret = 'test-secret';
            const sig = signPayload(payload, secret);

            expect(verifySignature(payload, secret, sig)).toBe(true);
        });

        it('returns false for invalid signature', () => {
            const payload = '{"event":"call.completed"}';
            const secret = 'test-secret';

            expect(verifySignature(payload, secret, 'invalid-sig')).toBe(false);
        });

        it('returns false for tampered payload', () => {
            const secret = 'test-secret';
            const sig = signPayload('{"event":"call.completed"}', secret);

            expect(verifySignature('{"event":"call.missed"}', secret, sig)).toBe(false);
        });

        it('returns false for wrong secret', () => {
            const payload = '{"event":"test"}';
            const sig = signPayload(payload, 'secret1');

            expect(verifySignature(payload, 'secret2', sig)).toBe(false);
        });

        it('is timing-safe (same length comparison)', () => {
            const payload = 'test';
            const secret = 'secret';
            const sig = signPayload(payload, secret);

            // Modify one char — should still return false
            const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
            expect(verifySignature(payload, secret, tampered)).toBe(false);
        });
    });

    // ─── Secret Generation ──────────────────────────────────────────
    describe('generateWebhookSecret()', () => {
        it('starts with whsec_ prefix', () => {
            const secret = generateWebhookSecret();
            expect(secret).toMatch(/^whsec_/);
        });

        it('has sufficient length', () => {
            const secret = generateWebhookSecret();
            expect(secret.length).toBeGreaterThan(30);
        });

        it('generates unique secrets', () => {
            const secrets = new Set<string>();
            for (let i = 0; i < 100; i++) {
                secrets.add(generateWebhookSecret());
            }
            expect(secrets.size).toBe(100);
        });
    });

    // ─── Event Types ────────────────────────────────────────────────
    describe('Webhook Event Types', () => {
        it('all event types have Turkish labels', () => {
            const events: WebhookEventType[] = [
                'call.completed', 'call.missed',
                'appointment.created', 'appointment.updated',
                'complaint.created', 'complaint.resolved',
                'customer.created',
            ];

            for (const event of events) {
                expect(WEBHOOK_EVENT_LABELS[event]).toBeTruthy();
                expect(typeof WEBHOOK_EVENT_LABELS[event]).toBe('string');
            }
        });

        it('has at least 7 event types', () => {
            expect(Object.keys(WEBHOOK_EVENT_LABELS).length).toBeGreaterThanOrEqual(7);
        });
    });

    // ─── Dispatch Logic ─────────────────────────────────────────────
    describe('dispatchWebhookEvent()', () => {
        let fetchSpy: ReturnType<typeof vi.spyOn>;

        afterEach(() => {
            fetchSpy?.mockRestore();
        });

        it('does nothing when no webhooks match', async () => {
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

            const db = mockFirestore([]);
            await dispatchWebhookEvent(db, 'tenant-1', 'call.completed', {});

            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('sends to matching webhooks', async () => {
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));

            const webhooks: WebhookConfig[] = [
                makeWebhook({ events: ['call.completed'], url: 'https://example.com/hook1' }),
                makeWebhook({ events: ['call.missed'], url: 'https://example.com/hook2' }),
            ];

            // Pass webhooks directly to avoid Firestore call
            await dispatchWebhookEvent(mockFirestore([]), 'tenant-1', 'call.completed', { callId: '123' }, webhooks);

            // Only hook1 should be called (matches call.completed)
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [url, opts] = fetchSpy.mock.calls[0];
            expect(url).toBe('https://example.com/hook1');
            expect(opts?.method).toBe('POST');

            // Check headers
            const headers = opts?.headers as Record<string, string>;
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['X-Webhook-Signature']).toMatch(/^sha256=/);
            expect(headers['X-Webhook-Event']).toBe('call.completed');

            // Check payload
            const body = JSON.parse(opts?.body as string);
            expect(body.event).toBe('call.completed');
            expect(body.data.callId).toBe('123');
            expect(body.tenantId).toBe('tenant-1');
        });

        it('skips inactive webhooks', async () => {
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

            const webhooks: WebhookConfig[] = [
                makeWebhook({ events: ['call.completed'], active: false }),
            ];

            await dispatchWebhookEvent(mockFirestore([]), 'tenant-1', 'call.completed', {}, webhooks);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('skips webhooks with too many failures', async () => {
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

            const webhooks: WebhookConfig[] = [
                makeWebhook({ events: ['call.completed'], failureCount: 10 }),
            ];

            await dispatchWebhookEvent(mockFirestore([]), 'tenant-1', 'call.completed', {}, webhooks);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('does not throw on fetch errors', async () => {
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

            const webhooks: WebhookConfig[] = [
                makeWebhook({ events: ['call.completed'] }),
            ];

            // Should not throw
            await expect(
                dispatchWebhookEvent(mockFirestore([]), 'tenant-1', 'call.completed', {}, webhooks)
            ).resolves.not.toThrow();
        });
    });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeWebhook(overrides?: Partial<WebhookConfig>): WebhookConfig {
    return {
        id: 'wh-1',
        url: 'https://example.com/webhook',
        events: ['call.completed'],
        active: true,
        secret: 'whsec_testsecret',
        createdAt: '2025-01-01T00:00:00Z',
        failureCount: 0,
        ...overrides,
    };
}

function mockFirestore(webhookDocs: Array<{ id: string; data: () => Record<string, unknown> }>) {
    const snap = { docs: webhookDocs };
    return {
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    get: vi.fn().mockResolvedValue(snap),
                    add: vi.fn().mockResolvedValue({ id: 'log-1' }),
                }),
                update: vi.fn().mockResolvedValue(undefined),
            }),
        }),
    } as unknown as FirebaseFirestore.Firestore;
}
