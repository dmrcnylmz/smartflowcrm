/**
 * Billing Swap API — Plan / Interval Change via Lemon Squeezy
 *
 * POST: Updates the subscription variant on Lemon Squeezy.
 *       The actual Firestore update happens via webhook (subscription_updated).
 *
 * Request body:
 * {
 *   planId: "starter" | "professional" | "enterprise"
 *   billingInterval: "monthly" | "yearly"
 *   prorate?: boolean (default: true)
 * }
 *
 * Flow:
 * 1. Auth check → owner/admin only
 * 2. Read current subscription from Firestore
 * 3. Calculate new variant ID
 * 4. PATCH subscription on Lemon Squeezy
 * 5. Return success (Firestore update will come from webhook)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVariantId, updateSubscriptionVariant } from '@/lib/billing/lemonsqueezy';
import { handleApiError } from '@/lib/utils/error-handler';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const swapSchema = z.object({
    planId: z.enum(['starter', 'professional', 'enterprise']),
    billingInterval: z.enum(['monthly', 'yearly']).default('monthly'),
    prorate: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
    try {
        // Auth check — middleware injects these headers
        const tenantId = request.headers.get('x-user-tenant');
        const userId = request.headers.get('x-user-id') || request.headers.get('x-user-uid');
        const userRole = request.headers.get('x-user-role');

        if (!tenantId || !userId) {
            return NextResponse.json(
                { error: 'Kimlik doğrulaması gerekli.' },
                { status: 401 }
            );
        }

        // Only owner/admin can manage billing
        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json(
                { error: 'Yalnızca sahip ve yöneticiler faturalandırmayı yönetebilir.' },
                { status: 403 }
            );
        }

        // Parse and validate request body
        const body = await request.json();
        const parsed = swapSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Geçersiz istek. planId ve billingInterval gerekli.' },
                { status: 400 }
            );
        }

        const { planId, billingInterval, prorate } = parsed.data;

        // Get current subscription from Firestore
        initAdmin();
        const db = getFirestore();
        const subDoc = await db.collection('tenants').doc(tenantId)
            .collection('billing').doc('subscription').get();

        if (!subDoc.exists) {
            return NextResponse.json(
                { error: 'Aktif bir abonelik bulunamadı. Önce bir plan satın alın.' },
                { status: 404 }
            );
        }

        const subscription = subDoc.data();
        const lsSubscriptionId = subscription?.lsSubscriptionId;

        if (!lsSubscriptionId) {
            return NextResponse.json(
                { error: 'Abonelik bilgilerinde Lemon Squeezy ID bulunamadı.' },
                { status: 400 }
            );
        }

        // Check if subscription is in a swappable state
        const swappableStatuses = ['active', 'on_trial', 'past_due'];
        if (!swappableStatuses.includes(subscription?.status)) {
            return NextResponse.json(
                { error: `Abonelik durumu "${subscription?.status}" plan değişikliğine uygun değil.` },
                { status: 400 }
            );
        }

        // Check if this is actually a change
        if (subscription?.planId === planId && subscription?.billingInterval === billingInterval) {
            return NextResponse.json(
                { error: 'Zaten bu planda ve ödeme döneminde bulunuyorsunuz.' },
                { status: 400 }
            );
        }

        // Get the new variant ID
        const newVariantId = getVariantId(planId, billingInterval);
        if (!newVariantId) {
            return NextResponse.json(
                { error: `${planId} planının ${billingInterval} varyant ID'si bulunamadı. Ortam değişkenlerini kontrol edin.` },
                { status: 500 }
            );
        }

        // Update subscription on Lemon Squeezy
        const result = await updateSubscriptionVariant(lsSubscriptionId, newVariantId, prorate);

        if (result.success) {
            return NextResponse.json({
                success: true,
                message: 'Plan değişikliği başarılı. Abonelik bilgileriniz birkaç saniye içinde güncellenecek.',
            });
        } else {
            return NextResponse.json(
                { error: result.error || 'Plan değişikliği yapılamadı.' },
                { status: 500 }
            );
        }

    } catch (error) {
        return handleApiError(error, 'BillingSwap');
    }
}
