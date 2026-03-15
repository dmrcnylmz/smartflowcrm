/**
 * Campaign Execution API
 *
 * POST /api/campaigns/[id]/execute — Start executing the campaign
 *
 * Only GREEN contacts are called immediately.
 * YELLOW contacts get scheduled for the next allowed window.
 * RED contacts are skipped with reason.
 * Rate limit: 1 call per second (Twilio default CPS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError } from '@/lib/utils/error-handler';
import type { CampaignContact } from '@/lib/compliance/compliance-score';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

function tenantCampaigns(tenantId: string) {
    return getDb().collection('tenants').doc(tenantId).collection('campaigns');
}

// =============================================
// POST: Execute campaign
// =============================================

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { id } = await params;
        const doc = await tenantCampaigns(auth.tenantId).doc(id).get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: 'Campaign not found' },
                { status: 404 },
            );
        }

        const campaign = doc.data();

        if (campaign?.status === 'running') {
            return NextResponse.json(
                { error: 'Campaign is already running' },
                { status: 400 },
            );
        }

        if (campaign?.status === 'completed') {
            return NextResponse.json(
                { error: 'Campaign is already completed' },
                { status: 400 },
            );
        }

        const contacts: CampaignContact[] = campaign?.contacts || [];

        // Categorize contacts by compliance level
        const greenContacts = contacts.filter(c => c.complianceScore?.level === 'green');
        const yellowContacts = contacts.filter(c => c.complianceScore?.level === 'yellow');
        const redContacts = contacts.filter(c => c.complianceScore?.level === 'red');

        if (greenContacts.length === 0 && yellowContacts.length === 0) {
            return NextResponse.json(
                { error: 'No callable contacts in this campaign. All contacts are blocked.' },
                { status: 400 },
            );
        }

        // Update campaign status to running
        const updatedContacts = contacts.map(contact => {
            const score = contact.complianceScore;
            if (!score) return { ...contact, status: 'blocked', reason: 'No compliance score' };

            switch (score.level) {
                case 'green':
                    return { ...contact, status: 'queued' };
                case 'yellow':
                    return {
                        ...contact,
                        status: 'scheduled',
                        scheduledTime: score.nextAllowedTime,
                    };
                case 'red':
                    return {
                        ...contact,
                        status: 'blocked',
                        reason: score.reasons.join(', '),
                    };
                default:
                    return { ...contact, status: 'blocked', reason: 'Unknown compliance level' };
            }
        });

        await tenantCampaigns(auth.tenantId).doc(id).update({
            status: 'running',
            contacts: updatedContacts,
            executionStartedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // In production, this would trigger an async job queue for actual calls.
        // For now, we return the execution plan.
        return NextResponse.json({
            id,
            status: 'running',
            execution: {
                greenContacts: greenContacts.length,
                yellowContacts: yellowContacts.length,
                redContacts: redContacts.length,
                totalCallable: greenContacts.length,
                totalScheduled: yellowContacts.length,
                totalBlocked: redContacts.length,
                rateLimit: '1 call/second',
            },
            message: `Campaign started. ${greenContacts.length} contacts queued for immediate calling, ${yellowContacts.length} scheduled.`,
        });

    } catch (error) {
        return handleApiError(error, 'Campaign Execute POST');
    }
}
