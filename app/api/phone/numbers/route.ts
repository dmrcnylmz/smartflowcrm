/**
 * Phone Numbers API — Tenant Number Management
 *
 * GET    /api/phone/numbers — List tenant's phone numbers
 * DELETE /api/phone/numbers — Release a phone number
 *
 * Lists all numbers (SIP Trunk + Twilio Native) for the authenticated tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';
import { listTenantNumbers, releaseNumber } from '@/lib/phone/gateway';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// GET: List tenant's phone numbers
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const numbers = await listTenantNumbers(getDb(), auth.tenantId);

        return NextResponse.json({
            numbers,
            count: numbers.length,
        });

    } catch (error) {
        return handleApiError(error, 'Phone Numbers GET');
    }
}

// =============================================
// DELETE: Release a phone number
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Admin/owner only
        const role = request.headers.get('x-user-role');
        if (!role || !['owner', 'admin'].includes(role)) {
            return NextResponse.json(
                { error: 'Yalnızca yöneticiler numara serbest bırakabilir' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['phoneNumber']);
        if (validation) return errorResponse(validation);

        await releaseNumber(getDb(), auth.tenantId, body.phoneNumber);

        return NextResponse.json({
            success: true,
            message: `Numara serbest bırakıldı: ${body.phoneNumber}`,
        });

    } catch (error) {
        return handleApiError(error, 'Phone Numbers DELETE');
    }
}
