/**
 * iyzico Payment Service — Turkish Payment Gateway Integration
 *
 * Handles subscription billing for SmartFlow CRM:
 * - Checkout form initialization (iyzico hosted payment page)
 * - Payment verification
 * - Subscription management in Firestore
 * - TRY currency pricing
 *
 * Flow:
 * 1. Frontend calls /api/billing/checkout → gets iyzico payment form HTML
 * 2. User completes payment on iyzico hosted page
 * 3. iyzico redirects to callback URL → /api/billing/webhook verifies & activates
 * 4. Subscription stored in tenants/{tenantId}/billing/subscription
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import Iyzipay from 'iyzipay';

// =============================================
// Types
// =============================================

export interface SubscriptionPlan {
    id: string;
    name: string;
    nameTr: string;
    description: string;
    priceTry: number;         // Monthly price in TRY
    includedMinutes: number;
    includedCalls: number;
    maxConcurrentSessions: number;
    features: string[];
}

export interface SubscriptionRecord {
    tenantId: string;
    planId: string;
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    currentPeriodStart: number;  // epoch ms
    currentPeriodEnd: number;    // epoch ms
    paymentToken?: string;       // iyzico stored card token for recurring
    lastPaymentId?: string;
    lastPaymentDate?: number;
    canceledAt?: number;
    trialEndsAt?: number;
    createdAt: number;
    updatedAt: number;
}

export interface CheckoutResult {
    status: 'success' | 'failure';
    checkoutFormContent?: string;  // HTML to render iyzico payment form
    token?: string;                // iyzico conversation token
    errorMessage?: string;
}

export interface PaymentResult {
    status: 'success' | 'failure';
    paymentId?: string;
    paidPrice?: number;
    currency?: string;
    cardAssociation?: string;
    cardFamily?: string;
    lastFourDigits?: string;
    errorMessage?: string;
    errorCode?: string;
}

// =============================================
// Subscription Plans (TRY pricing)
// =============================================

export const PLANS: Record<string, SubscriptionPlan> = {
    starter: {
        id: 'starter',
        name: 'Starter',
        nameTr: 'Başlangıç',
        description: 'Girişimler ve küçük işletmeler için ideal AI paket.',
        priceTry: 990,  // ₺990/ay
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
        priceTry: 2990,  // ₺2990/ay
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
        priceTry: 7990,  // ₺7990/ay
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
// iyzico Client
// =============================================

let iyzicoClient: Iyzipay | null = null;

function getIyzicoClient(): Iyzipay {
    if (!iyzicoClient) {
        const apiKey = process.env.IYZICO_API_KEY;
        const secretKey = process.env.IYZICO_SECRET_KEY;
        const baseUrl = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';

        if (!apiKey || !secretKey) {
            throw new Error('iyzico API credentials not configured. Set IYZICO_API_KEY and IYZICO_SECRET_KEY.');
        }

        iyzicoClient = new Iyzipay({
            apiKey,
            secretKey,
            uri: baseUrl,
        });
    }
    return iyzicoClient;
}

// =============================================
// Checkout Form (Hosted Payment Page)
// =============================================

/**
 * Initialize iyzico checkout form for subscription payment.
 * Returns HTML content that renders iyzico's hosted payment form.
 */
export async function createCheckoutForm(options: {
    tenantId: string;
    planId: string;
    buyer: {
        id: string;
        name: string;
        surname: string;
        email: string;
        phone?: string;
        identityNumber?: string;   // TC Kimlik No
        city?: string;
        country?: string;
        address?: string;
        ip: string;
    };
    callbackUrl: string;
}): Promise<CheckoutResult> {
    const { tenantId, planId, buyer, callbackUrl } = options;
    const plan = PLANS[planId];

    if (!plan) {
        return { status: 'failure', errorMessage: `Unknown plan: ${planId}` };
    }

    const iyzico = getIyzicoClient();
    const conversationId = `sub_${tenantId}_${Date.now()}`;
    const priceStr = plan.priceTry.toFixed(2);

    const request = {
        locale: Iyzipay.LOCALE.TR,
        conversationId,
        price: priceStr,
        paidPrice: priceStr,
        currency: Iyzipay.CURRENCY.TRY,
        basketId: `basket_${tenantId}_${planId}`,
        paymentGroup: Iyzipay.PAYMENT_GROUP.SUBSCRIPTION,
        callbackUrl,
        enabledInstallments: [1],  // Only single payment for subscription
        buyer: {
            id: buyer.id,
            name: buyer.name,
            surname: buyer.surname,
            gsmNumber: buyer.phone || '+905000000000',
            email: buyer.email,
            identityNumber: buyer.identityNumber || '11111111111',  // TC fallback
            lastLoginDate: new Date().toISOString().split('T')[0] + ' ' + new Date().toISOString().split('T')[1].split('.')[0],
            registrationDate: new Date().toISOString().split('T')[0] + ' ' + new Date().toISOString().split('T')[1].split('.')[0],
            registrationAddress: buyer.address || 'Türkiye',
            ip: buyer.ip,
            city: buyer.city || 'Istanbul',
            country: buyer.country || 'Turkey',
        },
        shippingAddress: {
            contactName: `${buyer.name} ${buyer.surname}`,
            city: buyer.city || 'Istanbul',
            country: buyer.country || 'Turkey',
            address: buyer.address || 'Türkiye',
        },
        billingAddress: {
            contactName: `${buyer.name} ${buyer.surname}`,
            city: buyer.city || 'Istanbul',
            country: buyer.country || 'Turkey',
            address: buyer.address || 'Türkiye',
        },
        basketItems: [
            {
                id: planId,
                name: `SmartFlow ${plan.name} - Aylık Abonelik`,
                category1: 'SaaS Abonelik',
                category2: 'AI Asistan',
                itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
                price: priceStr,
            },
        ],
    };

    return new Promise<CheckoutResult>((resolve) => {
        iyzico.checkoutFormInitialize.create(request as any, (err: any, result: any) => {
            if (err) {
                console.error('[iyzico] Checkout form error:', err);
                resolve({ status: 'failure', errorMessage: err.message || 'iyzico error' });
                return;
            }

            if (result.status === 'success') {
                resolve({
                    status: 'success',
                    checkoutFormContent: result.checkoutFormContent,
                    token: result.token,
                });
            } else {
                console.error('[iyzico] Checkout form failed:', result.errorMessage);
                resolve({
                    status: 'failure',
                    errorMessage: result.errorMessage || 'Payment form creation failed',
                });
            }
        });
    });
}

// =============================================
// Payment Verification
// =============================================

/**
 * Verify payment after iyzico callback.
 * Called from webhook endpoint with the token from callback.
 */
export async function verifyPayment(token: string): Promise<PaymentResult> {
    const iyzico = getIyzicoClient();

    return new Promise<PaymentResult>((resolve) => {
        iyzico.checkoutForm.retrieve(
            { locale: Iyzipay.LOCALE.TR, token } as any,
            (err: any, result: any) => {
                if (err) {
                    console.error('[iyzico] Payment verification error:', err);
                    resolve({ status: 'failure', errorMessage: err.message || 'Verification error' });
                    return;
                }

                if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
                    resolve({
                        status: 'success',
                        paymentId: result.paymentId,
                        paidPrice: parseFloat(result.paidPrice),
                        currency: result.currency,
                        cardAssociation: result.cardAssociation,
                        cardFamily: result.cardFamily,
                        lastFourDigits: result.lastFourDigits,
                    });
                } else {
                    resolve({
                        status: 'failure',
                        errorMessage: result.errorMessage || 'Payment not successful',
                        errorCode: result.errorCode,
                    });
                }
            }
        );
    });
}

// =============================================
// Subscription Management (Firestore)
// =============================================

/**
 * Activate subscription after successful payment.
 * Stores subscription record in tenants/{tenantId}/billing/subscription
 */
export async function activateSubscription(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    planId: string,
    paymentId: string,
): Promise<SubscriptionRecord> {
    const now = Date.now();
    const periodEnd = now + 30 * 24 * 60 * 60 * 1000; // +30 days

    const subscription: SubscriptionRecord = {
        tenantId,
        planId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        lastPaymentId: paymentId,
        lastPaymentDate: now,
        createdAt: now,
        updatedAt: now,
    };

    // Save subscription record
    await db.collection('tenants').doc(tenantId)
        .collection('billing').doc('subscription')
        .set(subscription, { merge: true });

    // Update tenant quotas based on plan
    const plan = PLANS[planId];
    if (plan) {
        await db.collection('tenants').doc(tenantId).update({
            'quotas.dailyMinutes': Math.ceil(plan.includedMinutes / 30),
            'quotas.monthlyCalls': plan.includedCalls,
            'quotas.maxConcurrentSessions': plan.maxConcurrentSessions,
            updatedAt: new Date().toISOString(),
        });
    }

    // Log billing activity
    await db.collection('tenants').doc(tenantId)
        .collection('activity_logs').add({
            type: 'subscription_activated',
            planId,
            paymentId,
            amount: plan?.priceTry || 0,
            currency: 'TRY',
            createdAt: now,
        });

    return subscription;
}

/**
 * Get current subscription for a tenant.
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

/**
 * Cancel subscription (marks as canceled, active until period end).
 */
export async function cancelSubscription(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<void> {
    const now = Date.now();

    await db.collection('tenants').doc(tenantId)
        .collection('billing').doc('subscription')
        .update({
            status: 'canceled',
            canceledAt: now,
            updatedAt: now,
        });

    // Log activity
    await db.collection('tenants').doc(tenantId)
        .collection('activity_logs').add({
            type: 'subscription_canceled',
            createdAt: now,
        });
}

/**
 * Check if a subscription is active (not expired and not canceled).
 */
export function isSubscriptionActive(sub: SubscriptionRecord | null): boolean {
    if (!sub) return false;
    if (sub.status === 'canceled' && sub.currentPeriodEnd < Date.now()) return false;
    if (sub.status === 'active' || sub.status === 'trialing') return true;
    if (sub.status === 'canceled' && sub.currentPeriodEnd >= Date.now()) return true; // grace period
    return false;
}

/**
 * Get payment history for a tenant.
 */
export async function getPaymentHistory(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    limit: number = 10,
): Promise<Array<Record<string, unknown>>> {
    const snap = await db.collection('tenants').doc(tenantId)
        .collection('activity_logs')
        .where('type', 'in', ['subscription_activated', 'subscription_canceled', 'payment_received'])
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// =============================================
// Helpers
// =============================================

/**
 * Start a 14-day trial subscription (no payment required).
 */
export async function startTrial(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    planId: string = 'starter',
): Promise<SubscriptionRecord> {
    const now = Date.now();
    const trialEnd = now + 14 * 24 * 60 * 60 * 1000; // +14 days

    const subscription: SubscriptionRecord = {
        tenantId,
        planId,
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEndsAt: trialEnd,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection('tenants').doc(tenantId)
        .collection('billing').doc('subscription')
        .set(subscription);

    // Update tenant quotas for trial
    const plan = PLANS[planId];
    if (plan) {
        await db.collection('tenants').doc(tenantId).update({
            'quotas.dailyMinutes': Math.ceil(plan.includedMinutes / 30),
            'quotas.monthlyCalls': plan.includedCalls,
            'quotas.maxConcurrentSessions': plan.maxConcurrentSessions,
            updatedAt: new Date().toISOString(),
        });
    }

    // Log activity
    await db.collection('tenants').doc(tenantId)
        .collection('activity_logs').add({
            type: 'trial_started',
            planId,
            trialEndsAt: trialEnd,
            createdAt: now,
        });

    return subscription;
}

/**
 * Get the plan details for display.
 */
export function getPlanDetails(planId: string): SubscriptionPlan | null {
    return PLANS[planId] || null;
}

/**
 * Get all available plans for pricing page.
 */
export function getAllPlans(): SubscriptionPlan[] {
    return Object.values(PLANS);
}
