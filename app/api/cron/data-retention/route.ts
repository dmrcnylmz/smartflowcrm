/**
 * Data Retention Cron Job
 *
 * GET /api/cron/data-retention
 *
 * Runs daily via Vercel Cron at 03:00 UTC.
 * Finds and deletes expired records based on tenant retention policies.
 * Supports KVKK (Turkey) and GDPR (EU) retention rules.
 *
 * Collections cleaned:
 * - recordings (default: 60 days for KVKK, 90 days for GDPR)
 * - transcripts/call_logs (default: 365 days)
 * - voicemails (default: 90 days)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { findExpiredRecords, getRetentionPolicy } from '@/lib/compliance/audit';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

/** Collection → retention policy field mapping */
const RETENTION_COLLECTIONS = [
    { collection: 'recordings', policyField: 'recordings' as const, timestampField: 'createdAt' },
    { collection: 'calls', policyField: 'transcripts' as const, timestampField: 'startedAt' },
    { collection: 'voicemails', policyField: 'voicemails' as const, timestampField: 'createdAt' },
] as const;

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret) {
            if (authHeader !== `Bearer ${cronSecret}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        } else if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
        }

        const database = getDb();
        const stats = {
            tenantsProcessed: 0,
            totalDeleted: 0,
            errors: [] as string[],
            details: [] as { tenantId: string; collection: string; deleted: number }[],
        };

        // Get all tenants
        const tenantsSnap = await database.collection('tenants').select().get();

        for (const tenantDoc of tenantsSnap.docs) {
            const tenantId = tenantDoc.id;
            stats.tenantsProcessed++;

            try {
                // Get tenant-specific retention policy
                const policy = await getRetentionPolicy(database, tenantId);

                for (const { collection, policyField, timestampField } of RETENTION_COLLECTIONS) {
                    const retentionDays = policy[policyField] ?? 365;

                    // Skip if retention is 0 (keep forever)
                    if (retentionDays <= 0) continue;

                    try {
                        const expiredPaths = await findExpiredRecords(
                            database,
                            tenantId,
                            collection,
                            retentionDays,
                            timestampField,
                        );

                        if (expiredPaths.length > 0) {
                            // Batch delete (max 500 per batch — Firestore limit)
                            const batch = database.batch();
                            for (const path of expiredPaths) {
                                batch.delete(database.doc(path));
                            }
                            await batch.commit();

                            stats.totalDeleted += expiredPaths.length;
                            stats.details.push({
                                tenantId,
                                collection,
                                deleted: expiredPaths.length,
                            });

                            console.log(
                                `[DataRetention] Deleted ${expiredPaths.length} expired ${collection} for tenant ${tenantId} (policy: ${retentionDays} days)`,
                            );
                        }
                    } catch (err) {
                        const msg = `Failed to clean ${collection} for ${tenantId}: ${err instanceof Error ? err.message : err}`;
                        stats.errors.push(msg);
                        console.error(`[DataRetention] ${msg}`);
                    }
                }
            } catch (err) {
                const msg = `Failed to process tenant ${tenantId}: ${err instanceof Error ? err.message : err}`;
                stats.errors.push(msg);
                console.error(`[DataRetention] ${msg}`);
            }
        }

        console.log(
            `[DataRetention] Complete: ${stats.tenantsProcessed} tenants, ${stats.totalDeleted} records deleted, ${stats.errors.length} errors`,
        );

        return NextResponse.json({
            success: true,
            ...stats,
        });
    } catch (error) {
        return handleApiError(error, 'Data retention cron');
    }
}
