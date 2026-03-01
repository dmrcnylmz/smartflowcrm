/**
 * Billing Checkout API — iyzico Payment Initiation
 *
 * POST: Creates an iyzico checkout form for subscription payment
 *
 * Request body:
 * {
 *   planId: "starter" | "professional" | "enterprise",
 *   buyer: { name, surname, email, phone?, identityNumber?, city?, address? }
 * }
 *
 * Response:
 * {
 *   checkoutFormContent: "<html>...",  // iyzico payment form HTML
 *   token: "...",                       // conversation token for verification
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createCheckoutForm, PLANS } from '@/lib/billing/iyzico-service';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const tenantId = request.headers.get('x-user-tenant');
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!tenantId || !userId) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        // Only owner/admin can manage billing
        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json(
                { error: 'Only owners and admins can manage billing' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { planId, buyer } = body;

        // Validate plan
        if (!planId || !PLANS[planId]) {
            return NextResponse.json(
                { error: 'Invalid plan. Choose: starter, professional, or enterprise' },
                { status: 400 }
            );
        }

        // Validate buyer info
        if (!buyer?.name || !buyer?.surname || !buyer?.email) {
            return NextResponse.json(
                { error: 'Buyer name, surname, and email are required' },
                { status: 400 }
            );
        }

        // Get client IP
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || '127.0.0.1';

        // Build callback URL
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const callbackUrl = `${appUrl}/api/billing/webhook?tenantId=${tenantId}&planId=${planId}`;

        // Store pending checkout in Firestore for verification
        await getDb().collection('tenants').doc(tenantId)
            .collection('billing').doc('pending_checkout').set({
                planId,
                buyerEmail: buyer.email,
                createdAt: Date.now(),
                status: 'pending',
            });

        // Create iyzico checkout form
        const result = await createCheckoutForm({
            tenantId,
            planId,
            buyer: {
                id: userId,
                name: buyer.name,
                surname: buyer.surname,
                email: buyer.email,
                phone: buyer.phone,
                identityNumber: buyer.identityNumber,
                city: buyer.city,
                country: 'Turkey',
                address: buyer.address,
                ip,
            },
            callbackUrl,
        });

        if (result.status === 'success') {
            return NextResponse.json({
                success: true,
                checkoutFormContent: result.checkoutFormContent,
                token: result.token,
            });
        } else {
            return NextResponse.json(
                { error: result.errorMessage || 'Payment form creation failed' },
                { status: 500 }
            );
        }

    } catch (error) {
        return handleApiError(error, 'BillingCheckout');
    }
}

/**
 * GET: Return available plans for pricing display
 */
export async function GET() {
    try {
        const plans = Object.values(PLANS).map(plan => ({
            id: plan.id,
            name: plan.name,
            nameTr: plan.nameTr,
            description: plan.description,
            priceTry: plan.priceTry,
            includedMinutes: plan.includedMinutes,
            includedCalls: plan.includedCalls,
            maxConcurrentSessions: plan.maxConcurrentSessions,
            features: plan.features,
        }));

        return NextResponse.json({ plans });
    } catch (error) {
        console.error('[Checkout API] Plans error:', error);
        return NextResponse.json(
            { error: 'Failed to load plans' },
            { status: 500 }
        );
    }
}
