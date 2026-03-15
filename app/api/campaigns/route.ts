/**
 * Campaign CRUD API
 *
 * POST /api/campaigns — Create a new campaign with compliance checks
 * GET  /api/campaigns — List all campaigns for tenant
 *
 * Campaigns are stored in tenants/{tenantId}/campaigns/
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError } from '@/lib/utils/error-handler';
import { runOutboundComplianceCheck } from '@/lib/compliance/outbound-compliance';
import { classifyCallPurpose, type CallPurpose } from '@/lib/compliance/call-types';
import {
    calculateComplianceScore,
    calculateCampaignSummary,
    type CampaignContact,
} from '@/lib/compliance/compliance-score';

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
// POST: Create campaign with compliance checks
// =============================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { name, agentId, contacts, fromNumber, scheduledTime, consentConfirmed, purpose: rawPurpose } = body;
        const purpose: CallPurpose = rawPurpose || 'custom';
        const callTypeRules = classifyCallPurpose(purpose);

        // Validation
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Campaign name is required' },
                { status: 400 },
            );
        }

        if (!agentId || typeof agentId !== 'string') {
            return NextResponse.json(
                { error: 'Agent ID is required' },
                { status: 400 },
            );
        }

        if (!Array.isArray(contacts) || contacts.length === 0) {
            return NextResponse.json(
                { error: 'At least one contact is required' },
                { status: 400 },
            );
        }

        // Consent confirmation only required for marketing calls
        if (callTypeRules.consentRequired && !consentConfirmed) {
            return NextResponse.json(
                { error: 'Consent confirmation is required' },
                { status: 400 },
            );
        }

        // Run compliance checks on ALL contacts
        const checkedContacts: CampaignContact[] = await Promise.all(
            contacts.map(async (contact: { phoneNumber: string; name?: string; context?: string }) => {
                const complianceResult = await runOutboundComplianceCheck(
                    auth.tenantId,
                    contact.phoneNumber,
                    'en',
                    getDb(),
                    purpose,
                );

                const callingHoursSchedulable = !complianceResult.callingHoursValid;
                const score = calculateComplianceScore(
                    complianceResult.consentValid,
                    complianceResult.callingHoursValid,
                    callingHoursSchedulable,
                );

                // Enrich with country info from compliance check
                score.country = complianceResult.reasons.find(r => r.includes('country'))
                    || (complianceResult as unknown as Record<string, unknown>).country as string
                    || '';

                return {
                    phoneNumber: contact.phoneNumber,
                    name: contact.name || '',
                    context: contact.context || '',
                    status: 'pending',
                    complianceScore: score,
                };
            }),
        );

        const summary = calculateCampaignSummary(checkedContacts);

        const campaignData = {
            name: name.trim(),
            agentId,
            purpose,
            callCategory: callTypeRules.category,
            fromNumber: fromNumber || null,
            scheduledTime: scheduledTime || null,
            consentConfirmed: callTypeRules.consentRequired ? true : false,
            contacts: checkedContacts,
            summary,
            status: 'draft',
            tenantId: auth.tenantId,
            createdBy: auth.uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const ref = tenantCampaigns(auth.tenantId).doc();
        await ref.set(campaignData);

        return NextResponse.json({
            id: ref.id,
            ...campaignData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'Campaigns POST');
    }
}

// =============================================
// GET: List all campaigns for tenant
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const snap = await tenantCampaigns(auth.tenantId)
            .orderBy('createdAt', 'desc')
            .get();

        const campaigns = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({ campaigns, count: campaigns.length });

    } catch (error) {
        return handleApiError(error, 'Campaigns GET');
    }
}
