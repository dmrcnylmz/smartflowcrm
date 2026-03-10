/**
 * Tenant Analytics API — Platform Overview + Tenant List
 *
 * GET /api/admin/tenant-analytics
 *
 * Returns platform-wide KPIs and a full tenant list with usage data.
 * Requires super-admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireSuperAdmin } from '@/lib/utils/require-super-admin';
import { handleApiError } from '@/lib/utils/error-handler';
import { listTenants } from '@/lib/tenant/admin';
import { getUsage, estimateCost, SUBSCRIPTION_TIERS } from '@/lib/billing/metering';
import type { TenantConfig } from '@/lib/tenant/types';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// Helper to safely extract plan ID from subscription or tenant data
function extractPlanId(subscription: Record<string, unknown> | null, tenant: TenantConfig): string {
    if (subscription?.planId && typeof subscription.planId === 'string') {
        return subscription.planId;
    }
    // Fallback: check variant name for tier mapping
    if (subscription?.variantName && typeof subscription.variantName === 'string') {
        const name = (subscription.variantName as string).toLowerCase();
        if (name.includes('enterprise') || name.includes('kurumsal')) return 'enterprise';
        if (name.includes('professional') || name.includes('profesyonel')) return 'professional';
        if (name.includes('starter') || name.includes('başlangıç')) return 'starter';
    }
    // Default based on quotas
    if (tenant.quotas?.monthlyCalls >= 10000) return 'enterprise';
    if (tenant.quotas?.monthlyCalls >= 2000) return 'professional';
    return 'starter';
}

// Helper to get subscription status
function getSubscriptionStatus(subscription: Record<string, unknown> | null): string {
    if (!subscription) return 'none';
    if (subscription.status && typeof subscription.status === 'string') {
        return subscription.status;
    }
    return 'unknown';
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (auth.error) return auth.error;

        const database = getDb();

        // 1. Get all tenants
        const tenants = await listTenants(500);

        // 2. For each tenant, fetch usage + subscription + member count in parallel
        const enrichedTenants = await Promise.all(
            tenants.map(async (tenant) => {
                try {
                    const [usage, subscriptionSnap, membersSnap] = await Promise.all([
                        getUsage(database, tenant.id).catch(() => ({ tenantId: tenant.id })),
                        database.collection('tenants').doc(tenant.id)
                            .collection('billing').doc('subscription').get()
                            .catch(() => null),
                        database.collection('tenants').doc(tenant.id)
                            .collection('members').count().get()
                            .catch(() => null),
                    ]);

                    const subscription = subscriptionSnap?.exists
                        ? subscriptionSnap.data() as Record<string, unknown>
                        : null;

                    const planId = extractPlanId(subscription, tenant);
                    const costBreakdown = estimateCost(usage, planId);
                    const memberCount = membersSnap?.data()?.count ?? 0;

                    return {
                        id: tenant.id,
                        companyName: tenant.companyName,
                        sector: tenant.sector,
                        active: tenant.active,
                        createdAt: tenant.createdAt,
                        planId,
                        subscriptionStatus: getSubscriptionStatus(subscription),
                        memberCount,
                        usage: {
                            totalCalls: (usage as Record<string, number>).totalCalls || 0,
                            totalMinutes: (usage as Record<string, number>).totalMinutes || 0,
                            estimatedCostUsd: costBreakdown.total,
                        },
                        costBreakdown,
                    };
                } catch {
                    // Return minimal data if enrichment fails for a tenant
                    return {
                        id: tenant.id,
                        companyName: tenant.companyName,
                        sector: tenant.sector,
                        active: tenant.active,
                        createdAt: tenant.createdAt,
                        planId: 'starter',
                        subscriptionStatus: 'unknown',
                        memberCount: 0,
                        usage: { totalCalls: 0, totalMinutes: 0, estimatedCostUsd: 0 },
                        costBreakdown: estimateCost({}, 'starter'),
                    };
                }
            }),
        );

        // 3. Calculate platform-level aggregates
        const activeTenants = enrichedTenants.filter(t => t.active).length;
        const totalUsers = enrichedTenants.reduce((sum, t) => sum + t.memberCount, 0);
        const totalCallsThisMonth = enrichedTenants.reduce((sum, t) => sum + t.usage.totalCalls, 0);
        const totalMinutesThisMonth = enrichedTenants.reduce((sum, t) => sum + t.usage.totalMinutes, 0);

        // MRR: sum of monthly base costs for active tenants with active subscriptions
        const mrr = enrichedTenants
            .filter(t => t.active && ['active', 'on_trial', 'trialing'].includes(t.subscriptionStatus))
            .reduce((sum, t) => {
                const tier = SUBSCRIPTION_TIERS[t.planId];
                return sum + (tier?.monthlyBase || 0);
            }, 0);

        // Platform margin: MRR - total infra costs
        const totalInfraCost = enrichedTenants.reduce((sum, t) => sum + t.costBreakdown.infraCost, 0);
        const platformMargin = Math.round((mrr - totalInfraCost) * 100) / 100;

        return NextResponse.json({
            platform: {
                totalTenants: enrichedTenants.length,
                activeTenants,
                totalUsers,
                totalCallsThisMonth,
                totalMinutesThisMonth,
                mrr,
                platformMargin,
            },
            tenants: enrichedTenants,
        });
    } catch (error) {
        return handleApiError(error, 'TenantAnalytics');
    }
}
