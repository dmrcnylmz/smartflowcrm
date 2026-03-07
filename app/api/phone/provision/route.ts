/**
 * Phone Number Provisioning API
 *
 * POST /api/phone/provision
 *
 * Unified endpoint for provisioning phone numbers.
 * Routes to the correct provider based on country:
 * - Turkey (TR) → SIP Trunk pool allocation
 * - Global       → Twilio Native API purchase
 *
 * Auth: Bearer token required (requireStrictAuth)
 * Subscription: Must be active
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { checkSubscriptionActive } from '@/lib/billing/subscription-guard';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';
import { provisionNumber } from '@/lib/phone/gateway';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Subscription guard
        const subGuard = await checkSubscriptionActive(getDb(), auth.tenantId);
        if (!subGuard.active) {
            return NextResponse.json(
                { error: 'Abonelik aktif değil', message: subGuard.reason },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['country']);
        if (validation) return errorResponse(validation);

        const { country, areaCode, carrier } = body;

        // Validate country code format (2 letters)
        if (typeof country !== 'string' || country.length !== 2) {
            return NextResponse.json(
                { error: 'Geçersiz ülke kodu. ISO 3166-1 alpha-2 format gerekli (örn: TR, US)' },
                { status: 400 },
            );
        }

        const result = await provisionNumber(getDb(), auth.tenantId, country.toUpperCase(), {
            areaCode,
            carrier,
        });

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Numara tahsisi başarısız' },
                { status: 422 },
            );
        }

        return NextResponse.json({
            success: true,
            phoneNumber: result.phoneNumber,
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'Phone Provision');
    }
}
