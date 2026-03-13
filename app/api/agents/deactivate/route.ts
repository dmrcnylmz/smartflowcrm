/**
 * Agent Deactivation API
 *
 * POST /api/agents/deactivate
 *
 * Deactivates an agent by:
 * 1. Setting agent isActive = false
 * 2. Removing agent binding from phone number
 * 3. Optionally releasing the phone number entirely
 * 4. If no other active agents → set assistantEnabled = false
 *
 * Body: { agentId, releaseNumber?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { unassignNumberFromAgent, releaseNumber } from '@/lib/phone/gateway';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { tenantId } = auth;
        const body = await request.json();
        const { agentId, releaseNumber: shouldRelease } = body;

        if (!agentId) {
            return NextResponse.json(
                { error: 'Missing agentId', message: 'Asistan ID gerekli.' },
                { status: 400 },
            );
        }

        // ── 1. Agent Ownership Check ───────────────────────────────────
        const agentRef = getDb()
            .collection('tenants').doc(tenantId)
            .collection('agents').doc(agentId);
        const agentSnap = await agentRef.get();

        if (!agentSnap.exists) {
            return NextResponse.json(
                { error: 'Agent not found', message: 'Asistan bulunamadı.' },
                { status: 404 },
            );
        }

        const agentData = agentSnap.data()!;
        const agentPhoneNumber = agentData.phoneNumber;

        // ── 2. Deactivate Agent ────────────────────────────────────────
        await agentRef.update({
            isActive: false,
            deactivatedAt: FieldValue.serverTimestamp(),
        });

        // ── 3. Handle Phone Number ─────────────────────────────────────
        if (agentPhoneNumber) {
            try {
                if (shouldRelease) {
                    // Release the number entirely (back to pool or Twilio)
                    await releaseNumber(getDb(), tenantId, agentPhoneNumber);
                } else {
                    // Just remove agent binding, keep number assigned to tenant
                    await unassignNumberFromAgent(getDb(), tenantId, agentPhoneNumber);
                }
            } catch (phoneError) {
                // Non-critical: agent is already deactivated, log and continue
                console.warn('[agents/deactivate] Phone cleanup warning:', phoneError);
            }
        }

        // ── 4. Check if any other agents are still active ──────────────
        const activeAgentsSnap = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('agents')
            .where('isActive', '==', true)
            .limit(1)
            .get();

        if (activeAgentsSnap.empty) {
            // No active agents left → disable assistant
            await getDb().collection('tenants').doc(tenantId).set(
                {
                    settings: { assistantEnabled: false },
                },
                { merge: true },
            );
        }

        return NextResponse.json({
            success: true,
            agentId,
            numberReleased: shouldRelease && !!agentPhoneNumber,
            assistantEnabled: !activeAgentsSnap.empty,
            message: 'Asistan devre dışı bırakıldı.',
        });

    } catch (error) {
        console.error('[agents/deactivate] Error:', error);
        const message = error instanceof Error ? error.message : 'Deaktivasyon başarısız';
        return NextResponse.json(
            { error: 'Deactivation failed', message },
            { status: 500 },
        );
    }
}
