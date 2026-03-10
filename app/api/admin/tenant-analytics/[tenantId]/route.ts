/**
 * Tenant Detail Analytics API
 *
 * GET /api/admin/tenant-analytics/:tenantId
 *
 * Returns detailed analytics for a single tenant:
 * - Tenant config
 * - Subscription info
 * - Members list
 * - Usage history (6 months)
 * - Cost breakdown
 * - Entity counts (calls, appointments, complaints, customers)
 *
 * Requires super-admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireSuperAdmin } from '@/lib/utils/require-super-admin';
import { handleApiError } from '@/lib/utils/error-handler';
import { getTenant, getTenantMembers } from '@/lib/tenant/admin';
import { getUsage, getUsageHistory, estimateCost } from '@/lib/billing/metering';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ tenantId: string }> },
) {
    try {
        const auth = await requireSuperAdmin(request);
        if (auth.error) return auth.error;

        const { tenantId } = await params;

        if (!tenantId) {
            return NextResponse.json({ error: 'tenantId gerekli' }, { status: 400 });
        }

        const database = getDb();

        // 1. Get tenant config
        const tenant = await getTenant(tenantId);
        if (!tenant) {
            return NextResponse.json({ error: 'Tenant bulunamadı' }, { status: 404 });
        }

        // 2. Parallel fetch all detail data
        const [
            members,
            currentUsage,
            usageHistory,
            subscriptionSnap,
            callsCount,
            appointmentsCount,
            complaintsCount,
            customersCount,
        ] = await Promise.all([
            getTenantMembers(tenantId).catch(() => []),
            getUsage(database, tenantId).catch(() => ({ tenantId })),
            getUsageHistory(database, tenantId, 6).catch(() => []),
            database.collection('tenants').doc(tenantId)
                .collection('billing').doc('subscription').get()
                .catch(() => null),
            database.collection('tenants').doc(tenantId)
                .collection('calls').count().get()
                .catch(() => null),
            database.collection('tenants').doc(tenantId)
                .collection('appointments').count().get()
                .catch(() => null),
            database.collection('tenants').doc(tenantId)
                .collection('complaints').count().get()
                .catch(() => null),
            database.collection('tenants').doc(tenantId)
                .collection('customers').count().get()
                .catch(() => null),
        ]);

        const subscription = subscriptionSnap?.exists
            ? subscriptionSnap.data()
            : null;

        // Determine plan from subscription
        let planId = 'starter';
        if (subscription?.planId) {
            planId = subscription.planId as string;
        } else if (subscription?.variantName) {
            const name = (subscription.variantName as string).toLowerCase();
            if (name.includes('enterprise') || name.includes('kurumsal')) planId = 'enterprise';
            else if (name.includes('professional') || name.includes('profesyonel')) planId = 'professional';
        } else if (tenant.quotas?.monthlyCalls >= 10000) {
            planId = 'enterprise';
        } else if (tenant.quotas?.monthlyCalls >= 2000) {
            planId = 'professional';
        }

        const costBreakdown = estimateCost(currentUsage, planId);

        // Calculate cost for historical usage too
        const historyWithCost = usageHistory.map(u => ({
            ...u,
            costBreakdown: estimateCost(u, planId),
        }));

        return NextResponse.json({
            tenant: {
                id: tenant.id,
                companyName: tenant.companyName,
                sector: tenant.sector,
                language: tenant.language,
                active: tenant.active,
                createdAt: tenant.createdAt,
                updatedAt: tenant.updatedAt,
                agent: tenant.agent,
                business: tenant.business,
                quotas: tenant.quotas,
            },
            subscription: subscription ? {
                status: subscription.status || 'unknown',
                planId,
                planName: subscription.productName || subscription.variantName || planId,
                billingInterval: subscription.billingInterval || 'monthly',
                currentPeriodStart: subscription.currentPeriodStart || null,
                currentPeriodEnd: subscription.currentPeriodEnd || null,
                renewsAt: subscription.renewsAt || null,
                cardBrand: subscription.cardBrand || null,
                cardLastFour: subscription.cardLastFour || null,
            } : null,
            members: members.map(m => ({
                uid: m.uid,
                email: m.email || null,
                displayName: m.displayName || null,
                role: m.role,
                assignedAt: m.assignedAt,
            })),
            currentUsage: {
                ...currentUsage,
                costBreakdown,
            },
            usageHistory: historyWithCost,
            entityCounts: {
                calls: callsCount?.data()?.count ?? 0,
                appointments: appointmentsCount?.data()?.count ?? 0,
                complaints: complaintsCount?.data()?.count ?? 0,
                customers: customersCount?.data()?.count ?? 0,
            },
        });
    } catch (error) {
        return handleApiError(error, 'TenantAnalyticsDetail');
    }
}
