/**
 * Pool Availability Status API
 *
 * GET /api/phone/pool/status
 *
 * Returns whether the TR number pool has available numbers.
 * Used by tenant phone management UI to show maintenance state.
 *
 * Auth: Bearer token required
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError } from '@/lib/utils/error-handler';
import { isPoolAvailable } from '@/lib/phone/number-pool';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const pool = await isPoolAvailable(getDb());

        return NextResponse.json({
            trPoolAvailable: pool.available,
            maintenance: !pool.available,
            message: pool.available
                ? undefined
                : 'Türkiye numara havuzu şu anda bakımdadır. Numara tahsisi geçici olarak kullanılamaz.',
        });

    } catch (error) {
        return handleApiError(error, 'Pool Status');
    }
}
