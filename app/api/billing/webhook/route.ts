/**
 * Billing Webhook API — iyzico Payment Callback
 *
 * POST: Called by iyzico after payment attempt
 *
 * Flow:
 * 1. iyzico sends POST with token
 * 2. We verify the payment using the token
 * 3. If successful, activate subscription
 * 4. Redirect user to billing page with success/failure status
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyPayment, activateSubscription } from '@/lib/billing/iyzico-service';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        // iyzico sends the token in POST body (form-encoded)
        const contentType = request.headers.get('content-type') || '';
        let token: string | null = null;

        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            token = formData.get('token') as string;
        } else {
            const body = await request.json().catch(() => ({}));
            token = body.token;
        }

        // Get context from query params
        const url = new URL(request.url);
        const tenantId = url.searchParams.get('tenantId');
        const planId = url.searchParams.get('planId');
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        if (!token) {
            console.error('[Webhook] No payment token received');
            return NextResponse.redirect(`${appUrl}/billing?payment=error&reason=no_token`);
        }

        if (!tenantId || !planId) {
            console.error('[Webhook] Missing tenantId or planId');
            return NextResponse.redirect(`${appUrl}/billing?payment=error&reason=missing_context`);
        }

        // Verify payment with iyzico
        // Verifying payment with iyzico
        const paymentResult = await verifyPayment(token);

        if (paymentResult.status === 'success' && paymentResult.paymentId) {
            // Payment successful - activate subscription
            // Payment verified successfully; activating subscription

            await activateSubscription(
                getDb(),
                tenantId,
                planId,
                paymentResult.paymentId,
            );

            // Store payment record
            await getDb().collection('tenants').doc(tenantId)
                .collection('billing').doc('pending_checkout')
                .update({
                    status: 'completed',
                    paymentId: paymentResult.paymentId,
                    paidPrice: paymentResult.paidPrice,
                    currency: paymentResult.currency,
                    cardAssociation: paymentResult.cardAssociation,
                    cardFamily: paymentResult.cardFamily,
                    lastFourDigits: paymentResult.lastFourDigits,
                    completedAt: Date.now(),
                });

            // Redirect to billing page with success
            return NextResponse.redirect(
                `${appUrl}/billing?payment=success&plan=${planId}`
            );

        } else {
            // Payment failed
            console.error(`[Webhook] Payment failed: ${paymentResult.errorMessage}`);

            // Update pending checkout
            await getDb().collection('tenants').doc(tenantId)
                .collection('billing').doc('pending_checkout')
                .update({
                    status: 'failed',
                    errorMessage: paymentResult.errorMessage,
                    errorCode: paymentResult.errorCode,
                    failedAt: Date.now(),
                }).catch(() => {/* ignore */});

            return NextResponse.redirect(
                `${appUrl}/billing?payment=failed&reason=${encodeURIComponent(paymentResult.errorMessage || 'unknown')}`
            );
        }

    } catch (error) {
        console.error('[Webhook] Error:', error);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        return NextResponse.redirect(`${appUrl}/billing?payment=error&reason=server_error`);
    }
}

/**
 * GET: Subscription status endpoint
 */
export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant required' }, { status: 403 });
        }

        const doc = await getDb().collection('tenants').doc(tenantId)
            .collection('billing').doc('subscription').get();

        if (!doc.exists) {
            return NextResponse.json({
                subscription: null,
                message: 'No active subscription',
            });
        }

        const sub = doc.data();

        // Check if subscription is still active
        const isActive = sub?.status === 'active' ||
            (sub?.status === 'trialing' && (sub?.trialEndsAt || 0) > Date.now()) ||
            (sub?.status === 'canceled' && (sub?.currentPeriodEnd || 0) > Date.now());

        return NextResponse.json({
            subscription: {
                ...sub,
                isActive,
            },
        });

    } catch (error) {
        console.error('[Webhook GET] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch subscription' },
            { status: 500 }
        );
    }
}
