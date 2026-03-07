/**
 * Onboarding Phone Provision API
 *
 * POST /api/onboarding/provision-phone
 *
 * Provisions a phone number for a newly onboarded tenant.
 * Simplified version of /api/phone/provision without subscription guard
 * (new tenants may not have an active subscription yet).
 *
 * Body: { country: string, areaCode?: string, carrier?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { provisionNumber } from '@/lib/phone/gateway';
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

        // Provision number via gateway (routes TR→pool, others→Twilio)
        const result = await provisionNumber(
            getDb(),
            auth.tenantId,
            countryUpper,
            { areaCode, carrier },
        );

        if (!result.success) {
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
