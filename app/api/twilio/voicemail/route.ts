/**
 * Twilio Voicemail Recording Callback
 *
 * POST /api/twilio/voicemail
 *
 * Called by Twilio when a voicemail recording is completed.
 * Stores voicemail metadata in Firestore: tenants/{tenantId}/voicemails/{id}
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

        // Extract params from query string
        const url = new URL(request.url);
        const tenantId = url.searchParams.get('tenantId');
        const callSid = params.CallSid || url.searchParams.get('callSid');

        if (!tenantId) {
            console.error('[Voicemail] Missing tenantId');
            return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
        }

        const recordingUrl = params.RecordingUrl;
        const recordingSid = params.RecordingSid;
        const recordingDuration = parseInt(params.RecordingDuration || '0', 10);
        const callerNumber = params.From || params.Caller || 'unknown';

        // Store voicemail in Firestore
        const voicemailData = {
            tenantId,
            callSid: callSid || null,
            from: callerNumber,
            recordingUrl: recordingUrl || null,
            recordingSid: recordingSid || null,
            durationSeconds: recordingDuration,
            status: 'new', // new | listened | archived
            createdAt: FieldValue.serverTimestamp(),
            listenedAt: null,
            listenedBy: null,
        };

        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('voicemails')
            .add(voicemailData);

        // Update voicemail count on tenant
        await getDb()
            .collection('tenants').doc(tenantId)
            .set({
                voicemailCount: FieldValue.increment(1),
                lastVoicemailAt: FieldValue.serverTimestamp(),
            }, { merge: true });

        // Also update the call record if we have a callSid
        if (callSid) {
            await getDb()
                .collection('tenants').doc(tenantId)
                .collection('calls').doc(callSid)
                .set({
                    hasVoicemail: true,
                    voicemailUrl: recordingUrl || null,
                    voicemailDuration: recordingDuration,
                }, { merge: true });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Voicemail] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
