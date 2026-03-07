/**
 * Super-Admin Stats API
 *
 * GET /api/admin/stats — System-wide metrics dashboard
 *
 * Returns:
 *   - Total tenants count
 *   - Active phone numbers (by provider type)
 *   - Number pool stats
 *   - Recent call activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireSuperAdmin } from '@/lib/utils/require-super-admin';
import { getPoolStats } from '@/lib/phone/number-pool';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (auth.error) return auth.error;

        const database = getDb();

        // Run parallel queries for performance
        const [
            tenantsSnap,
            phoneNumbersSnap,
            portingSnap,
            poolStats,
        ] = await Promise.all([
            database.collection('tenants').count().get(),
            database.collection('tenant_phone_numbers').get(),
            database.collection('porting_requests').where('status', 'in', ['pending', 'submitted', 'in_progress']).get(),
            getPoolStats(database),
        ]);

        // Count phone numbers by provider type
        let twilioCount = 0;
        let sipTrunkCount = 0;
        let legacyCount = 0;

        phoneNumbersSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.providerType === 'TWILIO_NATIVE') twilioCount++;
            else if (data.providerType === 'SIP_TRUNK') sipTrunkCount++;
            else legacyCount++;
        });

        return NextResponse.json({
            tenants: {
                total: tenantsSnap.data().count,
            },
            phoneNumbers: {
                total: phoneNumbersSnap.size,
                twilioNative: twilioCount,
                sipTrunk: sipTrunkCount,
                legacy: legacyCount,
            },
            pool: poolStats,
            porting: {
                activeRequests: portingSnap.size,
            },
        });

    } catch (error) {
        return handleApiError(error, 'AdminStats');
    }
}
