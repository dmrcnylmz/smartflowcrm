/**
 * IYS (Ileti Yonetim Sistemi) API Route
 *
 * GET  — Check IYS consent status for a phone number (cached 24h in Firestore)
 * POST — Register consent in IYS and store locally
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getDefaultIYSClient, type IYSCheckResult } from '@/lib/compliance/iys-client';
import { handleApiError, requireFields, errorResponse, createApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { cacheHeaders } from '@/lib/utils/cache-headers';
import { hashPhone, recordOutboundConsent, type ConsentStatus } from '@/lib/compliance/consent-manager';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

const IYS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================
// GET — Check IYS status for a phone number
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const phone = request.nextUrl.searchParams.get('phone');
        if (!phone) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'phone parametresi gerekli'));
        }

        const database = getDb();
        const cacheDocId = hashPhone(phone);
        const cacheRef = database
            .collection('tenants').doc(auth.tenantId)
            .collection('iys_cache').doc(cacheDocId);

        // Check cache first
        const cached = await cacheRef.get();
        if (cached.exists) {
            const data = cached.data() as IYSCheckResult & { cachedAt: string };
            const cachedAt = new Date(data.cachedAt).getTime();
            if (Date.now() - cachedAt < IYS_CACHE_TTL_MS) {
                return NextResponse.json({
                    ...data,
                    fromCache: true,
                }, { headers: cacheHeaders('SHORT') });
            }
        }

        // Query IYS API
        const client = getDefaultIYSClient();
        const result = await client.checkConsent(phone);

        // Cache result in Firestore
        await cacheRef.set({
            ...result,
            cachedAt: new Date().toISOString(),
        });

        return NextResponse.json({
            ...result,
            fromCache: false,
        }, { headers: cacheHeaders('SHORT') });

    } catch (error) {
        return handleApiError(error, 'IYS GET');
    }
}

// =============================================
// POST — Register consent in IYS
// =============================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const validation = requireFields(body, ['phoneNumber', 'consentDate', 'source']);
        if (validation) return errorResponse(validation);

        const { phoneNumber, consentDate, source, recipientType } = body;

        // Register in IYS
        const client = getDefaultIYSClient();
        const iysResult = await client.addConsent({
            recipientType: recipientType || 'BIREYSEL',
            consentType: 'ARAMA',
            recipient: phoneNumber,
            status: 'ONAY',
            consentDate,
            source,
        });

        // Also store consent locally in consent-manager
        const database = getDb();
        await recordOutboundConsent(database, auth.tenantId, {
            phoneNumber,
            consentStatus: 'granted' as ConsentStatus,
            consentSource: 'iys',
            consentDate,
            country: 'TR',
            iysReferenceId: iysResult.referenceId,
            updatedAt: new Date().toISOString(),
            updatedBy: auth.uid,
        });

        // Invalidate IYS cache for this number
        const cacheDocId = hashPhone(phoneNumber);
        await database
            .collection('tenants').doc(auth.tenantId)
            .collection('iys_cache').doc(cacheDocId)
            .delete();

        return NextResponse.json({
            success: iysResult.success,
            referenceId: iysResult.referenceId,
            error: iysResult.error,
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'IYS POST');
    }
}
