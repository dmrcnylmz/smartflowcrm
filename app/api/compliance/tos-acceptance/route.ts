/**
 * Terms of Service Acceptance API for Outbound Calling
 *
 * POST /api/compliance/tos-acceptance — record ToS acceptance
 * GET  /api/compliance/tos-acceptance — check if tenant accepted
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { logAudit } from '@/lib/compliance/audit';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

/**
 * GET: Check if the current tenant has accepted outbound calling ToS
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const docRef = getDb()
            .collection('tenants').doc(auth.tenantId)
            .collection('compliance').doc('outbound_tos');

        const snap = await docRef.get();

        if (!snap.exists) {
            return NextResponse.json({ accepted: false });
        }

        const data = snap.data();
        return NextResponse.json({
            accepted: data?.accepted === true,
            version: data?.version || null,
            acceptedAt: data?.acceptedAt || null,
            acceptedBy: data?.acceptedBy || null,
        });
    } catch (error) {
        return handleApiError(error, 'ToS acceptance GET');
    }
}

/**
 * POST: Record that the tenant admin accepted outbound calling ToS
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { accepted, version } = body;

        if (accepted !== true) {
            return NextResponse.json(
                { error: 'accepted must be true' },
                { status: 400 },
            );
        }

        if (!version || typeof version !== 'string') {
            return NextResponse.json(
                { error: 'version is required (string)' },
                { status: 400 },
            );
        }

        const docRef = getDb()
            .collection('tenants').doc(auth.tenantId)
            .collection('compliance').doc('outbound_tos');

        await docRef.set({
            accepted: true,
            version,
            acceptedBy: auth.uid,
            acceptedByEmail: auth.email || null,
            acceptedAt: FieldValue.serverTimestamp(),
        });

        await logAudit(getDb(), {
            tenantId: auth.tenantId,
            userId: auth.uid,
            action: 'admin.setting_change',
            resource: 'outbound_tos',
            details: { accepted: true, version },
        });

        return NextResponse.json(
            { message: 'ToS accepted', version },
            { status: 201 },
        );
    } catch (error) {
        return handleApiError(error, 'ToS acceptance POST');
    }
}
