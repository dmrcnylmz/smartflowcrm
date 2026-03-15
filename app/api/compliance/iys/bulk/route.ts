/**
 * Bulk IYS Check API Route
 *
 * POST — Check IYS consent for up to 1000 phone numbers at once.
 * Used for campaign CSV uploads to verify TR numbers before dialing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getDefaultIYSClient, type IYSCheckResult } from '@/lib/compliance/iys-client';
import { handleApiError, requireFields, errorResponse, createApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { hashPhone } from '@/lib/compliance/consent-manager';

export const dynamic = 'force-dynamic';

const MAX_BULK_SIZE = 1000;

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
        const validation = requireFields(body, ['phoneNumbers']);
        if (validation) return errorResponse(validation);

        const { phoneNumbers } = body;

        if (!Array.isArray(phoneNumbers)) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'phoneNumbers bir dizi olmali'));
        }

        if (phoneNumbers.length > MAX_BULK_SIZE) {
            return errorResponse(createApiError(
                'VALIDATION_ERROR',
                `Maksimum ${MAX_BULK_SIZE} numara gonderilebilir (gonderilen: ${phoneNumbers.length})`,
            ));
        }

        if (phoneNumbers.length === 0) {
            return NextResponse.json({ results: [], total: 0 });
        }

        // Run bulk check
        const client = getDefaultIYSClient();
        const results = await client.bulkCheck(phoneNumbers);

        // Cache each result in Firestore
        const database = getDb();
        const batch = database.batch();
        for (const result of results) {
            const cacheDocId = hashPhone(result.phoneNumber);
            const cacheRef = database
                .collection('tenants').doc(auth.tenantId)
                .collection('iys_cache').doc(cacheDocId);
            batch.set(cacheRef, {
                ...result,
                cachedAt: new Date().toISOString(),
            });
        }
        await batch.commit();

        // Build results map
        const resultsMap: Record<string, IYSCheckResult> = {};
        for (const r of results) {
            resultsMap[r.phoneNumber] = r;
        }

        return NextResponse.json({
            results: resultsMap,
            total: results.length,
            approved: results.filter(r => r.status === 'ONAY').length,
            rejected: results.filter(r => r.status === 'RET').length,
            notFound: results.filter(r => r.status === 'NOT_FOUND').length,
            errors: results.filter(r => r.status === 'ERROR').length,
        });

    } catch (error) {
        return handleApiError(error, 'IYS Bulk POST');
    }
}
