/**
 * Webhook Retry Cron Job
 *
 * GET /api/cron/webhook-retry
 *
 * Runs via Vercel Cron (every 5 minutes) or manually triggered.
 * Processes pending webhook retry records with exponential backoff.
 *
 * Retry schedule: 1m → 5m → 15m → 1h → 4h (5 attempts max)
 *
 * Vercel cron config: vercel.json → crons
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { processRetry, getPendingRetries } from '@/lib/webhook/dispatcher';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds — may process many retries

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

        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction && !cronSecret) {
            return NextResponse.json(
                { error: 'Cron security not configured' },
                { status: 503 },
            );
        }

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const firestore = getDb();

        // Fetch pending retries that are due
        const pendingRetries = await getPendingRetries(firestore, 50);

        if (pendingRetries.length === 0) {
            return NextResponse.json({
                success: true,
                processed: 0,
                delivered: 0,
                failed: 0,
                rescheduled: 0,
                timestamp: new Date().toISOString(),
            });
        }

        let delivered = 0;
        let failed = 0;
        let rescheduled = 0;

        // Process retries sequentially to avoid overwhelming target servers
        for (const record of pendingRetries) {
            try {
                const result = await processRetry(firestore, record);
                if (result.success) {
                    delivered++;
                } else {
                    // Check if it was the last attempt
                    const { MAX_RETRY_ATTEMPTS } = await import('@/lib/webhook/types');
                    if (record.attemptNumber + 1 >= MAX_RETRY_ATTEMPTS) {
                        failed++;
                    } else {
                        rescheduled++;
                    }
                }
            } catch {
                // Individual retry failure shouldn't stop processing others
                rescheduled++;
            }
        }

        return NextResponse.json({
            success: true,
            processed: pendingRetries.length,
            delivered,
            failed,
            rescheduled,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return handleApiError(error, 'CronWebhookRetry');
    }
}
