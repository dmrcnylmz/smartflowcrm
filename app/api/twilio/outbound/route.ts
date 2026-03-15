/**
 * Twilio Outbound Call API
 *
 * POST /api/twilio/outbound
 *
 * Initiates an outbound call via Twilio.
 * Requires authentication (Bearer token).
 *
 * Body: { toNumber, agentId, fromNumber?, context?, language? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { createOutboundCall } from '@/lib/twilio/outbound';
import { getTwilioConfig } from '@/lib/twilio/telephony';
import { checkCallAllowed } from '@/lib/billing/usage-guard';
import { getSubscription, isSubscriptionActive } from '@/lib/billing/lemonsqueezy';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('twilio:outbound');

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

/** Validate E.164 phone number format */
function isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
}

export async function POST(request: NextRequest) {
    try {
        // Require authentication
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const { tenantId } = auth;

        const body = await request.json();
        const { toNumber, agentId, fromNumber, context, language } = body;

        // Validate required fields
        if (!toNumber) {
            return NextResponse.json(
                { error: 'toNumber is required' },
                { status: 400 },
            );
        }

        if (!agentId) {
            return NextResponse.json(
                { error: 'agentId is required' },
                { status: 400 },
            );
        }

        // Validate E.164 format
        if (!isValidE164(toNumber)) {
            return NextResponse.json(
                { error: 'Invalid phone number format. Must be E.164 (e.g. +14155551234)' },
                { status: 400 },
            );
        }

        // Check subscription status
        const subscription = await getSubscription(getDb(), tenantId);
        if (subscription && !isSubscriptionActive(subscription)) {
            return NextResponse.json(
                { error: 'Subscription expired. Please renew your account.' },
                { status: 403 },
            );
        }

        // Check usage limits
        const tierName = subscription?.planId || 'starter';
        const usageCheck = await checkCallAllowed(getDb(), tenantId, tierName);
        if (!usageCheck.allowed) {
            return NextResponse.json(
                { error: usageCheck.reason || 'Monthly usage limit reached.' },
                { status: 429 },
            );
        }

        // Resolve fromNumber: use provided, or find tenant's provisioned number
        let resolvedFromNumber = fromNumber;
        if (!resolvedFromNumber) {
            const phoneSnap = await getDb()
                .collection('tenant_phone_numbers')
                .where('tenantId', '==', tenantId)
                .where('isActive', '==', true)
                .limit(1)
                .get();

            if (!phoneSnap.empty) {
                resolvedFromNumber = phoneSnap.docs[0].data().phoneNumber;
            }
        }

        if (!resolvedFromNumber) {
            // Fall back to default Twilio number
            const config = getTwilioConfig();
            resolvedFromNumber = config.defaultPhoneNumber;
        }

        if (!resolvedFromNumber) {
            return NextResponse.json(
                { error: 'No phone number available. Please provision a number first.' },
                { status: 400 },
            );
        }

        // Build webhook URLs
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;

        const config = getTwilioConfig();
        const webhookUrl = `${baseUrl}/api/twilio/outbound-answer?tenantId=${tenantId}&agentId=${agentId}&lang=${language || 'tr'}${context ? `&context=${encodeURIComponent(context)}` : ''}`;
        const statusCallback = `${baseUrl}/api/twilio/status`;

        // Create outbound call via Twilio
        const result = await createOutboundCall({
            accountSid: config.accountSid,
            authToken: config.authToken,
            to: toNumber,
            from: resolvedFromNumber,
            webhookUrl,
            statusCallback,
            machineDetection: 'Enable',
        });

        log.info('outbound:initiated', {
            callSid: result.sid,
            tenantId,
            agentId,
            to: toNumber,
            from: resolvedFromNumber,
        });

        // Create Firestore call record
        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(result.sid)
            .set({
                callSid: result.sid,
                tenantId,
                from: resolvedFromNumber,
                to: toNumber,
                direction: 'outbound',
                status: 'queued',
                channel: 'twilio',
                providerType: 'TWILIO_NATIVE',
                agentId,
                context: context || null,
                language: language || 'tr',
                startedAt: FieldValue.serverTimestamp(),
                conversationHistory: [],
                initiatedBy: auth.uid,
            });

        // Meter the outbound call start
        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('usage').doc('current')
            .set({
                totalCalls: FieldValue.increment(1),
                outboundCalls: FieldValue.increment(1),
                lastCallAt: FieldValue.serverTimestamp(),
            }, { merge: true }).catch(() => {});

        return NextResponse.json({
            callSid: result.sid,
            status: 'queued',
        });

    } catch (err) {
        log.error('outbound:error', { error: err instanceof Error ? err.message : String(err) });
        return NextResponse.json(
            { error: 'Failed to initiate outbound call' },
            { status: 500 },
        );
    }
}
