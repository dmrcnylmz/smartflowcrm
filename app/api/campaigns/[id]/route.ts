/**
 * Single Campaign Management API
 *
 * GET    /api/campaigns/[id] — Get campaign details
 * PATCH  /api/campaigns/[id] — Update campaign (pause, resume, cancel)
 * DELETE /api/campaigns/[id] — Delete campaign
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

function tenantCampaigns(tenantId: string) {
    return getDb().collection('tenants').doc(tenantId).collection('campaigns');
}

// =============================================
// GET: Campaign details with contact scores
// =============================================

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { id } = await params;
        const doc = await tenantCampaigns(auth.tenantId).doc(id).get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: 'Campaign not found' },
                { status: 404 },
            );
        }

        return NextResponse.json({ id: doc.id, ...doc.data() });

    } catch (error) {
        return handleApiError(error, 'Campaign GET');
    }
}

// =============================================
// PATCH: Update campaign status
// =============================================

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        const validStatuses = ['draft', 'running', 'paused', 'completed', 'cancelled'];
        if (status && !validStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 },
            );
        }

        const doc = await tenantCampaigns(auth.tenantId).doc(id).get();
        if (!doc.exists) {
            return NextResponse.json(
                { error: 'Campaign not found' },
                { status: 404 },
            );
        }

        const updateData: Record<string, unknown> = {
            updatedAt: FieldValue.serverTimestamp(),
        };

        if (status) updateData.status = status;

        await tenantCampaigns(auth.tenantId).doc(id).update(updateData);

        return NextResponse.json({
            id,
            message: `Campaign updated`,
            status: status || doc.data()?.status,
        });

    } catch (error) {
        return handleApiError(error, 'Campaign PATCH');
    }
}

// =============================================
// DELETE: Remove campaign
// =============================================

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { id } = await params;
        const doc = await tenantCampaigns(auth.tenantId).doc(id).get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: 'Campaign not found' },
                { status: 404 },
            );
        }

        const data = doc.data();
        if (data?.status === 'running') {
            return NextResponse.json(
                { error: 'Cannot delete a running campaign. Pause it first.' },
                { status: 400 },
            );
        }

        await tenantCampaigns(auth.tenantId).doc(id).delete();

        return NextResponse.json({ message: `Campaign ${id} deleted` });

    } catch (error) {
        return handleApiError(error, 'Campaign DELETE');
    }
}
