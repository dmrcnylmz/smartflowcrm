/**
 * Appointment Reminder Cron Job
 *
 * GET /api/cron/appointment-reminders
 *
 * Runs via Vercel Cron (every hour) or manually triggered.
 * Finds upcoming appointments (next 24h) and sends reminder emails.
 *
 * Vercel cron config: vercel.json → crons
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendAppointmentReminder } from '@/lib/notifications/email-service';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds for cron job

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret (Vercel sets CRON_SECRET)
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // In production, CRON_SECRET must be set; in dev, allow without it
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction && !cronSecret) {
            return handleApiError(new Error('CRON_SECRET not configured in production'), 'CronReminders');
        }

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Appointment reminders cron started

        const firestore = getDb();
        const now = new Date();
        const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // Single collectionGroup query instead of N+1 per-tenant queries
        const appointmentsSnap = await firestore
            .collectionGroup('appointments')
            .where('status', '==', 'scheduled')
            .where('dateTime', '>=', now)
            .where('dateTime', '<=', in24Hours)
            .get();

        // Build tenant cache for company info (lazy-loaded)
        const tenantCache = new Map<string, Record<string, unknown>>();

        async function getTenantData(tenantId: string) {
            if (tenantCache.has(tenantId)) return tenantCache.get(tenantId)!;
            const doc = await firestore.collection('tenants').doc(tenantId).get();
            const data = doc.data() || {};
            tenantCache.set(tenantId, data);
            return data;
        }

        let totalReminders = 0;
        let totalErrors = 0;

        for (const aptDoc of appointmentsSnap.docs) {
            const apt = aptDoc.data();

            // Skip if already reminded
            if (apt.reminderSent) continue;

            // Skip if no customer email
            const customerEmail = apt.customerEmail;
            if (!customerEmail) continue;

            // Determine reminder timing
            const aptTime = apt.dateTime?.toDate?.() || new Date(apt.dateTime);
            const hoursUntil = (aptTime.getTime() - now.getTime()) / (1000 * 60 * 60);

            // Send reminder for appointments within 1-24 hours
            if (hoursUntil < 1 || hoursUntil > 24) continue;

            // Extract tenantId from doc path: tenants/{tenantId}/appointments/{aptId}
            const tenantId = aptDoc.ref.parent.parent?.id;
            if (!tenantId) continue;

            try {
                const tenantData = await getTenantData(tenantId);

                const result = await sendAppointmentReminder({
                    customerName: apt.customerName || 'Değerli Müşterimiz',
                    customerEmail,
                    appointmentDate: formatDate(aptTime),
                    appointmentTime: formatTime(aptTime),
                    companyName: (tenantData.companyName as string) || tenantId,
                    companyPhone: (tenantData.business as Record<string, unknown>)?.phone as string | undefined,
                    notes: apt.notes,
                });

                if (result.success) {
                    // Mark as reminded
                    await aptDoc.ref.update({
                        reminderSent: true,
                        reminderSentAt: FieldValue.serverTimestamp(),
                        reminderEmailId: result.id,
                    });
                    totalReminders++;
                } else {
                    totalErrors++;
                }
            } catch {
                totalErrors++;
            }
        }

        // Cron job complete; counts returned in response JSON

        return NextResponse.json({
            success: true,
            remindersSent: totalReminders,
            errors: totalErrors,
            timestamp: now.toISOString(),
        });

    } catch (error) {
        return handleApiError(error, 'CronReminders');
    }
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
    });
}
