/**
 * Agent Activation API
 *
 * POST /api/agents/activate
 *
 * Activates an agent by:
 * 1. Verifying subscription (free_trial or inactive → 402)
 * 2. Assigning a phone number (existing unassigned or new provisioning)
 * 3. Setting agent isActive = true
 * 4. Enabling tenant assistantEnabled = true
 *
 * Body: { agentId, phoneNumber?, phoneCountry?, carrier? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { getSubscription, isSubscriptionActive } from '@/lib/billing/lemonsqueezy';
import { provisionNumber, assignNumberToAgent } from '@/lib/phone/gateway';

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
        const { agentId, phoneNumber, phoneCountry, carrier } = body;

        if (!agentId) {
            return NextResponse.json(
                { error: 'Missing agentId', message: 'Asistan ID gerekli.' },
                { status: 400 },
            );
        }

        // ── 1. Subscription Guard ──────────────────────────────────────
        const subscription = await getSubscription(getDb(), tenantId);

        // free_trial (no subscription) or inactive subscription → 402
        if (!subscription) {
            return NextResponse.json(
                {
                    error: 'Subscription required',
                    message: 'Asistanı canlıya almak için aktif bir abonelik gereklidir. Lütfen bir plan seçin.',
                    code: 'SUBSCRIPTION_REQUIRED',
                },
                { status: 402 },
            );
        }

        if (!isSubscriptionActive(subscription)) {
            return NextResponse.json(
                {
                    error: 'Subscription inactive',
                    message: 'Aboneliğiniz aktif değil. Lütfen planınızı yenileyiniz.',
                    code: 'SUBSCRIPTION_INACTIVE',
                },
                { status: 402 },
            );
        }

        // ── 2. Agent Ownership & State Check ───────────────────────────
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

        if (agentData.isActive) {
            return NextResponse.json(
                { error: 'Already active', message: 'Bu asistan zaten aktif.' },
                { status: 409 },
            );
        }

        // ── 3. Phone Number Assignment ─────────────────────────────────
        let assignedPhoneNumber: string;

        if (phoneNumber) {
            // Assign existing unassigned number to this agent
            await assignNumberToAgent(getDb(), tenantId, phoneNumber, agentId);
            assignedPhoneNumber = phoneNumber;
        } else if (phoneCountry) {
            // Provision a new number and bind to agent
            const result = await provisionNumber(
                getDb(),
                tenantId,
                phoneCountry,
                { carrier },
                agentId,
            );

            if (!result.success || !result.phoneNumber) {
                return NextResponse.json(
                    {
                        error: 'Number provisioning failed',
                        message: result.maintenanceMessage || result.error || 'Numara tahsisi başarısız.',
                        code: result.error === 'TR_POOL_MAINTENANCE' ? 'TR_POOL_MAINTENANCE' : 'PROVISION_FAILED',
                    },
                    { status: 503 },
                );
            }

            assignedPhoneNumber = result.phoneNumber.phoneNumber;
        } else {
            return NextResponse.json(
                {
                    error: 'Missing phone info',
                    message: 'Telefon numarası veya ülke kodu gerekli.',
                },
                { status: 400 },
            );
        }

        // ── 4. Activate Agent ──────────────────────────────────────────
        await agentRef.update({
            isActive: true,
            activatedAt: FieldValue.serverTimestamp(),
            phoneNumber: assignedPhoneNumber,
        });

        // ── 5. Enable Tenant Assistant ─────────────────────────────────
        await getDb().collection('tenants').doc(tenantId).set(
            {
                settings: { assistantEnabled: true },
            },
            { merge: true },
        );

        return NextResponse.json({
            success: true,
            agentId,
            phoneNumber: assignedPhoneNumber,
            message: 'Asistan başarıyla canlıya alındı.',
        });

    } catch (error) {
        console.error('[agents/activate] Error:', error);
        const message = error instanceof Error ? error.message : 'Aktivasyon başarısız';
        return NextResponse.json(
            { error: 'Activation failed', message },
            { status: 500 },
        );
    }
}
