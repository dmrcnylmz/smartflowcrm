/**
 * Billing Webhook API — Lemon Squeezy Event Handler
 *
 * POST: Receives webhook events from Lemon Squeezy.
 *       Verifies HMAC-SHA256 signature, then processes subscription events.
 *
 * Handled events:
 *   - subscription_created    → Create subscription record + lookup map
 *   - subscription_updated    → Update status, period, card info
 *   - subscription_cancelled  → Mark as cancelled with end date
 *   - subscription_resumed    → Re-activate after pause/cancel
 *   - subscription_expired    → Mark as expired (grace period ended)
 *   - subscription_paused     → Mark as paused
 *   - subscription_unpaused   → Re-activate after pause
 *   - subscription_payment_success → Log successful payment
 *   - subscription_payment_failed  → Mark as past_due
 *   - subscription_payment_refunded → Log refund
 *
 * GET: Returns subscription status for authenticated tenants.
 *
 * Security:
 *   - POST is public (LS needs to reach it) — signature verification enforced
 *   - GET requires x-user-tenant header (set by middleware)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { invalidateSubscriptionCache } from '@/lib/billing/subscription-guard';
import { billingLogger } from '@/lib/utils/logger';
import {
    verifyWebhookSignature,
    buildSubscriptionRecord,
    buildSubscriptionUpdate,
    upsertSubscription,
    createSubscriptionMapEntry,
    findTenantByLsSubscriptionId,
    logBillingActivity,
    isSubscriptionActive,
    getPlanIdFromVariantId,
    type LsWebhookPayload,
} from '@/lib/billing/lemonsqueezy';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// POST: Webhook Event Handler
// =============================================

export async function POST(request: NextRequest) {
    // 1. Read raw body BEFORE parsing (required for HMAC verification)
    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        billingLogger.error('Failed to read request body');
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 2. Verify webhook signature
    const signature = request.headers.get('x-signature') || '';
    if (!verifyWebhookSignature(rawBody, signature)) {
        billingLogger.error('Invalid webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Parse the payload
    let payload: LsWebhookPayload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        billingLogger.error('Failed to parse webhook payload');
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventName = payload.meta?.event_name;
    const customData = payload.meta?.custom_data;
    const lsSubscriptionId = payload.data?.id;

    billingLogger.info('Webhook event received', { eventName, lsSubscriptionId });

    // 4. Resolve tenant_id
    //    - subscription_created: from custom_data (passed through checkout)
    //    - Other events: custom_data or fallback to ls_subscription_map lookup
    let tenantId = customData?.tenant_id || null;

    if (!tenantId && lsSubscriptionId) {
        try {
            tenantId = await findTenantByLsSubscriptionId(getDb(), lsSubscriptionId);
        } catch (err) {
            billingLogger.error('Error looking up tenant', { error: err as Error });
        }
    }

    if (!tenantId) {
        billingLogger.error('Cannot resolve tenant — manual investigation required', {
            eventName,
            lsSubscriptionId,
        });
        // Return 200 to prevent LS from retrying — we log for manual investigation
        return NextResponse.json({ received: true, warning: 'tenant_not_found' });
    }

    // 5. Route by event type
    try {
        switch (eventName) {
            case 'subscription_created':
                await handleSubscriptionCreated(tenantId, payload);
                break;

            case 'subscription_updated':
                await handleSubscriptionUpdated(tenantId, payload);
                break;

            case 'subscription_cancelled':
                await handleSubscriptionCancelled(tenantId, payload);
                break;

            case 'subscription_payment_success':
                await handlePaymentSuccess(tenantId, payload);
                break;

            case 'subscription_payment_failed':
                await handlePaymentFailed(tenantId, payload);
                break;

            case 'subscription_resumed':
            case 'subscription_unpaused':
                await handleSubscriptionReactivated(tenantId, payload, eventName);
                break;

            case 'subscription_expired':
                await handleSubscriptionExpired(tenantId, payload);
                break;

            case 'subscription_paused':
                await handleSubscriptionPaused(tenantId, payload);
                break;

            case 'subscription_payment_refunded':
                await handlePaymentRefunded(tenantId, payload);
                break;

            default:
                billingLogger.info('Unhandled webhook event', { eventName });
        }
    } catch (error) {
        // Log but still return 200 — we don't want LS to retry on our internal errors
        billingLogger.error('Error processing webhook event', {
            eventName,
            error: error as Error,
        });
    }

    // 6. Invalidate subscription cache so next API call sees fresh status
    invalidateSubscriptionCache(tenantId);

    // 7. Always return 200
    return NextResponse.json({ received: true });
}

// =============================================
// Event Handlers
// =============================================

/**
 * subscription_created — New subscription activated.
 * Write full subscription record + create lookup map entry.
 */
async function handleSubscriptionCreated(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const customData = payload.meta.custom_data;
    const attrs = payload.data.attributes;

    // Resolve plan ID from custom_data or variant reverse lookup
    const planId = customData?.plan_id
        || getPlanIdFromVariantId(attrs.variant_id)
        || 'unknown';

    billingLogger.info('subscription_created', {
        tenantId,
        planId,
        lsSubscriptionId: payload.data.id,
        email: attrs.user_email,
    });

    // Build and save subscription record
    const record = buildSubscriptionRecord(tenantId, planId, payload);
    await upsertSubscription(getDb(), tenantId, record);

    // Create reverse lookup map: ls_subscription_map/{lsSubId} → tenantId
    await createSubscriptionMapEntry(getDb(), payload.data.id, tenantId, planId);

    // Log activity
    await logBillingActivity(getDb(), tenantId, 'subscription_created', {
        planId,
        lsSubscriptionId: payload.data.id,
        customerEmail: attrs.user_email,
        status: attrs.status,
        variantName: attrs.variant_name,
        testMode: attrs.test_mode,
    });
}

/**
 * subscription_updated — Status, plan, card, or period changed.
 * Partial update to existing subscription record.
 */
async function handleSubscriptionUpdated(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const attrs = payload.data.attributes;

    billingLogger.info('subscription_updated', {
        tenantId,
        status: attrs.status,
        lsSubscriptionId: payload.data.id,
    });

    const update = buildSubscriptionUpdate(payload);
    await upsertSubscription(getDb(), tenantId, update);

    await logBillingActivity(getDb(), tenantId, 'subscription_updated', {
        lsSubscriptionId: payload.data.id,
        status: attrs.status,
        variantId: attrs.variant_id,
        renewsAt: attrs.renews_at,
    });
}

/**
 * subscription_cancelled — User cancelled their subscription.
 * The subscription remains active until the current period ends.
 */
async function handleSubscriptionCancelled(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const attrs = payload.data.attributes;
    const now = Date.now();

    billingLogger.info('subscription_cancelled', {
        tenantId,
        endsAt: attrs.ends_at,
        lsSubscriptionId: payload.data.id,
    });

    await upsertSubscription(getDb(), tenantId, {
        status: 'cancelled',
        cancelledAt: now,
        endsAt: attrs.ends_at ? new Date(attrs.ends_at).getTime() : undefined,
        updatedAt: now,
    });

    await logBillingActivity(getDb(), tenantId, 'subscription_cancelled', {
        lsSubscriptionId: payload.data.id,
        endsAt: attrs.ends_at,
        cancelledAt: new Date(now).toISOString(),
    });
}

/**
 * subscription_payment_success — Recurring payment succeeded.
 * Log the payment and update last payment date.
 */
async function handlePaymentSuccess(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const attrs = payload.data.attributes;
    const now = Date.now();

    billingLogger.info('payment_success', {
        tenantId,
        lsSubscriptionId: payload.data.id,
    });

    await upsertSubscription(getDb(), tenantId, {
        status: 'active',
        currentPeriodEnd: new Date(attrs.renews_at).getTime(),
        cardBrand: attrs.card_brand || undefined,
        cardLastFour: attrs.card_last_four || undefined,
        updatedAt: now,
    });

    await logBillingActivity(getDb(), tenantId, 'payment_success', {
        lsSubscriptionId: payload.data.id,
        renewsAt: attrs.renews_at,
    });
}

/**
 * subscription_payment_failed — Recurring payment failed.
 * Mark subscription as past_due to trigger grace period warnings.
 */
async function handlePaymentFailed(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const now = Date.now();

    billingLogger.info('payment_failed', {
        tenantId,
        lsSubscriptionId: payload.data.id,
    });

    await upsertSubscription(getDb(), tenantId, {
        status: 'past_due',
        updatedAt: now,
    });

    await logBillingActivity(getDb(), tenantId, 'payment_failed', {
        lsSubscriptionId: payload.data.id,
        failedAt: new Date(now).toISOString(),
    });
}

/**
 * subscription_resumed / subscription_unpaused — Subscription re-activated.
 * User resumed after cancellation or unpause. Set back to active.
 */
async function handleSubscriptionReactivated(
    tenantId: string,
    payload: LsWebhookPayload,
    eventName: string,
): Promise<void> {
    const attrs = payload.data.attributes;
    const now = Date.now();

    billingLogger.info(eventName, {
        tenantId,
        lsSubscriptionId: payload.data.id,
    });

    await upsertSubscription(getDb(), tenantId, {
        status: 'active',
        currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at).getTime() : undefined,
        cancelledAt: undefined,
        endsAt: undefined,
        updatedAt: now,
    });

    await logBillingActivity(getDb(), tenantId, eventName, {
        lsSubscriptionId: payload.data.id,
        status: 'active',
        renewsAt: attrs.renews_at,
    });
}

/**
 * subscription_expired — Subscription fully expired (grace period ended).
 * All access should be blocked.
 */
async function handleSubscriptionExpired(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const now = Date.now();

    billingLogger.info('subscription_expired', {
        tenantId,
        lsSubscriptionId: payload.data.id,
    });

    await upsertSubscription(getDb(), tenantId, {
        status: 'expired',
        updatedAt: now,
    });

    await logBillingActivity(getDb(), tenantId, 'subscription_expired', {
        lsSubscriptionId: payload.data.id,
        expiredAt: new Date(now).toISOString(),
    });
}

/**
 * subscription_paused — User paused their subscription.
 * Access should be suspended until resumed.
 */
async function handleSubscriptionPaused(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const attrs = payload.data.attributes;
    const now = Date.now();

    billingLogger.info('subscription_paused', {
        tenantId,
        lsSubscriptionId: payload.data.id,
    });

    await upsertSubscription(getDb(), tenantId, {
        status: 'paused',
        updatedAt: now,
    });

    await logBillingActivity(getDb(), tenantId, 'subscription_paused', {
        lsSubscriptionId: payload.data.id,
        pausedAt: new Date(now).toISOString(),
        resumesAt: attrs.pause?.resumes_at || null,
    });
}

/**
 * subscription_payment_refunded — A payment was refunded.
 * Log the refund but don't change subscription status (LS handles that separately).
 */
async function handlePaymentRefunded(
    tenantId: string,
    payload: LsWebhookPayload,
): Promise<void> {
    const now = Date.now();

    billingLogger.info('payment_refunded', {
        tenantId,
        lsSubscriptionId: payload.data.id,
    });

    await logBillingActivity(getDb(), tenantId, 'payment_refunded', {
        lsSubscriptionId: payload.data.id,
        refundedAt: new Date(now).toISOString(),
    });
}

// =============================================
// GET: Subscription Status Endpoint
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json(
                { error: 'Tenant kimliği gerekli.' },
                { status: 403 }
            );
        }

        const doc = await getDb().collection('tenants').doc(tenantId)
            .collection('billing').doc('subscription').get();

        if (!doc.exists) {
            return NextResponse.json({
                subscription: null,
                message: 'Aktif abonelik bulunamadı.',
            });
        }

        const sub = doc.data() as Record<string, unknown>;
        const isActive = isSubscriptionActive(sub as Parameters<typeof isSubscriptionActive>[0]);

        return NextResponse.json({
            subscription: {
                ...sub,
                isActive,
            },
        });

    } catch {
        return NextResponse.json(
            { error: 'Abonelik bilgisi alınamadı.' },
            { status: 500 }
        );
    }
}
