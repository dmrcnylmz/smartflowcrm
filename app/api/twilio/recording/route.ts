/**
 * Twilio Recording Status Callback
 *
 * POST /api/twilio/recording
 *
 * Called by Twilio when a call recording is completed.
 * Stores the recording URL and metadata in Firestore.
 *
 * Twilio sends:
 * - RecordingSid: unique recording identifier
 * - RecordingUrl: URL to download the recording (without extension)
 * - RecordingStatus: 'completed' | 'failed' | 'absent'
 * - RecordingDuration: duration in seconds
 * - CallSid: associated call
 * - RecordingChannels: number of channels
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

        const {
            RecordingSid: recordingSid,
            RecordingUrl: recordingUrl,
            RecordingStatus: recordingStatus,
            RecordingDuration: recordingDuration,
            CallSid: callSid,
            RecordingChannels: recordingChannels,
        } = params;

        if (!callSid || !recordingSid) {
            console.warn('[Twilio Recording] Missing CallSid or RecordingSid');
            return NextResponse.json({ ok: true });
        }

        // Recording status tracked in Firestore below

        // Find the call record
        const callQuery = await getDb()
            .collectionGroup('calls')
            .where('callSid', '==', callSid)
            .limit(1)
            .get();

        if (callQuery.empty) {
            console.warn(`[Twilio Recording] Call not found: ${callSid}`);
            return NextResponse.json({ ok: true });
        }

        const callDoc = callQuery.docs[0];
        const callData = callDoc.data();
        const tenantId = callData.tenantId;

        if (recordingStatus === 'completed' && recordingUrl) {
            // Update the call record with recording info
            await callDoc.ref.update({
                recording: {
                    sid: recordingSid,
                    url: recordingUrl,
                    // Twilio recording URLs: append .mp3 or .wav for download
                    mp3Url: `${recordingUrl}.mp3`,
                    wavUrl: `${recordingUrl}.wav`,
                    duration: parseInt(recordingDuration, 10) || 0,
                    channels: parseInt(recordingChannels, 10) || 1,
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                },
                updatedAt: FieldValue.serverTimestamp(),
            });

            // Store recording reference in a dedicated collection for easy listing
            await getDb()
                .collection('tenants').doc(tenantId)
                .collection('recordings').doc(recordingSid)
                .set({
                    recordingSid,
                    callSid,
                    tenantId,
                    url: recordingUrl,
                    mp3Url: `${recordingUrl}.mp3`,
                    duration: parseInt(recordingDuration, 10) || 0,
                    status: 'completed',
                    createdAt: FieldValue.serverTimestamp(),
                });

            // Update usage stats
            await getDb()
                .collection('tenants').doc(tenantId)
                .collection('usage').doc('current')
                .set({
                    totalRecordings: FieldValue.increment(1),
                    totalRecordingSeconds: FieldValue.increment(parseInt(recordingDuration, 10) || 0),
                    lastRecordingAt: FieldValue.serverTimestamp(),
                }, { merge: true });

            // Recording saved to Firestore successfully
        } else if (recordingStatus === 'failed') {
            // Mark recording as failed
            await callDoc.ref.update({
                'recording.status': 'failed',
                'recording.sid': recordingSid,
                updatedAt: FieldValue.serverTimestamp(),
            });

            console.warn(`[Twilio Recording] ❌ Failed: ${recordingSid}`);
        }

        return NextResponse.json({ ok: true });

    } catch (error) {
        console.error('[Twilio Recording] Error:', error);
        return NextResponse.json({ ok: true }); // Always return 200 to Twilio
    }
}
