/**
 * Billing Checkout API — Lemon Squeezy Checkout Session
 *
 * POST: Creates a Lemon Squeezy checkout URL for subscription payment.
 *       The user is redirected to LS hosted checkout page.
 *       custom_data.tenant_id is embedded in the checkout for webhook correlation.
 *
 * Request body:
 * {
 *   planId: "starter" | "professional" | "enterprise"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   checkoutUrl: "https://callception.lemonsqueezy.com/checkout/..."
 * }
 *
 * GET: Returns available plans for pricing display (public).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCheckout, PLANS, type BillingInterval } from '@/lib/billing/lemonsqueezy';
import { handleApiError } from '@/lib/utils/error-handler';
import { getAppUrl } from '@/lib/utils/get-app-url';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkCheckoutRateLimit(key: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
        return true;
    }
    if (entry.count >= 5) return false; // 5 checkouts per minute
    entry.count++;
    return true;
}

// Zod schema for request validation
const checkoutSchema = z.object({
    planId: z.enum(['starter', 'professional', 'enterprise']),
    billingInterval: z.enum(['monthly', 'yearly']).default('monthly'),
});

/**
 * POST: Create a Lemon Squeezy checkout URL
 */
export async function POST(request: NextRequest) {
    try {
        const rateLimitKey = request.headers.get('x-user-tenant') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
        if (!checkCheckoutRateLimit(rateLimitKey)) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        // Auth: Full Firebase Admin SDK verification (not just middleware headers)
        const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const tenantId = auth.tenantId;
        const userId = auth.uid;
        const userEmail = auth.email || request.headers.get('x-user-email');

        // Role check: load from Firestore (not spoofable headers)
        const { initAdmin } = await import('@/lib/auth/firebase-admin');
        const { getFirestore } = await import('firebase-admin/firestore');
        const app = initAdmin();
        const db = getFirestore(app);
        const memberDoc = await db.collection('tenants').doc(tenantId).collection('members').doc(userId).get();
        const userRole = memberDoc.exists ? memberDoc.data()?.role : null;

        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json(
                { error: 'Yalnızca sahip ve yöneticiler faturalandırmayı yönetebilir.' },
                { status: 403 }
            );
        }

        // Parse and validate request body
        const body = await request.json();
        const parsed = checkoutSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Geçersiz plan. Seçenekler: starter, professional, enterprise' },
                { status: 400 }
            );
        }

        const { planId, billingInterval } = parsed.data;

        // Build redirect URL (runtime read — avoids Next.js build-time inlining)
        const appUrl = getAppUrl();
        const redirectUrl = `${appUrl}/billing?payment=success&plan=${planId}&interval=${billingInterval}`;

        // Create Lemon Squeezy checkout
        const result = await createCheckout({
            tenantId,
            planId,
            billingInterval,
            userEmail: userEmail || '',
            userId,
            redirectUrl,
        });

        if (result.success && result.checkoutUrl) {
            return NextResponse.json({
                success: true,
                checkoutUrl: result.checkoutUrl,
            });
        } else {
            return NextResponse.json(
                { error: result.error || 'Ödeme sayfası oluşturulamadı.' },
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
            priceYearlyTry: plan.priceYearlyTry,
            includedMinutes: plan.includedMinutes,
            includedCalls: plan.includedCalls,
            maxConcurrentSessions: plan.maxConcurrentSessions,
            features: plan.features,
        }));

        return NextResponse.json({ plans });
    } catch {
        return NextResponse.json(
            { error: 'Plan listesi yüklenemedi.' },
            { status: 500 }
        );
    }
}
