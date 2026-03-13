/**
 * @deprecated Phone provisioning has moved to per-agent activation flow.
 * Use POST /api/agents/activate instead — it handles subscription checks,
 * agent-to-number binding, and tenant activation in a single step.
 *
 * This route is kept temporarily for backward compatibility with any
 * in-flight onboarding sessions. It will be removed in a future release.
 *
 * ─────────────────────────────────────────────────────────────────────
 *
 * Onboarding Phone Provision API
 *
 * POST /api/onboarding/provision-phone
 *
 * Provisions a phone number for a newly onboarded tenant.
 *
 * Cost-aware provisioning:
 * - Turkey (TR) → SIP Pool: allowed during onboarding (pre-purchased, no extra cost)
 * - Global (US, GB, etc.) → Twilio Native: REQUIRES active paid subscription
 *   because each number purchase charges ~$1/month to master Twilio account
 *
 * Body: { country: string, areaCode?: string, carrier?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { provisionNumber } from '@/lib/phone/gateway';
import { getProviderForCountry } from '@/lib/phone/types';
import { checkSubscriptionActive } from '@/lib/billing/subscription-guard';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { country, areaCode, carrier } = body;

        // Validate country
        if (!country || typeof country !== 'string' || country.length !== 2) {
            return NextResponse.json(
                { error: 'Geçerli bir ülke kodu gerekli (ör: TR, US, GB)' },
                { status: 400 },
            );
        }

        const countryUpper = country.toUpperCase();
        const providerType = getProviderForCountry(countryUpper);

        // ─── Cost Guard: Twilio Native purchases cost real money ───
        // For non-TR countries, Twilio charges ~$1/month per number to our master account.
        // Only allow this for tenants with an active PAID subscription.
        if (providerType === 'TWILIO_NATIVE') {
            const subGuard = await checkSubscriptionActive(getDb(), auth.tenantId);

            // Reject free trial or inactive subscriptions for Twilio Native
            if (!subGuard.active || subGuard.planId === 'free_trial') {
                return NextResponse.json(
                    {
                        error: 'Uluslararası numara almak için aktif bir ödeme planına sahip olmanız gerekir. Lütfen önce bir plan seçin.',
                        code: 'SUBSCRIPTION_REQUIRED',
                        requiresSubscription: true,
                        canSkip: true,
                    },
                    { status: 402 },
                );
            }
        }

        // Provision number via gateway (routes TR→pool, others→Twilio)
        const result = await provisionNumber(
            getDb(),
            auth.tenantId,
            countryUpper,
            { areaCode, carrier },
        );

        if (!result.success) {
            // TR pool maintenance mode
            if (result.error === 'TR_POOL_MAINTENANCE') {
                return NextResponse.json(
                    {
                        error: result.maintenanceMessage || 'Türkiye numara havuzu bakımda',
                        code: 'TR_POOL_MAINTENANCE',
                        maintenance: true,
                        canSkip: true,
                    },
                    { status: 503 },
                );
            }

            return NextResponse.json(
                {
                    error: result.error || 'Numara tahsisi başarısız',
                    canSkip: true, // Onboarding'de skip edebilir
                },
                { status: 422 },
            );
        }

        // Update tenant config with default country
        await getDb().collection('tenants').doc(auth.tenantId).set({
            phone: {
                defaultCountry: countryUpper,
                autoProvision: true,
            },
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        return NextResponse.json({
            success: true,
            phoneNumber: result.phoneNumber,
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'OnboardingProvisionPhone');
    }
}
