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
import { createOutboundCall } from '@/lib/twilio/outbound';
import { getTwilioConfig } from '@/lib/twilio/telephony';
import { runOutboundComplianceCheck } from '@/lib/compliance/outbound-compliance';
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

/** Simple delay for rate limiting (1 call/sec CPS) */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        const campaignRef = tenantCampaigns(auth.tenantId).doc(id);
        const doc = await campaignRef.get();

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
        const agentId = campaign?.agentId || 'default';
        const fromNumber = campaign?.fromNumber;
        const campaignContext = campaign?.context || '';
        const language = campaign?.language || 'tr';

        // Run compliance checks on each contact
        const categorized: Array<CampaignContact & { status: string; reason?: string; scheduledTime?: string }> = [];

        for (const contact of contacts) {
            const compliance = await runOutboundComplianceCheck(
                auth.tenantId,
                contact.phoneNumber,
                language,
                getDb(),
            );

            if (compliance.overallAllowed) {
                categorized.push({ ...contact, status: 'queued' });
            } else if (contact.complianceScore?.level === 'yellow' || contact.complianceScore?.callingHoursSchedulable) {
                categorized.push({
                    ...contact,
                    status: 'scheduled',
                    scheduledTime: contact.complianceScore?.nextAllowedTime,
                });
            } else {
                categorized.push({
                    ...contact,
                    status: 'blocked',
                    reason: compliance.reasons.join(', '),
                });
            }
        }

        const greenContacts = categorized.filter(c => c.status === 'queued');
        const yellowContacts = categorized.filter(c => c.status === 'scheduled');
        const redContacts = categorized.filter(c => c.status === 'blocked');

        if (greenContacts.length === 0 && yellowContacts.length === 0) {
            return NextResponse.json(
                { error: 'No callable contacts in this campaign. All contacts are blocked.' },
                { status: 400 },
            );
        }

        // Update campaign status to running
        await campaignRef.update({
            status: 'running',
            contacts: categorized,
            executionStartedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Track progress
        const progress = {
            queued: greenContacts.length,
            completed: 0,
            failed: 0,
            blocked: redContacts.length,
            scheduled: yellowContacts.length,
        };

        // Resolve from number
        let resolvedFromNumber = fromNumber;
        if (!resolvedFromNumber) {
            const config = getTwilioConfig();
            resolvedFromNumber = config.defaultPhoneNumber;
        }

        // Build webhook URLs
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        const config = getTwilioConfig();

        // Execute calls for GREEN contacts sequentially with 1-sec delay
        for (let i = 0; i < greenContacts.length; i++) {
            const contact = greenContacts[i];

            try {
                const webhookUrl = `${baseUrl}/api/twilio/outbound-answer?tenantId=${auth.tenantId}&agentId=${agentId}&lang=${language}${campaignContext ? `&context=${encodeURIComponent(campaignContext)}` : ''}`;
                const statusCallback = `${baseUrl}/api/twilio/status`;

                const result = await createOutboundCall({
                    accountSid: config.accountSid,
                    authToken: config.authToken,
                    to: contact.phoneNumber,
                    from: resolvedFromNumber || config.defaultPhoneNumber || '',
                    webhookUrl,
                    statusCallback,
                    machineDetection: 'Enable',
                });

                // Update contact status to completed
                contact.status = 'completed';
                progress.completed++;
                progress.queued--;

                // Create call record in Firestore
                await getDb()
                    .collection('tenants').doc(auth.tenantId)
                    .collection('calls').doc(result.sid)
                    .set({
                        callSid: result.sid,
                        tenantId: auth.tenantId,
                        from: resolvedFromNumber,
                        to: contact.phoneNumber,
                        direction: 'outbound',
                        status: 'queued',
                        channel: 'twilio',
                        providerType: 'TWILIO_NATIVE',
                        agentId,
                        context: campaignContext || null,
                        language,
                        startedAt: FieldValue.serverTimestamp(),
                        campaignId: id,
                        conversationHistory: [],
                    });
            } catch (err) {
                // Mark contact as failed and continue with next
                contact.status = 'failed';
                contact.reason = err instanceof Error ? err.message : 'Call creation failed';
                progress.failed++;
                progress.queued--;
            }

            // Rate limit: 1 call per second (Twilio CPS)
            if (i < greenContacts.length - 1) {
                await delay(1000);
            }
        }

        // Update campaign with final status
        await campaignRef.update({
            status: 'completed',
            contacts: categorized,
            progress,
            executionCompletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            id,
            status: 'completed',
            progress,
            execution: {
                greenContacts: greenContacts.length,
                yellowContacts: yellowContacts.length,
                redContacts: redContacts.length,
                totalCallable: greenContacts.length,
                totalScheduled: yellowContacts.length,
                totalBlocked: redContacts.length,
                rateLimit: '1 call/second',
            },
            message: `Campaign completed. ${progress.completed} calls made, ${progress.failed} failed, ${yellowContacts.length} scheduled.`,
        });

    } catch (error) {
        return handleApiError(error, 'Campaign Execute POST');
    }
}
