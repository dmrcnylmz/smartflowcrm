/**
 * Lemon Squeezy Payment Service — Subscription Billing for Callception
 *
 * Handles:
 * - Checkout session creation (Lemon Squeezy hosted checkout URL)
 * - Webhook signature verification (HMAC-SHA256)
 * - Subscription record management in Firestore
 * - Plan ↔ Variant ID mapping
 *
 * Flow:
 * 1. Frontend calls POST /api/billing/checkout → gets LS checkout URL
 * 2. User completes payment on Lemon Squeezy hosted page
 * 3. LS sends webhook to POST /api/billing/webhook → we verify & update Firestore
 * 4. Subscription stored at tenants/{tenantId}/billing/subscription
 *
 * Security:
 * - All API keys are server-side only (no NEXT_PUBLIC_ prefix)
 * - Webhook payloads verified with HMAC-SHA256 + timing-safe comparison
 * - tenant_id passed via custom_data (signed by LS, not URL params)
 */

import crypto from 'crypto';

// =============================================
// Types
// =============================================

/** Lemon Squeezy subscription status values */
export type LsSubscriptionStatus =
    | 'active'
    | 'on_trial'
    | 'paused'
    | 'past_due'
    | 'unpaid'
    | 'cancelled'
    | 'expired';

/** Internal subscription record stored in Firestore */
export interface SubscriptionRecord {
    tenantId: string;
    planId: string;                         // 'starter' | 'professional' | 'enterprise'
    status: 'active' | 'on_trial' | 'past_due' | 'cancelled' | 'expired' | 'unpaid' | 'paused';
    currentPeriodStart: number;             // epoch ms
    currentPeriodEnd: number;               // epoch ms (renews_at from LS)
    paymentProvider: 'lemonsqueezy';
    lsSubscriptionId: string;               // LS subscription ID
    lsCustomerId: string;                   // LS customer ID
    lsOrderId: string;                      // LS order ID
    lsVariantId: string;                    // LS variant ID
    productName: string;
    variantName: string;
    customerEmail: string;
    customerName: string;
    customerPortalUrl?: string;             // Pre-signed URL (24h validity)
    updatePaymentMethodUrl?: string;
    cardBrand?: string;
    cardLastFour?: string;
    trialEndsAt?: number;
    cancelledAt?: number;
    billingInterval: BillingInterval;        // 'monthly' or 'yearly'
    endsAt?: number;                        // When subscription fully expires
    limits: {
        monthlyMinutes: number;
        monthlyCalls: number;
        concurrentSessions: number;
    };
    testMode: boolean;
    createdAt: number;
    updatedAt: number;
}

/** Plan configuration with LS variant mapping */
export interface PlanConfig {
    id: string;
    name: string;
    nameTr: string;
    description: string;
    priceTry: number;                       // Monthly price in TRY
    priceYearlyTry: number;                 // Yearly price in TRY
    variantIdEnvKey: string;                // Key in process.env for monthly variant ID
    variantIdYearlyEnvKey: string;          // Key in process.env for yearly variant ID
    includedMinutes: number;
    includedCalls: number;
    maxConcurrentSessions: number;
    features: string[];
}

/** Billing interval type */
export type BillingInterval = 'monthly' | 'yearly';

/** Lemon Squeezy subscription attributes in webhook payload */
export interface LsSubscriptionAttributes {
    store_id: number;
    customer_id: number;
    order_id: number;
    order_item_id: number;
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_name: string;
    user_name: string;
    user_email: string;
    status: LsSubscriptionStatus;
    status_formatted: string;
    card_brand: string | null;
    card_last_four: string | null;
    cancelled: boolean;
    trial_ends_at: string | null;
    billing_anchor: number;
    renews_at: string;
    ends_at: string | null;
    created_at: string;
    updated_at: string;
    test_mode: boolean;
    urls: {
        update_payment_method: string;
        customer_portal: string;
        customer_portal_update_subscription: string | null;
    };
    pause: null | { mode: string; resumes_at: string | null };
    first_subscription_item?: {
        id: number;
        subscription_id: number;
        price_id: number;
        quantity: number;
    };
}

/** Shape of LS webhook payload */
export interface LsWebhookPayload {
    meta: {
        event_name: string;
        custom_data?: {
            tenant_id?: string;
            plan_id?: string;
            user_id?: string;
            company_name?: string;
        };
    };
    data: {
        type: string;
        id: string;
        attributes: LsSubscriptionAttributes;
    };
}

/** Checkout creation result */
export interface CheckoutResult {
    success: boolean;
    checkoutUrl?: string;
    error?: string;
}

/** LS subscription map document for reverse lookup */
interface LsSubscriptionMapEntry {
    tenantId: string;
    planId: string;
    createdAt: number;
}

// =============================================
// Subscription Plans (TRY pricing)
// =============================================

export const PLANS: Record<string, PlanConfig> = {
    starter: {
        id: 'starter',
        name: 'Starter',
        nameTr: 'Başlangıç',
        description: 'Girişimler ve küçük işletmeler için ideal AI paket.',
        priceTry: 990,
        priceYearlyTry: 9490,
        variantIdEnvKey: 'LEMONSQUEEZY_VARIANT_STARTER',
        variantIdYearlyEnvKey: 'LEMONSQUEEZY_VARIANT_STARTER_YEARLY',
        includedMinutes: 100,
        includedCalls: 500,
        maxConcurrentSessions: 2,
        features: [
            'AI Sesli Asistan',
            '100 dk/ay konuşma',
            'Temel CRM',
            'E-posta bildirimleri',
            '2 eşzamanlı oturum',
        ],
    },
    professional: {
        id: 'professional',
        name: 'Professional',
        nameTr: 'Profesyonel',
        description: 'Büyüyen işletmeler için gelişmiş özellikler.',
        priceTry: 2990,
        priceYearlyTry: 28690,
        variantIdEnvKey: 'LEMONSQUEEZY_VARIANT_PROFESSIONAL',
        variantIdYearlyEnvKey: 'LEMONSQUEEZY_VARIANT_PROFESSIONAL_YEARLY',
        includedMinutes: 500,
        includedCalls: 2000,
        maxConcurrentSessions: 5,
        features: [
            'AI Sesli Asistan (Gelişmiş)',
            '500 dk/ay konuşma',
            'Gelişmiş CRM + Raporlama',
            'E-posta + SMS bildirimleri',
            '5 eşzamanlı oturum',
            'Bilgi Bankası (RAG)',
            'n8n Otomasyon',
        ],
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        nameTr: 'Kurumsal',
        description: 'Kurumsal düzeyde tam çözüm, özel destek.',
        priceTry: 7990,
        priceYearlyTry: 76590,
        variantIdEnvKey: 'LEMONSQUEEZY_VARIANT_ENTERPRISE',
        variantIdYearlyEnvKey: 'LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY',
        includedMinutes: 2000,
        includedCalls: 10000,
        maxConcurrentSessions: 20,
        features: [
            'Tüm Professional özellikler',
            '2000 dk/ay konuşma',
            'Sınırsız CRM',
            'Özel AI modeli eğitimi',
            '20 eşzamanlı oturum',
            'API erişimi',
            'Öncelikli destek',
            'SLA garantisi',
        ],
    },
};

// =============================================
// Lemon Squeezy API Client
// =============================================

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

/**
 * Authenticated fetch wrapper for Lemon Squeezy API.
 * Adds Bearer token and JSON:API content headers.
 */
async function lsApiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
        throw new Error(
            'LEMONSQUEEZY_API_KEY is not configured. Set it in .env.local or Vercel environment variables.'
        );
    }

    const response = await fetch(`${LS_API_BASE}${path}`, {
        ...options,
        headers: {
            'Accept': 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            'Authorization': `Bearer ${apiKey}`,
            ...(options.headers || {}),
        },
    });

    return response;
}

// =============================================
// Plan ↔ Variant Mapping
// =============================================

/** Get Lemon Squeezy variant ID for a plan */
export function getVariantId(planId: string, billingInterval: BillingInterval = 'monthly'): string | null {
    const plan = PLANS[planId];
    if (!plan) return null;
    const envKey = billingInterval === 'yearly' ? plan.variantIdYearlyEnvKey : plan.variantIdEnvKey;
    return process.env[envKey] || null;
}

/** Reverse lookup: find plan ID from LS variant ID (checks both monthly & yearly) */
export function getPlanIdFromVariantId(variantId: string | number): string | null {
    const vid = String(variantId);
    for (const [planId, plan] of Object.entries(PLANS)) {
        const monthlyId = process.env[plan.variantIdEnvKey];
        const yearlyId = process.env[plan.variantIdYearlyEnvKey];
        if (monthlyId === vid || yearlyId === vid) return planId;
    }
    return null;
}

/** Determine billing interval from LS variant ID */
export function getBillingIntervalFromVariantId(variantId: string | number): BillingInterval {
    const vid = String(variantId);
    for (const plan of Object.values(PLANS)) {
        if (process.env[plan.variantIdYearlyEnvKey] === vid) return 'yearly';
    }
    return 'monthly';
}

/** Get plan limits by plan ID */
export function getPlanLimits(planId: string): SubscriptionRecord['limits'] | null {
    const plan = PLANS[planId];
    if (!plan) return null;
    return {
        monthlyMinutes: plan.includedMinutes,
        monthlyCalls: plan.includedCalls,
        concurrentSessions: plan.maxConcurrentSessions,
    };
}

// =============================================
// Checkout Session
// =============================================

/**
 * Create a Lemon Squeezy checkout URL.
 *
 * CRITICAL: custom_data.tenant_id is passed through the checkout and
 * returned in the webhook payload. This is how we link the payment
 * to the correct Firestore tenant document.
 */
export async function createCheckout(options: {
    tenantId: string;
    planId: string;
    billingInterval?: BillingInterval;
    userEmail: string;
    userId: string;
    redirectUrl: string;
}): Promise<CheckoutResult> {
    const { tenantId, planId, billingInterval = 'monthly', userEmail, userId, redirectUrl } = options;

    // Validate plan exists
    const plan = PLANS[planId];
    if (!plan) {
        return { success: false, error: `Geçersiz plan: ${planId}` };
    }

    // Resolve variant ID from environment (monthly or yearly)
    const variantId = getVariantId(planId, billingInterval);
    const envKey = billingInterval === 'yearly' ? plan.variantIdYearlyEnvKey : plan.variantIdEnvKey;
    if (!variantId) {
        return {
            success: false,
            error: `${envKey} ortam değişkeni tanımlı değil. Lemon Squeezy Dashboard'dan variant ID'yi alıp .env dosyasına ekleyin.`,
        };
    }

    // Resolve store ID
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) {
        return {
            success: false,
            error: 'LEMONSQUEEZY_STORE_ID ortam değişkeni tanımlı değil.',
        };
    }

    try {
        // POST /v1/checkouts — JSON:API format
        const response = await lsApiFetch('/checkouts', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    type: 'checkouts',
                    attributes: {
                        checkout_data: {
                            email: userEmail,
                            custom: {
                                tenant_id: tenantId,
                                plan_id: planId,
                                user_id: userId,
                            },
                        },
                        product_options: {
                            redirect_url: redirectUrl,
                        },
                    },
                    relationships: {
                        store: {
                            data: {
                                type: 'stores',
                                id: storeId,
                            },
                        },
                        variant: {
                            data: {
                                type: 'variants',
                                id: variantId,
                            },
                        },
                    },
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(
                `[lemonsqueezy] Checkout creation failed (${response.status}):`,
                errorBody
            );
            return {
                success: false,
                error: `Lemon Squeezy API hatası (${response.status}). Lütfen tekrar deneyin.`,
            };
        }

        const result = await response.json();
        const checkoutUrl = result?.data?.attributes?.url;

        if (!checkoutUrl) {
            console.error('[lemonsqueezy] No checkout URL in response:', result);
            return { success: false, error: 'Checkout URL alınamadı.' };
        }

        return { success: true, checkoutUrl };
    } catch (error) {
        console.error('[lemonsqueezy] Checkout creation error:', error);
        return {
            success: false,
            error: 'Ödeme sayfası oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.',
        };
    }
}

// =============================================
// Subscription Management (Plan Swap)
// =============================================

/**
 * Update a Lemon Squeezy subscription's variant (plan swap / interval change).
 * Uses PATCH /v1/subscriptions/{id} to change the variant_id.
 * The webhook will fire subscription_updated and update Firestore automatically.
 */
export async function updateSubscriptionVariant(
    lsSubscriptionId: string,
    newVariantId: string,
    prorate: boolean = true,
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await lsApiFetch(`/subscriptions/${lsSubscriptionId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                data: {
                    type: 'subscriptions',
                    id: lsSubscriptionId,
                    attributes: {
                        variant_id: Number(newVariantId),
                        ...(prorate ? {} : { disable_prorations: true }),
                    },
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[lemonsqueezy] Subscription update failed (${response.status}):`, errorBody);
            return { success: false, error: `Abonelik güncellenemedi (${response.status}).` };
        }

        return { success: true };
    } catch (error) {
        console.error('[lemonsqueezy] Subscription update error:', error);
        return { success: false, error: 'Abonelik güncellenirken hata oluştu.' };
    }
}

// =============================================
// Webhook Signature Verification
// =============================================

/**
 * Verify Lemon Squeezy webhook signature (HMAC-SHA256).
 *
 * The X-Signature header contains the HMAC hex digest.
 * We compute our own digest from the raw body and compare
 * using timing-safe equality to prevent timing attacks.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
        console.error('[lemonsqueezy] LEMONSQUEEZY_WEBHOOK_SECRET is not configured');
        return false;
    }

    try {
        const hmac = crypto.createHmac('sha256', secret);
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
        const sig = Buffer.from(signature || '', 'utf8');

        if (digest.length !== sig.length) return false;
        return crypto.timingSafeEqual(digest, sig);
    } catch {
        return false;
    }
}

// =============================================
// Status Mapping
// =============================================

/** Map Lemon Squeezy subscription status to internal status */
export function mapLsStatus(lsStatus: LsSubscriptionStatus): SubscriptionRecord['status'] {
    const statusMap: Record<LsSubscriptionStatus, SubscriptionRecord['status']> = {
        active: 'active',
        on_trial: 'on_trial',
        paused: 'paused',
        past_due: 'past_due',
        unpaid: 'unpaid',
        cancelled: 'cancelled',
        expired: 'expired',
    };
    return statusMap[lsStatus] || 'expired';
}

// =============================================
// Firestore Helpers
// =============================================

/**
 * Build a SubscriptionRecord from a webhook payload.
 */
export function buildSubscriptionRecord(
    tenantId: string,
    planId: string,
    payload: LsWebhookPayload,
): SubscriptionRecord {
    const attrs = payload.data.attributes;
    const now = Date.now();
    const limits = getPlanLimits(planId);
    const billingInterval = getBillingIntervalFromVariantId(attrs.variant_id);

    return {
        tenantId,
        planId,
        status: mapLsStatus(attrs.status),
        currentPeriodStart: new Date(attrs.created_at).getTime(),
        currentPeriodEnd: new Date(attrs.renews_at).getTime(),
        paymentProvider: 'lemonsqueezy',
        lsSubscriptionId: payload.data.id,
        lsCustomerId: String(attrs.customer_id),
        lsOrderId: String(attrs.order_id),
        lsVariantId: String(attrs.variant_id),
        productName: attrs.product_name,
        variantName: attrs.variant_name,
        customerEmail: attrs.user_email,
        customerName: attrs.user_name,
        customerPortalUrl: attrs.urls?.customer_portal,
        updatePaymentMethodUrl: attrs.urls?.update_payment_method,
        cardBrand: attrs.card_brand || undefined,
        cardLastFour: attrs.card_last_four || undefined,
        billingInterval,
        trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at).getTime() : undefined,
        cancelledAt: attrs.cancelled ? now : undefined,
        endsAt: attrs.ends_at ? new Date(attrs.ends_at).getTime() : undefined,
        limits: limits || { monthlyMinutes: 0, monthlyCalls: 0, concurrentSessions: 0 },
        testMode: attrs.test_mode,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Build a partial update from webhook payload for subscription_updated events.
 */
export function buildSubscriptionUpdate(
    payload: LsWebhookPayload,
): Partial<SubscriptionRecord> {
    const attrs = payload.data.attributes;
    const now = Date.now();

    // Try to resolve planId from variant_id
    const planId = getPlanIdFromVariantId(attrs.variant_id);
    const limits = planId ? getPlanLimits(planId) : undefined;

    const update: Partial<SubscriptionRecord> = {
        status: mapLsStatus(attrs.status),
        currentPeriodEnd: new Date(attrs.renews_at).getTime(),
        lsVariantId: String(attrs.variant_id),
        productName: attrs.product_name,
        variantName: attrs.variant_name,
        customerEmail: attrs.user_email,
        customerName: attrs.user_name,
        customerPortalUrl: attrs.urls?.customer_portal,
        updatePaymentMethodUrl: attrs.urls?.update_payment_method,
        cardBrand: attrs.card_brand || undefined,
        cardLastFour: attrs.card_last_four || undefined,
        testMode: attrs.test_mode,
        updatedAt: now,
    };

    // Resolve billing interval from variant
    const billingInterval = getBillingIntervalFromVariantId(attrs.variant_id);
    update.billingInterval = billingInterval;

    if (planId) {
        update.planId = planId;
    }
    if (limits) {
        update.limits = limits;
    }
    if (attrs.trial_ends_at) {
        update.trialEndsAt = new Date(attrs.trial_ends_at).getTime();
    }
    if (attrs.ends_at) {
        update.endsAt = new Date(attrs.ends_at).getTime();
    }
    if (attrs.cancelled) {
        update.cancelledAt = now;
    }

    return update;
}

/**
 * Upsert subscription record in Firestore.
 * Path: tenants/{tenantId}/billing/subscription
 */
export async function upsertSubscription(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    data: SubscriptionRecord | Partial<SubscriptionRecord>,
): Promise<void> {
    await db.collection('tenants').doc(tenantId)
        .collection('billing').doc('subscription')
        .set(data, { merge: true });
}

/**
 * Create an entry in the LS subscription map for reverse lookup.
 * Path: ls_subscription_map/{lsSubscriptionId}
 */
export async function createSubscriptionMapEntry(
    db: FirebaseFirestore.Firestore,
    lsSubscriptionId: string,
    tenantId: string,
    planId: string,
): Promise<void> {
    const entry: LsSubscriptionMapEntry = {
        tenantId,
        planId,
        createdAt: Date.now(),
    };
    await db.collection('ls_subscription_map').doc(lsSubscriptionId).set(entry);
}

/**
 * Find tenant ID by Lemon Squeezy subscription ID.
 * Uses the ls_subscription_map collection for O(1) lookup.
 */
export async function findTenantByLsSubscriptionId(
    db: FirebaseFirestore.Firestore,
    lsSubscriptionId: string,
): Promise<string | null> {
    const doc = await db.collection('ls_subscription_map').doc(lsSubscriptionId).get();
    if (!doc.exists) return null;
    return (doc.data() as LsSubscriptionMapEntry)?.tenantId || null;
}

/**
 * Log billing activity to tenant activity log.
 * Path: tenants/{tenantId}/activity_logs
 */
export async function logBillingActivity(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    eventType: string,
    details: Record<string, unknown>,
): Promise<void> {
    await db.collection('tenants').doc(tenantId)
        .collection('activity_logs').add({
            type: 'billing',
            event: eventType,
            details,
            timestamp: Date.now(),
        });
}

/**
 * Check if a subscription is currently active.
 * Handles active, on_trial, and cancelled-but-not-yet-expired states.
 */
export function isSubscriptionActive(sub: SubscriptionRecord | null | undefined): boolean {
    if (!sub) return false;

    const now = Date.now();

    switch (sub.status) {
        case 'active':
            return true;
        case 'on_trial':
            return (sub.trialEndsAt || 0) > now;
        case 'cancelled':
            // Cancelled but still in paid period
            return (sub.endsAt || sub.currentPeriodEnd || 0) > now;
        case 'past_due':
            // Grace period — still allow access
            return true;
        case 'paused':
        case 'unpaid':
        case 'expired':
            return false;
        default:
            return false;
    }
}

/**
 * Get subscription record for a tenant.
 * Path: tenants/{tenantId}/billing/subscription
 */
export async function getSubscription(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<SubscriptionRecord | null> {
    const doc = await db.collection('tenants').doc(tenantId)
        .collection('billing').doc('subscription').get();
    if (!doc.exists) return null;
    return doc.data() as SubscriptionRecord;
}
