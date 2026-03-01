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
            tenantRef.collection('calls')
                .where('startedAt', '>=', todayStart)
                .select('startedAt', 'status')
                .get(),

            // Last 7 days calls (for trend chart) — need date, status, duration
            tenantRef.collection('calls')
                .where('startedAt', '>=', sevenDaysAgo)
                .orderBy('startedAt', 'desc')
                .select('startedAt', 'status', 'durationSeconds')
                .get(),

            // Open complaints — only .size is used
            tenantRef.collection('complaints')
                .where('status', 'in', ['open', 'investigating'])
                .select('status')
                .get(),

            // Recent complaints (last 30 days for category distribution)
            tenantRef.collection('complaints')
                .where('createdAt', '>=', thirtyDaysAgo)
                .select('createdAt', 'category')
                .get(),

            // Upcoming appointments (next 48 hours) — only .size is used
            tenantRef.collection('appointments')
                .where('status', '==', 'scheduled')
                .where('dateTime', '>=', now)
                .select('status')
                .get(),

            // Usage stats — single document, no projection needed
            tenantRef.collection('usage').doc('current').get(),

            // KB stats — only .size is used
            tenantRef.collection('kb_documents')
                .where('status', '==', 'ready')
                .select('status')
                .get(),

            // Recent activity (last 20) — need all display fields
            tenantRef.collection('activity_logs')
                .orderBy('createdAt', 'desc')
                .limit(20)
                .select('type', 'description', 'createdAt', 'metadata', 'from', 'customerName', 'phoneNumber', 'title', 'planId')
                .get(),
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

        // ─── Response ───
        return NextResponse.json({
            kpis,
            callTrend: Object.values(callTrend),
            complaintCategories: Object.entries(complaintCategories).map(([name, value]) => ({ name, value })),
            usage,
            activity,
            generatedAt: now.toISOString(),
        });

    } catch (error) {
        console.error('[Dashboard API] Error:', error);

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
