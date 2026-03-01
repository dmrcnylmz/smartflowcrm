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

        console.log('[Cron] Running appointment reminders...');

        const firestore = getDb();
        const now = new Date();
        const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const in1Hour = new Date(now.getTime() + 1 * 60 * 60 * 1000);

        // Get all active tenants
        const tenantsSnap = await firestore
            .collection('tenants')
            .where('active', '==', true)
            .get();

        let totalReminders = 0;
        let totalErrors = 0;

        for (const tenantDoc of tenantsSnap.docs) {
            const tenantId = tenantDoc.id;
            const tenantData = tenantDoc.data();

            // Find upcoming appointments (next 24 hours, not yet reminded)
            const appointmentsSnap = await firestore
                .collection('tenants').doc(tenantId)
                .collection('appointments')
                .where('status', '==', 'scheduled')
                .where('dateTime', '>=', now)
                .where('dateTime', '<=', in24Hours)
                .get();

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

                try {
                    const result = await sendAppointmentReminder({
                        customerName: apt.customerName || 'Değerli Müşterimiz',
                        customerEmail,
                        appointmentDate: formatDate(aptTime),
                        appointmentTime: formatTime(aptTime),
                        companyName: tenantData.companyName || tenantId,
                        companyPhone: tenantData.business?.phone,
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
                        console.log(`[Cron] ✅ Reminder sent: ${customerEmail} (${tenantId})`);
                    } else {
                        totalErrors++;
                        console.error(`[Cron] ❌ Reminder failed: ${customerEmail}: ${result.error}`);
                    }
                } catch (err) {
                    totalErrors++;
                    console.error(`[Cron] ❌ Reminder error for ${customerEmail}:`, err);
                }
            }
        }

        console.log(`[Cron] Done: ${totalReminders} reminders sent, ${totalErrors} errors`);

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
