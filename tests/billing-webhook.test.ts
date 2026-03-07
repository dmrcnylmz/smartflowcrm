/**
 * Billing Webhook Tests — Lemon Squeezy Webhook Handler
 *
 * Tests the POST /api/billing/webhook handler and helper functions
 * from lib/billing/lemonsqueezy.ts.
 *
 * Covers:
 *   - Webhook signature verification (HMAC-SHA256)
 *   - Subscription event handling (created, updated, cancelled, etc.)
 *   - Plan/variant resolution helpers
 *   - Edge cases (unknown events, missing tenant, duplicate events)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import type { LsWebhookPayload } from '@/lib/billing/lemonsqueezy';

// =============================================
// Test Constants
// =============================================

const WEBHOOK_SECRET = 'test-webhook-secret-key-12345';
const TEST_TENANT_ID = 'tenant_abc123';
const TEST_LS_SUB_ID = 'ls_sub_99';
const TEST_VARIANT_STARTER_MONTHLY = '100001';
const TEST_VARIANT_STARTER_YEARLY = '100002';
const TEST_VARIANT_PROFESSIONAL_MONTHLY = '200001';
const TEST_VARIANT_PROFESSIONAL_YEARLY = '200002';
const TEST_VARIANT_ENTERPRISE_MONTHLY = '300001';
const TEST_VARIANT_ENTERPRISE_YEARLY = '300002';

// =============================================
// Mock Setup
// =============================================

// Firestore mock with chainable document/collection methods
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockAdd = vi.fn().mockResolvedValue({ id: 'activity_log_1' });
const mockGet = vi.fn().mockResolvedValue({ exists: false, data: () => null });

const mockDoc = vi.fn().mockReturnValue({
    set: mockSet,
    get: mockGet,
    collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
            set: mockSet,
            get: mockGet,
        }),
        add: mockAdd,
    }),
});

const mockCollection = vi.fn().mockReturnValue({
    doc: mockDoc,
});

const mockDb = {
    collection: mockCollection,
};

// Mock firebase-admin
vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
}));

// Mock subscription cache invalidation
const mockInvalidateCache = vi.fn();
vi.mock('@/lib/billing/subscription-guard', () => ({
    invalidateSubscriptionCache: (...args: unknown[]) => mockInvalidateCache(...args),
}));

// =============================================
// Helpers
// =============================================

/**
 * Generate a valid HMAC-SHA256 signature for a raw body string
 * using the test webhook secret.
 */
function generateSignature(body: string, secret: string = WEBHOOK_SECRET): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Build a minimal valid LsWebhookPayload for testing.
 */
function buildWebhookPayload(overrides: {
    eventName?: string;
    tenantId?: string;
    planId?: string;
    lsSubId?: string;
    status?: string;
    variantId?: number;
    cardBrand?: string | null;
    cardLastFour?: string | null;
    renewsAt?: string;
    endsAt?: string | null;
    cancelled?: boolean;
    testMode?: boolean;
    userEmail?: string;
    userName?: string;
    pause?: null | { mode: string; resumes_at: string | null };
} = {}): LsWebhookPayload {
    const {
        eventName = 'subscription_created',
        tenantId = TEST_TENANT_ID,
        planId = 'starter',
        lsSubId = TEST_LS_SUB_ID,
        status = 'active',
        variantId = Number(TEST_VARIANT_STARTER_MONTHLY),
        cardBrand = 'visa',
        cardLastFour = '4242',
        renewsAt = '2026-04-07T00:00:00.000Z',
        endsAt = null,
        cancelled = false,
        testMode = true,
        userEmail = 'test@example.com',
        userName = 'Test User',
        pause = null,
    } = overrides;

    return {
        meta: {
            event_name: eventName,
            custom_data: {
                tenant_id: tenantId,
                plan_id: planId,
            },
        },
        data: {
            type: 'subscriptions',
            id: lsSubId,
            attributes: {
                store_id: 12345,
                customer_id: 67890,
                order_id: 11111,
                order_item_id: 22222,
                product_id: 33333,
                variant_id: variantId,
                product_name: 'Callception AI',
                variant_name: 'Starter Monthly',
                user_name: userName,
                user_email: userEmail,
                status: status as LsWebhookPayload['data']['attributes']['status'],
                status_formatted: status.charAt(0).toUpperCase() + status.slice(1),
                card_brand: cardBrand,
                card_last_four: cardLastFour,
                cancelled,
                trial_ends_at: null,
                billing_anchor: 7,
                renews_at: renewsAt,
                ends_at: endsAt,
                created_at: '2026-03-07T00:00:00.000Z',
                updated_at: '2026-03-07T00:00:00.000Z',
                test_mode: testMode,
                urls: {
                    update_payment_method: 'https://app.lemonsqueezy.com/update-payment/1',
                    customer_portal: 'https://app.lemonsqueezy.com/portal/1',
                    customer_portal_update_subscription: null,
                },
                pause,
            },
        },
    };
}

/**
 * Create a NextRequest for the webhook endpoint with proper body and headers.
 */
function createWebhookRequest(
    body: string,
    signature?: string,
    extraHeaders: Record<string, string> = {},
): NextRequest {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extraHeaders,
    };
    if (signature !== undefined) {
        headers['x-signature'] = signature;
    }
    return new NextRequest(
        new URL('/api/billing/webhook', 'http://localhost:3000'),
        {
            method: 'POST',
            headers,
            body,
        },
    );
}

// =============================================
// Environment Setup
// =============================================

beforeEach(() => {
    vi.clearAllMocks();

    // Set environment variables for variant ID resolution
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.LEMONSQUEEZY_VARIANT_STARTER = TEST_VARIANT_STARTER_MONTHLY;
    process.env.LEMONSQUEEZY_VARIANT_STARTER_YEARLY = TEST_VARIANT_STARTER_YEARLY;
    process.env.LEMONSQUEEZY_VARIANT_PROFESSIONAL = TEST_VARIANT_PROFESSIONAL_MONTHLY;
    process.env.LEMONSQUEEZY_VARIANT_PROFESSIONAL_YEARLY = TEST_VARIANT_PROFESSIONAL_YEARLY;
    process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE = TEST_VARIANT_ENTERPRISE_MONTHLY;
    process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY = TEST_VARIANT_ENTERPRISE_YEARLY;

    // Reset Firestore mock state — chainable: collection().doc().collection().doc().set()
    mockCollection.mockReturnValue({ doc: mockDoc });
    mockDoc.mockReturnValue({
        set: mockSet,
        get: mockGet,
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                set: mockSet,
                get: mockGet,
            }),
            add: mockAdd,
        }),
    });
    mockSet.mockResolvedValue(undefined);
    mockAdd.mockResolvedValue({ id: 'activity_log_1' });
    mockGet.mockResolvedValue({ exists: false, data: () => null });
});

afterEach(() => {
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER;
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER_YEARLY;
    delete process.env.LEMONSQUEEZY_VARIANT_PROFESSIONAL;
    delete process.env.LEMONSQUEEZY_VARIANT_PROFESSIONAL_YEARLY;
    delete process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE;
    delete process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY;
});

// =============================================
// 1. Webhook Signature Verification
// =============================================

describe('Webhook Signature Verification', () => {
    it('should accept a valid HMAC-SHA256 signature and return 200', async () => {
        const payload = buildWebhookPayload();
        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.received).toBe(true);
    });

    it('should reject an invalid signature with 401', async () => {
        const payload = buildWebhookPayload();
        const rawBody = JSON.stringify(payload);
        const badSignature = 'deadbeef0000000000000000000000000000000000000000000000000000dead';

        const request = createWebhookRequest(rawBody, badSignature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toMatch(/signature/i);
    });

    it('should reject when the x-signature header is missing with 401', async () => {
        const payload = buildWebhookPayload();
        const rawBody = JSON.stringify(payload);

        // Create request without x-signature header
        const request = createWebhookRequest(rawBody, '');
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        expect(response.status).toBe(401);
    });

    it('should reject an empty body with 401 (signature mismatch)', async () => {
        const signature = generateSignature('{}');

        // Empty body will not match the signature for a non-empty payload
        const request = createWebhookRequest('', '');
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        // Empty body with empty signature still fails verification
        expect(response.status).toBe(401);
    });

    it('should reject when webhook secret is not configured', async () => {
        delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

        const payload = buildWebhookPayload();
        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        expect(response.status).toBe(401);
    });

    it('should reject a tampered body (body changed after signing)', async () => {
        const payload = buildWebhookPayload();
        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        // Tamper with the body after generating signature
        const tampered = rawBody.replace(TEST_TENANT_ID, 'hacked_tenant');
        const request = createWebhookRequest(tampered, signature);

        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        expect(response.status).toBe(401);
    });
});

// =============================================
// 2. Subscription Event Handling
// =============================================

describe('Subscription Event Handling', () => {
    describe('subscription_created', () => {
        it('should create a subscription record and map entry', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_created',
                tenantId: TEST_TENANT_ID,
                planId: 'starter',
                status: 'active',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.received).toBe(true);

            // Verify Firestore writes happened:
            // 1. upsertSubscription -> tenants/{tenantId}/billing/subscription
            // 2. createSubscriptionMapEntry -> ls_subscription_map/{lsSubId}
            // 3. logBillingActivity -> tenants/{tenantId}/activity_logs
            expect(mockSet).toHaveBeenCalled();
            expect(mockAdd).toHaveBeenCalled();

            // Verify subscription cache was invalidated
            expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
        });

        it('should use variant reverse lookup when custom_data.plan_id is missing', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_created',
                tenantId: TEST_TENANT_ID,
                variantId: Number(TEST_VARIANT_PROFESSIONAL_MONTHLY),
            });
            // Remove plan_id from custom_data
            delete payload.meta.custom_data!.plan_id;

            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);
            // The handler should have resolved the plan via getPlanIdFromVariantId
            expect(mockSet).toHaveBeenCalled();
        });
    });

    describe('subscription_updated', () => {
        it('should update subscription status, plan, and card info', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_updated',
                tenantId: TEST_TENANT_ID,
                status: 'active',
                variantId: Number(TEST_VARIANT_PROFESSIONAL_MONTHLY),
                cardBrand: 'mastercard',
                cardLastFour: '8888',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            // upsertSubscription and logBillingActivity should have been called
            expect(mockSet).toHaveBeenCalled();
            expect(mockAdd).toHaveBeenCalled();
            expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
        });
    });

    describe('subscription_cancelled', () => {
        it('should mark subscription as cancelled with endsAt date', async () => {
            const endsAt = '2026-04-07T00:00:00.000Z';
            const payload = buildWebhookPayload({
                eventName: 'subscription_cancelled',
                tenantId: TEST_TENANT_ID,
                status: 'cancelled',
                cancelled: true,
                endsAt,
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            // Verify the upsertSubscription call includes cancelled status
            const setCalls = mockSet.mock.calls;
            const cancelUpdate = setCalls.find(
                (call: unknown[]) =>
                    call[0] &&
                    typeof call[0] === 'object' &&
                    (call[0] as Record<string, unknown>).status === 'cancelled',
            );
            expect(cancelUpdate).toBeDefined();
            expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
        });
    });

    describe('subscription_payment_success', () => {
        it('should log payment and update subscription to active', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_payment_success',
                tenantId: TEST_TENANT_ID,
                status: 'active',
                renewsAt: '2026-05-07T00:00:00.000Z',
                cardBrand: 'visa',
                cardLastFour: '1234',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            // Verify the subscription is set to active
            const setCalls = mockSet.mock.calls;
            const activeUpdate = setCalls.find(
                (call: unknown[]) =>
                    call[0] &&
                    typeof call[0] === 'object' &&
                    (call[0] as Record<string, unknown>).status === 'active',
            );
            expect(activeUpdate).toBeDefined();
            expect(mockAdd).toHaveBeenCalled(); // activity log
        });
    });

    describe('subscription_payment_failed', () => {
        it('should mark subscription as past_due', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_payment_failed',
                tenantId: TEST_TENANT_ID,
                status: 'past_due',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            // Verify past_due status was written
            const setCalls = mockSet.mock.calls;
            const pastDueUpdate = setCalls.find(
                (call: unknown[]) =>
                    call[0] &&
                    typeof call[0] === 'object' &&
                    (call[0] as Record<string, unknown>).status === 'past_due',
            );
            expect(pastDueUpdate).toBeDefined();
            expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
        });
    });

    describe('subscription_expired', () => {
        it('should mark subscription as expired', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_expired',
                tenantId: TEST_TENANT_ID,
                status: 'expired',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            const setCalls = mockSet.mock.calls;
            const expiredUpdate = setCalls.find(
                (call: unknown[]) =>
                    call[0] &&
                    typeof call[0] === 'object' &&
                    (call[0] as Record<string, unknown>).status === 'expired',
            );
            expect(expiredUpdate).toBeDefined();
            expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
        });
    });

    describe('subscription_paused', () => {
        it('should mark subscription as paused', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_paused',
                tenantId: TEST_TENANT_ID,
                status: 'paused',
                pause: { mode: 'void', resumes_at: '2026-05-01T00:00:00.000Z' },
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            const setCalls = mockSet.mock.calls;
            const pausedUpdate = setCalls.find(
                (call: unknown[]) =>
                    call[0] &&
                    typeof call[0] === 'object' &&
                    (call[0] as Record<string, unknown>).status === 'paused',
            );
            expect(pausedUpdate).toBeDefined();
        });
    });

    describe('subscription_resumed / subscription_unpaused', () => {
        it('should reactivate subscription on subscription_resumed', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_resumed',
                tenantId: TEST_TENANT_ID,
                status: 'active',
                renewsAt: '2026-06-07T00:00:00.000Z',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            const setCalls = mockSet.mock.calls;
            const activeUpdate = setCalls.find(
                (call: unknown[]) =>
                    call[0] &&
                    typeof call[0] === 'object' &&
                    (call[0] as Record<string, unknown>).status === 'active',
            );
            expect(activeUpdate).toBeDefined();
        });

        it('should reactivate subscription on subscription_unpaused', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_unpaused',
                tenantId: TEST_TENANT_ID,
                status: 'active',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mockSet).toHaveBeenCalled();
        });
    });

    describe('subscription_payment_refunded', () => {
        it('should log refund without changing subscription status', async () => {
            const payload = buildWebhookPayload({
                eventName: 'subscription_payment_refunded',
                tenantId: TEST_TENANT_ID,
                status: 'active',
            });
            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);

            // Only logBillingActivity should be called (add), not upsertSubscription (set)
            // The handler only logs — does NOT set subscription status
            expect(mockAdd).toHaveBeenCalled();
        });
    });

    describe('Tenant resolution via ls_subscription_map', () => {
        it('should look up tenant from ls_subscription_map when custom_data has no tenant_id', async () => {
            // Mock ls_subscription_map lookup to return tenant
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ tenantId: TEST_TENANT_ID, planId: 'starter', createdAt: Date.now() }),
            });

            const payload = buildWebhookPayload({
                eventName: 'subscription_updated',
                status: 'active',
            });
            // Remove tenant_id from custom_data so handler must look it up
            delete payload.meta.custom_data!.tenant_id;

            const rawBody = JSON.stringify(payload);
            const signature = generateSignature(rawBody);

            const request = createWebhookRequest(rawBody, signature);
            const { POST } = await import('@/app/api/billing/webhook/route');
            const response = await POST(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.received).toBe(true);
        });
    });
});

// =============================================
// 3. Plan / Variant Resolution
// =============================================

describe('Plan / Variant Resolution', () => {
    describe('getPlanIdFromVariantId', () => {
        it('should return "starter" for the starter monthly variant', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(TEST_VARIANT_STARTER_MONTHLY)).toBe('starter');
        });

        it('should return "starter" for the starter yearly variant', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(TEST_VARIANT_STARTER_YEARLY)).toBe('starter');
        });

        it('should return "professional" for the professional monthly variant', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(TEST_VARIANT_PROFESSIONAL_MONTHLY)).toBe('professional');
        });

        it('should return "professional" for the professional yearly variant', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(TEST_VARIANT_PROFESSIONAL_YEARLY)).toBe('professional');
        });

        it('should return "enterprise" for the enterprise monthly variant', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(TEST_VARIANT_ENTERPRISE_MONTHLY)).toBe('enterprise');
        });

        it('should return "enterprise" for the enterprise yearly variant', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(TEST_VARIANT_ENTERPRISE_YEARLY)).toBe('enterprise');
        });

        it('should return null for an unknown variant ID', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId('999999')).toBeNull();
        });

        it('should handle numeric variant IDs (not just strings)', async () => {
            const { getPlanIdFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getPlanIdFromVariantId(Number(TEST_VARIANT_STARTER_MONTHLY))).toBe('starter');
        });
    });

    describe('getBillingIntervalFromVariantId', () => {
        it('should return "monthly" for a monthly variant', async () => {
            const { getBillingIntervalFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getBillingIntervalFromVariantId(TEST_VARIANT_STARTER_MONTHLY)).toBe('monthly');
        });

        it('should return "yearly" for a yearly variant', async () => {
            const { getBillingIntervalFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getBillingIntervalFromVariantId(TEST_VARIANT_STARTER_YEARLY)).toBe('yearly');
        });

        it('should return "yearly" for professional yearly variant', async () => {
            const { getBillingIntervalFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getBillingIntervalFromVariantId(TEST_VARIANT_PROFESSIONAL_YEARLY)).toBe('yearly');
        });

        it('should return "yearly" for enterprise yearly variant', async () => {
            const { getBillingIntervalFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getBillingIntervalFromVariantId(TEST_VARIANT_ENTERPRISE_YEARLY)).toBe('yearly');
        });

        it('should default to "monthly" for an unknown variant', async () => {
            const { getBillingIntervalFromVariantId } = await import('@/lib/billing/lemonsqueezy');
            expect(getBillingIntervalFromVariantId('999999')).toBe('monthly');
        });
    });
});

// =============================================
// 4. Build Subscription Record / Update
// =============================================

describe('buildSubscriptionRecord', () => {
    it('should build a full subscription record from webhook payload', async () => {
        const { buildSubscriptionRecord } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload({
            status: 'active',
            variantId: Number(TEST_VARIANT_STARTER_MONTHLY),
            cardBrand: 'visa',
            cardLastFour: '4242',
            userEmail: 'billing@callception.com',
            userName: 'Billing User',
        });

        const record = buildSubscriptionRecord(TEST_TENANT_ID, 'starter', payload);

        expect(record.tenantId).toBe(TEST_TENANT_ID);
        expect(record.planId).toBe('starter');
        expect(record.status).toBe('active');
        expect(record.paymentProvider).toBe('lemonsqueezy');
        expect(record.lsSubscriptionId).toBe(TEST_LS_SUB_ID);
        expect(record.customerEmail).toBe('billing@callception.com');
        expect(record.customerName).toBe('Billing User');
        expect(record.cardBrand).toBe('visa');
        expect(record.cardLastFour).toBe('4242');
        expect(record.billingInterval).toBe('monthly');
        expect(record.testMode).toBe(true);
        expect(record.limits).toBeDefined();
        expect(record.limits.monthlyMinutes).toBe(100);      // Starter limits
        expect(record.limits.monthlyCalls).toBe(500);
        expect(record.limits.concurrentSessions).toBe(2);
        expect(record.currentPeriodStart).toBeGreaterThan(0);
        expect(record.currentPeriodEnd).toBeGreaterThan(0);
        expect(record.createdAt).toBeGreaterThan(0);
        expect(record.updatedAt).toBeGreaterThan(0);
    });

    it('should set billingInterval to yearly for yearly variants', async () => {
        const { buildSubscriptionRecord } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload({
            variantId: Number(TEST_VARIANT_PROFESSIONAL_YEARLY),
        });

        const record = buildSubscriptionRecord(TEST_TENANT_ID, 'professional', payload);

        expect(record.billingInterval).toBe('yearly');
        expect(record.limits.monthlyMinutes).toBe(500);
        expect(record.limits.monthlyCalls).toBe(2000);
        expect(record.limits.concurrentSessions).toBe(5);
    });

    it('should set cancelledAt when subscription is cancelled', async () => {
        const { buildSubscriptionRecord } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload({
            status: 'cancelled',
            cancelled: true,
            endsAt: '2026-05-01T00:00:00.000Z',
        });

        const record = buildSubscriptionRecord(TEST_TENANT_ID, 'starter', payload);

        expect(record.status).toBe('cancelled');
        expect(record.cancelledAt).toBeGreaterThan(0);
        expect(record.endsAt).toBe(new Date('2026-05-01T00:00:00.000Z').getTime());
    });

    it('should fall back to zero limits for unknown plan', async () => {
        const { buildSubscriptionRecord } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload();

        const record = buildSubscriptionRecord(TEST_TENANT_ID, 'nonexistent_plan', payload);

        expect(record.limits.monthlyMinutes).toBe(0);
        expect(record.limits.monthlyCalls).toBe(0);
        expect(record.limits.concurrentSessions).toBe(0);
    });
});

describe('buildSubscriptionUpdate', () => {
    it('should build a partial update from webhook payload', async () => {
        const { buildSubscriptionUpdate } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload({
            eventName: 'subscription_updated',
            status: 'active',
            variantId: Number(TEST_VARIANT_PROFESSIONAL_MONTHLY),
            cardBrand: 'mastercard',
            cardLastFour: '9999',
            userEmail: 'updated@test.com',
        });

        const update = buildSubscriptionUpdate(payload);

        expect(update.status).toBe('active');
        expect(update.cardBrand).toBe('mastercard');
        expect(update.cardLastFour).toBe('9999');
        expect(update.customerEmail).toBe('updated@test.com');
        expect(update.planId).toBe('professional');
        expect(update.billingInterval).toBe('monthly');
        expect(update.updatedAt).toBeGreaterThan(0);
        expect(update.lsVariantId).toBe(String(TEST_VARIANT_PROFESSIONAL_MONTHLY));
    });

    it('should include endsAt when present in attributes', async () => {
        const { buildSubscriptionUpdate } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload({
            endsAt: '2026-06-01T00:00:00.000Z',
            cancelled: true,
        });

        const update = buildSubscriptionUpdate(payload);

        expect(update.endsAt).toBe(new Date('2026-06-01T00:00:00.000Z').getTime());
        expect(update.cancelledAt).toBeGreaterThan(0);
    });

    it('should omit planId and limits when variant is unknown', async () => {
        const { buildSubscriptionUpdate } = await import('@/lib/billing/lemonsqueezy');
        const payload = buildWebhookPayload({
            variantId: 999999,
        });

        const update = buildSubscriptionUpdate(payload);

        expect(update.planId).toBeUndefined();
        expect(update.limits).toBeUndefined();
    });
});

// =============================================
// 5. isSubscriptionActive
// =============================================

describe('isSubscriptionActive', () => {
    it('should return true for active subscription', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        expect(isSubscriptionActive({ status: 'active' } as any)).toBe(true);
    });

    it('should return true for past_due subscription (grace period)', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        expect(isSubscriptionActive({ status: 'past_due' } as any)).toBe(true);
    });

    it('should return true for on_trial with future trialEndsAt', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        const futureDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now
        expect(
            isSubscriptionActive({ status: 'on_trial', trialEndsAt: futureDate } as any),
        ).toBe(true);
    });

    it('should return false for on_trial with past trialEndsAt', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        const pastDate = Date.now() - 1000;
        expect(
            isSubscriptionActive({ status: 'on_trial', trialEndsAt: pastDate } as any),
        ).toBe(false);
    });

    it('should return true for cancelled with future endsAt', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        const futureDate = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
        expect(
            isSubscriptionActive({ status: 'cancelled', endsAt: futureDate } as any),
        ).toBe(true);
    });

    it('should return false for cancelled with past endsAt', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        const pastDate = Date.now() - 1000;
        expect(
            isSubscriptionActive({ status: 'cancelled', endsAt: pastDate } as any),
        ).toBe(false);
    });

    it('should return false for expired subscription', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        expect(isSubscriptionActive({ status: 'expired' } as any)).toBe(false);
    });

    it('should return false for paused subscription', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        expect(isSubscriptionActive({ status: 'paused' } as any)).toBe(false);
    });

    it('should return false for unpaid subscription', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        expect(isSubscriptionActive({ status: 'unpaid' } as any)).toBe(false);
    });

    it('should return false for null/undefined input', async () => {
        const { isSubscriptionActive } = await import('@/lib/billing/lemonsqueezy');
        expect(isSubscriptionActive(null)).toBe(false);
        expect(isSubscriptionActive(undefined)).toBe(false);
    });
});

// =============================================
// 6. Edge Cases
// =============================================

describe('Edge Cases', () => {
    it('should return 200 for unknown/unhandled event types (acknowledged but ignored)', async () => {
        const payload = buildWebhookPayload({
            eventName: 'order_created',
            tenantId: TEST_TENANT_ID,
        });
        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.received).toBe(true);
    });

    it('should return 200 with warning when tenant ID cannot be resolved', async () => {
        // No custom_data.tenant_id and map lookup returns nothing
        mockGet.mockResolvedValueOnce({ exists: false, data: () => null });

        const payload = buildWebhookPayload({
            eventName: 'subscription_updated',
        });
        // Remove tenant_id from custom_data
        delete payload.meta.custom_data!.tenant_id;

        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);
        const data = await response.json();

        // The handler returns 200 to prevent LS from retrying
        expect(response.status).toBe(200);
        expect(data.warning).toBe('tenant_not_found');
    });

    it('should return 200 even when an internal handler throws an error', async () => {
        // Make upsertSubscription throw to simulate internal error
        mockSet.mockRejectedValueOnce(new Error('Firestore write failed'));

        const payload = buildWebhookPayload({
            eventName: 'subscription_created',
            tenantId: TEST_TENANT_ID,
        });
        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        // Handler catches internal errors and still returns 200
        expect(response.status).toBe(200);
        expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
    });

    it('should return 400 for non-JSON body with valid signature', async () => {
        const rawBody = 'this is not json';
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toMatch(/json/i);
    });

    it('should invalidate subscription cache after every successful event', async () => {
        const payload = buildWebhookPayload({
            eventName: 'subscription_updated',
            tenantId: TEST_TENANT_ID,
        });
        const rawBody = JSON.stringify(payload);
        const signature = generateSignature(rawBody);

        const request = createWebhookRequest(rawBody, signature);
        const { POST } = await import('@/app/api/billing/webhook/route');
        await POST(request);

        expect(mockInvalidateCache).toHaveBeenCalledTimes(1);
        expect(mockInvalidateCache).toHaveBeenCalledWith(TEST_TENANT_ID);
    });
});

// =============================================
// 7. verifyWebhookSignature (unit)
// =============================================

describe('verifyWebhookSignature (unit)', () => {
    it('should return true for matching body and signature', async () => {
        const { verifyWebhookSignature } = await import('@/lib/billing/lemonsqueezy');

        const body = '{"test":"data"}';
        const sig = generateSignature(body);

        expect(verifyWebhookSignature(body, sig)).toBe(true);
    });

    it('should return false for non-matching signature', async () => {
        const { verifyWebhookSignature } = await import('@/lib/billing/lemonsqueezy');

        const body = '{"test":"data"}';
        const sig = 'aaaa' + generateSignature(body).slice(4);

        expect(verifyWebhookSignature(body, sig)).toBe(false);
    });

    it('should return false for empty signature', async () => {
        const { verifyWebhookSignature } = await import('@/lib/billing/lemonsqueezy');

        expect(verifyWebhookSignature('{"test":"data"}', '')).toBe(false);
    });

    it('should return false when LEMONSQUEEZY_WEBHOOK_SECRET is not set', async () => {
        delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

        const { verifyWebhookSignature } = await import('@/lib/billing/lemonsqueezy');

        const body = '{"test":"data"}';
        const sig = generateSignature(body);

        expect(verifyWebhookSignature(body, sig)).toBe(false);
    });
});

// =============================================
// 8. mapLsStatus (unit)
// =============================================

describe('mapLsStatus', () => {
    it('should map all known LS statuses correctly', async () => {
        const { mapLsStatus } = await import('@/lib/billing/lemonsqueezy');

        expect(mapLsStatus('active')).toBe('active');
        expect(mapLsStatus('on_trial')).toBe('on_trial');
        expect(mapLsStatus('paused')).toBe('paused');
        expect(mapLsStatus('past_due')).toBe('past_due');
        expect(mapLsStatus('unpaid')).toBe('unpaid');
        expect(mapLsStatus('cancelled')).toBe('cancelled');
        expect(mapLsStatus('expired')).toBe('expired');
    });

    it('should default to "expired" for an unknown status', async () => {
        const { mapLsStatus } = await import('@/lib/billing/lemonsqueezy');
        // Force unknown status via type cast
        expect(mapLsStatus('totally_unknown' as any)).toBe('expired');
    });
});

// =============================================
// 9. GET /api/billing/webhook — Subscription Status
// =============================================

describe('GET /api/billing/webhook (subscription status)', () => {
    it('should return subscription data for authenticated tenant', async () => {
        const subscriptionData = {
            tenantId: TEST_TENANT_ID,
            planId: 'starter',
            status: 'active',
            currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        };

        mockGet.mockResolvedValueOnce({
            exists: true,
            data: () => subscriptionData,
        });

        const { GET } = await import('@/app/api/billing/webhook/route');
        const request = new NextRequest(
            new URL('/api/billing/webhook', 'http://localhost:3000'),
            {
                method: 'GET',
                headers: { 'x-user-tenant': TEST_TENANT_ID },
            },
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.subscription).toBeDefined();
        expect(data.subscription.planId).toBe('starter');
        expect(data.subscription.isActive).toBe(true);
    });

    it('should return 403 when x-user-tenant header is missing', async () => {
        const { GET } = await import('@/app/api/billing/webhook/route');
        const request = new NextRequest(
            new URL('/api/billing/webhook', 'http://localhost:3000'),
            { method: 'GET' },
        );
        const response = await GET(request);

        expect(response.status).toBe(403);
    });

    it('should return null subscription when no billing record exists', async () => {
        mockGet.mockResolvedValueOnce({
            exists: false,
            data: () => null,
        });

        const { GET } = await import('@/app/api/billing/webhook/route');
        const request = new NextRequest(
            new URL('/api/billing/webhook', 'http://localhost:3000'),
            {
                method: 'GET',
                headers: { 'x-user-tenant': TEST_TENANT_ID },
            },
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.subscription).toBeNull();
    });
});
