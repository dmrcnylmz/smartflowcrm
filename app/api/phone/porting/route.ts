/**
 * Number Porting API — BYON (Bring Your Own Number)
 *
 * GET   /api/phone/porting              — List porting requests
 * POST  /api/phone/porting              — Create new porting request
 * PATCH /api/phone/porting              — Update status (admin) or complete porting
 *
 * Tenants see only their own requests. Admins see all.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';
import {
    createPortingRequest,
    updatePortingStatus,
    completePorting,
    listPortingRequests,
} from '@/lib/phone/porting';
import type { PortingStatus, SipCarrier } from '@/lib/phone/types';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// GET: List porting requests
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status') as PortingStatus | undefined;
        const role = request.headers.get('x-user-role');
        const isAdmin = role && ['owner', 'admin'].includes(role);

        // Admins see all requests, tenants see only their own
        const tenantFilter = isAdmin ? undefined : auth.tenantId;

        const requests = await listPortingRequests(getDb(), tenantFilter, status || undefined);

        return NextResponse.json({
            requests,
            count: requests.length,
        });

    } catch (error) {
        return handleApiError(error, 'Porting GET');
    }
}

// =============================================
// POST: Create new porting request
// =============================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const validation = requireFields(body, ['phoneNumber', 'currentCarrier', 'targetCarrier']);
        if (validation) return errorResponse(validation);

        const { phoneNumber, currentCarrier, targetCarrier, notes, documents } = body;

        // Validate targetCarrier
        const validCarriers: SipCarrier[] = ['netgsm', 'bulutfon', 'other'];
        if (!validCarriers.includes(targetCarrier)) {
            return NextResponse.json(
                { error: `Geçersiz hedef operatör. Geçerli değerler: ${validCarriers.join(', ')}` },
                { status: 400 },
            );
        }

        const portingRequest = await createPortingRequest(getDb(), auth.tenantId, {
            phoneNumber,
            currentCarrier,
            targetCarrier,
            notes,
            documents,
        });

        return NextResponse.json({
            success: true,
            request: portingRequest,
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'Porting POST');
    }
}

// =============================================
// PATCH: Update status (admin) or complete porting
// =============================================

export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Admin-only for status updates
        const role = request.headers.get('x-user-role');
        if (!role || !['owner', 'admin'].includes(role)) {
            return NextResponse.json(
                { error: 'Yalnızca yöneticiler taşıma durumunu güncelleyebilir' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['requestId']);
        if (validation) return errorResponse(validation);

        const { requestId, status, adminNotes, estimatedCompletionDate, action } = body;

        // Complete porting (special action)
        if (action === 'complete') {
            const phoneNumber = await completePorting(getDb(), requestId);
            return NextResponse.json({
                success: true,
                message: 'Numara taşıma tamamlandı ve tenant\'a atandı',
                phoneNumber,
            });
        }

        // Regular status update
        if (!status) {
            return NextResponse.json(
                { error: 'status veya action=complete gerekli' },
                { status: 400 },
            );
        }

        const validStatuses: PortingStatus[] = ['pending', 'submitted', 'in_progress', 'completed', 'rejected'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Geçersiz durum. Geçerli değerler: ${validStatuses.join(', ')}` },
                { status: 400 },
            );
        }

        await updatePortingStatus(getDb(), requestId, status, adminNotes, estimatedCompletionDate);

        return NextResponse.json({
            success: true,
            message: `Taşıma talebi durumu güncellendi: ${status}`,
        });

    } catch (error) {
        return handleApiError(error, 'Porting PATCH');
    }
}
