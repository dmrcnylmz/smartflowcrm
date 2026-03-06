/**
 * Dashboard Stats API — Server-side aggregated metrics
 *
 * GET /api/dashboard
 *
 * Returns aggregated stats for the tenant:
 * - KPI cards (today's calls, missed, complaints, appointments)
 * - Call trend (last 7 days)
 * - Complaint distribution by category
 * - Recent activity
 * - Usage/billing summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';
import { getPipelineSummary, getLatencyStats } from '@/lib/billing/analytics';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

function getTenantId(request: NextRequest): string | null {
    return request.headers.get('x-user-tenant')
        || request.headers.get('x-user-uid')
        || null;
}

export async function GET(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        const firestore = getDb();
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const tenantRef = firestore.collection('tenants').doc(tenantId);

        // Helper: run a query safely — returns empty result on failure (e.g. missing index)
        const emptySnap = { docs: [], size: 0, empty: true } as unknown as FirebaseFirestore.QuerySnapshot;
        const safeQuery = (q: FirebaseFirestore.Query) =>
            q.get().catch(() => {
                return emptySnap;
            });

        // ─── Parallel Queries (with .select() projections to reduce bandwidth) ───
        const [
            todayCallsSnap,
            recentCallsSnap,
            openComplaintsSnap,
            allComplaintsSnap,
            upcomingApptsSnap,
            usageSnap,
            kbStatsSnap,
            activitySnap,
        ] = await Promise.all([
            // Today's calls — only need status for answered/missed classification
            safeQuery(tenantRef.collection('calls')
                .where('startedAt', '>=', todayStart)
                .select('startedAt', 'status')),

            // Last 7 days calls (for trend chart) — need date, status, duration
            safeQuery(tenantRef.collection('calls')
                .where('startedAt', '>=', sevenDaysAgo)
                .orderBy('startedAt', 'desc')
                .select('startedAt', 'status', 'durationSeconds')),

            // Open complaints — only .size is used
            safeQuery(tenantRef.collection('complaints')
                .where('status', 'in', ['open', 'investigating'])
                .select('status')),

            // Recent complaints (last 30 days for category distribution)
            safeQuery(tenantRef.collection('complaints')
                .where('createdAt', '>=', thirtyDaysAgo)
                .select('createdAt', 'category')),

            // Upcoming appointments — only .size is used
            safeQuery(tenantRef.collection('appointments')
                .where('status', '==', 'scheduled')
                .where('dateTime', '>=', now)
                .select('status')),

            // Usage stats — single document, no projection needed
            tenantRef.collection('usage').doc('current').get()
                .catch(() => ({ exists: false, data: () => ({}) }) as unknown as FirebaseFirestore.DocumentSnapshot),

            // KB stats — only .size is used
            safeQuery(tenantRef.collection('kb_documents')
                .where('status', '==', 'ready')
                .select('status')),

            // Recent activity (last 20) — need all display fields
            safeQuery(tenantRef.collection('activity_logs')
                .orderBy('createdAt', 'desc')
                .limit(20)
                .select('type', 'description', 'createdAt', 'metadata', 'from', 'customerName', 'phoneNumber', 'title', 'planId')),
        ]);

        // ─── Process KPI Cards ───
        const todayCalls = todayCallsSnap.docs;
        const answeredToday = todayCalls.filter(d => d.data().status !== 'no-answer' && d.data().status !== 'missed');
        const missedToday = todayCalls.filter(d => d.data().status === 'no-answer' || d.data().status === 'missed');

        const kpis = {
            todayCalls: todayCalls.length,
            answeredCalls: answeredToday.length,
            missedCalls: missedToday.length,
            answerRate: todayCalls.length > 0
                ? Math.round((answeredToday.length / todayCalls.length) * 100)
                : 0,
            openComplaints: openComplaintsSnap.size,
            upcomingAppointments: upcomingApptsSnap.size,
        };

        // ─── Call Trend (Last 7 Days) ───
        const callTrend: Record<string, { date: string; total: number; answered: number; missed: number; avgDuration: number }> = {};

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];
            callTrend[key] = {
                date: key,
                total: 0,
                answered: 0,
                missed: 0,
                avgDuration: 0,
            };
        }

        const dayDurations: Record<string, number[]> = {};

        for (const doc of recentCallsSnap.docs) {
            const data = doc.data();
            const callDate = data.startedAt?.toDate?.();
            if (!callDate) continue;

            const key = callDate.toISOString().split('T')[0];
            if (!callTrend[key]) continue;

            callTrend[key].total++;

            if (data.status === 'no-answer' || data.status === 'missed') {
                callTrend[key].missed++;
            } else {
                callTrend[key].answered++;
            }

            if (data.durationSeconds) {
                if (!dayDurations[key]) dayDurations[key] = [];
                dayDurations[key].push(data.durationSeconds);
            }
        }

        // Calculate average durations
        for (const [key, durations] of Object.entries(dayDurations)) {
            if (callTrend[key] && durations.length > 0) {
                callTrend[key].avgDuration = Math.round(
                    durations.reduce((a, b) => a + b, 0) / durations.length
                );
            }
        }

        // ─── Complaint Categories ───
        const complaintCategories: Record<string, number> = {};
        for (const doc of allComplaintsSnap.docs) {
            const category = doc.data().category || 'Diğer';
            complaintCategories[category] = (complaintCategories[category] || 0) + 1;
        }

        // ─── Usage Summary ───
        const usageData = usageSnap.exists ? usageSnap.data() : {};
        const usage = {
            totalCalls: usageData?.totalCalls || 0,
            inboundCalls: usageData?.inboundCalls || 0,
            totalMinutes: usageData?.totalMinutes || 0,
            lastCallAt: usageData?.lastCallAt?.toDate?.()?.toISOString() || null,
            kbDocuments: kbStatsSnap.size,
        };

        // ─── Recent Activity ───
        const activity = activitySnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.type,
                description: data.description || getActivityDescription(data),
                createdAt: data.createdAt?.toDate?.()?.toISOString()
                    || (typeof data.createdAt === 'number' ? new Date(data.createdAt).toISOString() : null),
                metadata: data.metadata || {},
            };
        });

        // ─── Voice Pipeline Summary (fire-and-forget safe) ───
        let voicePipeline = null;
        try {
            const [summary, latency] = await Promise.all([
                getPipelineSummary(firestore, tenantId, 30),
                getLatencyStats(firestore, tenantId, 7),
            ]);
            voicePipeline = {
                totalCalls: summary.totalCalls,
                avgPipelineMs: summary.avgPipelineMs || latency.avgPipelineMs,
                avgSttMs: latency.avgSttMs,
                avgLlmMs: latency.avgLlmMs,
                avgTtsMs: latency.avgTtsMs,
                totalTtsChars: summary.totalTtsChars,
                estimatedCostUsd: summary.estimatedCostUsd,
                emergencyModeActive: summary.emergencyModeActive,
                callsTrend: summary.callsTrend,
            };
        } catch {
            // Non-critical — dashboard still works without pipeline data
        }

        // ─── Response ───
        return NextResponse.json({
            kpis,
            callTrend: Object.values(callTrend),
            complaintCategories: Object.entries(complaintCategories).map(([name, value]) => ({ name, value })),
            usage,
            activity,
            voicePipeline,
            generatedAt: now.toISOString(),
        }, {
            headers: { 'Cache-Control': 'private, max-age=0, s-maxage=10, stale-while-revalidate=30' },
        });

    } catch {
        // Return empty structure so frontend can show demo mode
        return NextResponse.json({
            kpis: {
                todayCalls: 0,
                answeredCalls: 0,
                missedCalls: 0,
                answerRate: 0,
                openComplaints: 0,
                upcomingAppointments: 0,
            },
            callTrend: [],
            complaintCategories: [],
            usage: { totalCalls: 0, inboundCalls: 0, totalMinutes: 0, lastCallAt: null, kbDocuments: 0 },
            activity: [],
            error: 'Failed to load dashboard data',
            generatedAt: new Date().toISOString(),
        });
    }
}

// ─── Helper: Activity description in Turkish ───
function getActivityDescription(data: Record<string, unknown>): string {
    const type = data.type as string;
    switch (type) {
        case 'call_completed':
            return `Çağrı tamamlandı: ${data.from || 'Bilinmeyen numara'}`;
        case 'call_missed':
            return `Cevapsız çağrı: ${data.from || 'Bilinmeyen numara'}`;
        case 'complaint_created':
            return `Yeni şikayet: ${data.customerName || 'Müşteri'}`;
        case 'complaint_resolved':
            return `Şikayet çözüldü: ${data.customerName || 'Müşteri'}`;
        case 'appointment_created':
            return `Yeni randevu: ${data.customerName || 'Müşteri'}`;
        case 'appointment_completed':
            return `Randevu tamamlandı: ${data.customerName || 'Müşteri'}`;
        case 'phone_registered':
            return `Telefon numarası kaydedildi: ${data.phoneNumber || ''}`;
        case 'phone_unregistered':
            return `Telefon numarası kaldırıldı: ${data.phoneNumber || ''}`;
        case 'kb_document_added':
            return `Bilgi tabanına belge eklendi: ${data.title || ''}`;
        case 'kb_document_deleted':
            return `Bilgi tabanından belge silindi`;
        case 'subscription_activated':
            return `Abonelik aktifleştirildi: ${data.planId || ''}`;
        default:
            return type?.replace(/_/g, ' ') || 'Aktivite';
    }
}
