/**
 * Twilio Call Status Callback
 *
 * POST /api/twilio/status
 *
 * Called by Twilio when call status changes (ringing → in-progress → completed).
 * Updates the call record and calculates duration/costs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { meterCallEnd } from '@/lib/billing/metering';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') || '';
        let params: Record<string, string> = {};

        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            formData.forEach((value, key) => { params[key] = String(value); });
        } else {
            params = await request.json();
        }

        const {
            CallSid: callSid,
            CallStatus: callStatus,
            CallDuration: callDuration,
            To: toNumber,
        } = params;

        if (!callSid) {
            return NextResponse.json({ error: 'CallSid required' }, { status: 400 });
        }

        // Find the call record across tenants
        const callQuery = await getDb()
            .collectionGroup('calls')
            .where('callSid', '==', callSid)
            .limit(1)
            .get();

        if (callQuery.empty) {
            console.warn(`[Twilio Status] Call not found: ${callSid}`);
            return NextResponse.json({ ok: true }); // Don't fail Twilio
        }

        const callDoc = callQuery.docs[0];
        const callData = callDoc.data();
        const tenantId = callData.tenantId;

        // Update call status
        const updateData: Record<string, unknown> = {
            status: callStatus,
            updatedAt: FieldValue.serverTimestamp(),
        };

        if (callStatus === 'completed' && callDuration) {
            const durationSecs = parseInt(callDuration, 10) || 0;
            updateData.endedAt = FieldValue.serverTimestamp();
            updateData.durationSeconds = durationSecs;

            // Meter the completed call
            await meterCallEnd(getDb(), tenantId, durationSecs);
        }

        await callDoc.ref.update(updateData);

        return NextResponse.json({ ok: true });

    } catch (error) {
        console.error('[Twilio Status] Error:', error);
        return NextResponse.json({ ok: true }); // Always return 200 to Twilio
    }
}
