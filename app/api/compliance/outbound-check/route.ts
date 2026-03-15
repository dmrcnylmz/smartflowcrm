/**
 * Pre-flight Outbound Compliance Check API
 *
 * POST /api/compliance/outbound-check
 * Body: { phoneNumber }
 *
 * Returns OutboundComplianceCheck result.
 * UI calls this BEFORE initiating an outbound call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { runOutboundComplianceCheck } from '@/lib/compliance/outbound-compliance';
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
        const { phoneNumber } = body;

        if (!phoneNumber) {
            return NextResponse.json(
                { error: 'phoneNumber is required' },
                { status: 400 },
            );
        }

        const result = await runOutboundComplianceCheck(
            auth.tenantId,
            phoneNumber,
            'en', // language for compliance messages
            getDb(),
        );

        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'Outbound compliance check');
    }
}
