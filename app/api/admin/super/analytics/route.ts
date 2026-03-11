/**
 * Platform Analytics API — Super Admin Only
 * GET /api/admin/super/analytics?range=7d
 *
 * Returns Cloudflare web analytics + Firestore platform metrics
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/utils/require-super-admin';
import { handleApiError } from '@/lib/utils/error-handler';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// Range to days mapping
function rangeToDays(range: string): number {
    switch (range) {
        case '24h': return 1;
        case '30d': return 30;
        case '7d':
        default: return 7;
    }
}

// ---- Cloudflare Analytics ----
async function fetchCloudflareAnalytics(days: number) {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

    if (!token || !zoneId) {
        return null; // Cloudflare not configured
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = new Date().toISOString().split('T')[0];

    // GraphQL query for zone analytics (daily + country breakdown)
    const query = `
        query {
            viewer {
                zones(filter: { zoneTag: "${zoneId}" }) {
                    daily: httpRequests1dGroups(
                        limit: ${days}
                        filter: { date_geq: "${sinceStr}", date_leq: "${untilStr}" }
                        orderBy: [date_ASC]
                    ) {
                        dimensions { date }
                        sum {
                            requests
                            bytes
                            pageViews
                            threats
                        }
                        uniq { uniques }
                    }
                    totals: httpRequests1dGroups(
                        limit: 1
                        filter: { date_geq: "${sinceStr}", date_leq: "${untilStr}" }
                    ) {
                        sum {
                            requests
                            bytes
                            pageViews
                            threats
                            countryMap {
                                clientCountryName
                                requests
                                threats
                                bytes
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });

        if (!res.ok) {
            console.error('[CF Analytics] API error:', res.status);
            return null;
        }

        const data = await res.json();
        const zone = data?.data?.viewer?.zones?.[0];
        const dailyGroups = zone?.daily || [];
        const totalsGroup = zone?.totals?.[0];

        let totalRequests = 0;
        let totalBytes = 0;
        let totalPageViews = 0;
        let totalUniques = 0;
        let totalThreats = 0;
        const dailyData: { date: string; requests: number; pageViews: number; bandwidth: number; threats: number }[] = [];

        for (const group of dailyGroups) {
            totalRequests += group.sum?.requests || 0;
            totalBytes += group.sum?.bytes || 0;
            totalPageViews += group.sum?.pageViews || 0;
            totalThreats += group.sum?.threats || 0;
            totalUniques += group.uniq?.uniques || 0;
            dailyData.push({
                date: group.dimensions?.date || '',
                requests: group.sum?.requests || 0,
                pageViews: group.sum?.pageViews || 0,
                bandwidth: Math.round((group.sum?.bytes || 0) / 1024 / 1024 * 100) / 100,
                threats: group.sum?.threats || 0,
            });
        }

        // Country breakdown from totals
        const countryMap = totalsGroup?.sum?.countryMap || [];
        const countryData: { country: string; requests: number; threats: number; bandwidthMB: number }[] = countryMap
            .map((c: { clientCountryName: string; requests: number; threats: number; bytes: number }) => ({
                country: c.clientCountryName,
                requests: c.requests,
                threats: c.threats,
                bandwidthMB: Math.round(c.bytes / 1024 / 1024 * 100) / 100,
            }))
            .sort((a: { requests: number }, b: { requests: number }) => b.requests - a.requests);

        return {
            requests: totalRequests,
            bandwidthMB: Math.round(totalBytes / 1024 / 1024 * 100) / 100,
            pageViews: totalPageViews,
            uniqueVisitors: totalUniques,
            threats: totalThreats,
            dailyData,
            countryData,
        };
    } catch (err) {
        console.error('[CF Analytics] Fetch error:', err);
        return null;
    }
}

// ---- Firestore Platform Metrics ----
async function fetchPlatformMetrics(firestore: FirebaseFirestore.Firestore, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch all tenants
    const tenantsSnap = await firestore.collection('tenants').get();
    let totalTenants = 0;
    let activeTenants = 0;
    let enterpriseTenants = 0;
    let totalUsers = 0;
    const recentRegistrations: { email: string; companyName: string; plan: string; createdAt: string }[] = [];

    for (const doc of tenantsSnap.docs) {
        const data = doc.data();
        totalTenants++;
        if (data.active !== false) activeTenants++;

        // Count members
        const memberCount = data.members ? Object.keys(data.members).length : 0;
        totalUsers += memberCount;

        // Check recent registration
        const createdAt = data.createdAt?.toDate?.() || (data.createdAt ? new Date(data.createdAt) : null);
        if (createdAt) {
            recentRegistrations.push({
                email: data.companyEmail || data.email || '',
                companyName: data.companyName || doc.id,
                plan: 'free_trial', // will be updated from subscription
                createdAt: createdAt.toISOString(),
            });
        }
    }

    // Fetch subscriptions to get plan info
    const subsSnap = await firestore.collectionGroup('subscription').get();
    const planMap = new Map<string, string>();
    for (const doc of subsSnap.docs) {
        const data = doc.data();
        const tenantId = doc.ref.parent.parent?.id;
        if (tenantId && data.planId) {
            planMap.set(tenantId, data.planId);
            if (data.planId === 'enterprise') enterpriseTenants++;
        }
    }

    // Update recent registrations with plan info
    for (const reg of recentRegistrations) {
        // Find matching tenant
        for (const doc of tenantsSnap.docs) {
            const data = doc.data();
            if ((data.companyEmail || data.email) === reg.email) {
                reg.plan = planMap.get(doc.id) || 'free_trial';
                break;
            }
        }
    }

    // Sort by date descending and take last 20
    recentRegistrations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Fetch call stats for this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let totalCalls = 0;
    let totalMinutes = 0;

    // Query usage subcollections
    for (const doc of tenantsSnap.docs) {
        try {
            const usageSnap = await firestore
                .collection('tenants').doc(doc.id)
                .collection('usage')
                .where('createdAt', '>=', monthStart)
                .get();

            for (const usageDoc of usageSnap.docs) {
                const usage = usageDoc.data();
                if (usage.type === 'call') {
                    totalCalls++;
                    totalMinutes += (usage.durationSeconds || 0) / 60;
                }
            }
        } catch {
            // Skip tenants without usage collection
        }
    }

    return {
        totalTenants,
        activeTenants,
        enterpriseTenants,
        totalUsers,
        totalCallsThisMonth: totalCalls,
        totalMinutesThisMonth: Math.round(totalMinutes),
        recentRegistrations: recentRegistrations.slice(0, 20),
    };
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || '7d';
        const days = rangeToDays(range);

        const firestore = getDb();

        // Fetch both in parallel
        const [cloudflare, platform] = await Promise.all([
            fetchCloudflareAnalytics(days),
            fetchPlatformMetrics(firestore, days),
        ]);

        return NextResponse.json({
            range,
            days,
            cloudflare, // null if not configured
            platform,
            generatedAt: new Date().toISOString(),
        });

    } catch (error) {
        return handleApiError(error, 'Platform Analytics');
    }
}
