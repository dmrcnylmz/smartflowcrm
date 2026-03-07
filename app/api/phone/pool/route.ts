/**
 * Number Pool Management API (Admin Only)
 *
 * GET    /api/phone/pool          — Pool statistics + number list
 * POST   /api/phone/pool          — Add numbers to pool
 * DELETE /api/phone/pool          — Remove number from pool
 *
 * Only accessible by owner/admin roles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';
import { addToPool, removeFromPool, getPoolStats, listPoolNumbers } from '@/lib/phone/number-pool';
import type { SipCarrier } from '@/lib/phone/types';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// GET: Pool stats + list
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Admin-only check
        const role = request.headers.get('x-user-role');
        if (!role || !['owner', 'admin'].includes(role)) {
            return NextResponse.json(
                { error: 'Yalnızca yöneticiler havuz verilerini görüntüleyebilir' },
                { status: 403 },
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status') || undefined;
        const carrier = searchParams.get('carrier') as SipCarrier | undefined;

        const [stats, numbers] = await Promise.all([
            getPoolStats(getDb()),
            listPoolNumbers(getDb(), { status, carrier }),
        ]);

        return NextResponse.json({
            stats,
            numbers,
            count: numbers.length,
        });

    } catch (error) {
        return handleApiError(error, 'Phone Pool GET');
    }
}

// =============================================
// POST: Add numbers to pool
// =============================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Admin-only check
        const role = request.headers.get('x-user-role');
        if (!role || !['owner', 'admin'].includes(role)) {
            return NextResponse.json(
                { error: 'Yalnızca yöneticiler havuza numara ekleyebilir' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['numbers']);
        if (validation) return errorResponse(validation);

        if (!Array.isArray(body.numbers) || body.numbers.length === 0) {
            return NextResponse.json(
                { error: 'En az bir numara gerekli. Format: [{ phone, carrier, rate }]' },
                { status: 400 },
            );
        }

        // Validate each entry
        for (const entry of body.numbers) {
            if (!entry.phone || !entry.carrier || entry.rate === undefined) {
                return NextResponse.json(
                    { error: 'Her numara phone, carrier ve rate alanlarına sahip olmalı' },
                    { status: 400 },
                );
            }
        }

        const result = await addToPool(getDb(), body.numbers);

        return NextResponse.json({
            success: true,
            added: result.added,
            skipped: result.skipped,
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'Phone Pool POST');
    }
}

// =============================================
// DELETE: Remove number from pool
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Admin-only check
        const role = request.headers.get('x-user-role');
        if (!role || !['owner', 'admin'].includes(role)) {
            return NextResponse.json(
                { error: 'Yalnızca yöneticiler havuzdan numara çıkarabilir' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['poolEntryId']);
        if (validation) return errorResponse(validation);

        await removeFromPool(getDb(), body.poolEntryId);

        return NextResponse.json({
            success: true,
            message: 'Numara havuzdan çıkarıldı',
        });

    } catch (error) {
        return handleApiError(error, 'Phone Pool DELETE');
    }
}
