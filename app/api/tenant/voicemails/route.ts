/**
 * Tenant Voicemails API
 *
 * GET  /api/tenant/voicemails — List voicemails for current tenant
 * PATCH /api/tenant/voicemails — Update voicemail status (listened/archived)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

/**
 * GET — List voicemails for the authenticated tenant.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { tenantId } = auth;
        const url = new URL(request.url);
        const includeArchived = url.searchParams.get('archived') === 'true';

        let query = getDb()
            .collection('tenants').doc(tenantId)
            .collection('voicemails')
            .orderBy('createdAt', 'desc')
            .limit(50);

        if (!includeArchived) {
            query = getDb()
                .collection('tenants').doc(tenantId)
                .collection('voicemails')
                .where('status', 'in', ['new', 'listened'])
                .orderBy('createdAt', 'desc')
                .limit(50);
        }

        const snap = await query.get();
        const voicemails = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({ voicemails });

    } catch (error) {
        return handleApiError(error, 'TenantVoicemails.GET');
    }
}

/**
 * PATCH — Update voicemail status.
 */
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { tenantId, uid } = auth;
        const body = await request.json();
        const { voicemailId, status } = body;

        if (!voicemailId || !status) {
            return NextResponse.json(
                { error: 'voicemailId and status are required' },
                { status: 400 },
            );
        }

        if (!['listened', 'archived'].includes(status)) {
            return NextResponse.json(
                { error: 'Invalid status. Use: listened, archived' },
                { status: 400 },
            );
        }

        const updateData: Record<string, unknown> = { status };

        if (status === 'listened') {
            updateData.listenedAt = FieldValue.serverTimestamp();
            updateData.listenedBy = uid;
        }

        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('voicemails').doc(voicemailId)
            .update(updateData);

        return NextResponse.json({ success: true });

    } catch (error) {
        return handleApiError(error, 'TenantVoicemails.PATCH');
    }
}
