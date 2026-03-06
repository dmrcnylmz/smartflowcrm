/**
 * Billing Invoices / Activity History API
 *
 * GET /api/billing/invoices
 *
 * Returns billing activity log for the tenant:
 *   - subscription_created, subscription_updated, subscription_cancelled
 *   - payment_success, payment_failed, payment_refunded
 *   - subscription_paused, subscription_resumed, subscription_expired
 *
 * Authentication: via middleware (x-user-tenant header)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant kimliği gerekli.' }, { status: 403 });
        }

        const limit = Math.min(
            parseInt(request.nextUrl.searchParams.get('limit') || '50', 10),
            100,
        );

        // Fetch billing activity logs from activity_logs (type='billing')
        const snapshot = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('activity_logs')
            .where('type', '==', 'billing')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const activities = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.event || data.type,
                details: data.details || {},
                createdAt: data.timestamp
                    ? new Date(data.timestamp).toISOString()
                    : data.createdAt || null,
            };
        });

        return NextResponse.json({
            activities,
            count: activities.length,
        }, {
            headers: { 'Cache-Control': 'private, max-age=30' },
        });

    } catch (error) {
        console.error('[billing/invoices] Error:', error);
        return NextResponse.json(
            { error: 'Fatura geçmişi alınamadı.' },
            { status: 500 },
        );
    }
}
