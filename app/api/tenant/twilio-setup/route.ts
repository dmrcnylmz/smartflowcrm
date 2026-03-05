/**
 * Tenant Twilio Setup API
 *
 * POST /api/tenant/twilio-setup — Provision Twilio subaccount for tenant
 * GET  /api/tenant/twilio-setup — Get current Twilio setup status
 *
 * Creates an isolated Twilio subaccount per tenant for:
 * - Separate billing & usage tracking
 * - Per-tenant phone numbers
 * - Secure credential isolation
 *
 * Authentication: via middleware (x-user-tenant, x-user-uid, x-user-role headers)
 * Authorization: owner/admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import {
    provisionTenantTwilio,
    getSubaccountUsage,
    searchAvailableNumbers,
} from '@/lib/twilio/subaccounts';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// POST: Provision Twilio subaccount for tenant
// =============================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const userRole = request.headers.get('x-user-role');
        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json(
                { error: 'Yalnızca yöneticiler Twilio kurulumu yapabilir' },
                { status: 403 },
            );
        }

        // Check if tenant already has Twilio configured
        const tenantDoc = await getDb().collection('tenants').doc(auth.tenantId).get();
        const tenantData = tenantDoc.data();

        if (tenantData?.twilio?.subaccountSid) {
            return NextResponse.json(
                { error: 'Bu tenant için Twilio zaten yapılandırılmış', existing: true },
                { status: 409 },
            );
        }

        const body = await request.json();
        const {
            companyName,
            phoneCountry = 'US',
            phoneType = 'Local',
            purchaseNumber = false,
        } = body;

        const tenantName = companyName || tenantData?.companyName || `Tenant-${auth.tenantId.slice(0, 8)}`;

        // Determine webhook base URL
        const host = request.headers.get('host') || '';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

        // Provision Twilio subaccount + optional phone number
        const setup = await provisionTenantTwilio(tenantName, {
            phoneCountry,
            phoneType: phoneType as 'Local' | 'Mobile' | 'TollFree',
            webhookBaseUrl,
            purchaseNumber,
        });

        // Store Twilio credentials in tenant doc
        // NOTE: In production, consider encrypting authToken before storing
        const twilioData: Record<string, unknown> = {
            'twilio.subaccountSid': setup.subaccount.sid,
            'twilio.authToken': setup.subaccount.authToken,
            'twilio.friendlyName': setup.subaccount.friendlyName,
            'twilio.status': setup.subaccount.status,
            'twilio.provisionedAt': FieldValue.serverTimestamp(),
            'twilio.webhookBaseUrl': webhookBaseUrl,
            updatedAt: FieldValue.serverTimestamp(),
        };

        if (setup.phoneNumber) {
            twilioData['twilio.phoneNumber'] = setup.phoneNumber.phoneNumber;
            twilioData['twilio.phoneNumberSid'] = setup.phoneNumber.sid;
            twilioData['twilio.phoneCountry'] = setup.phoneNumber.country;

            // Also register in the phone number → tenant mapping collection
            await getDb().collection('tenant_phone_numbers')
                .doc(setup.phoneNumber.phoneNumber.replace(/[\s\-()]/g, ''))
                .set({
                    tenantId: auth.tenantId,
                    phoneNumber: setup.phoneNumber.phoneNumber,
                    subaccountSid: setup.subaccount.sid,
                    registeredAt: FieldValue.serverTimestamp(),
                });
        }

        await getDb().collection('tenants').doc(auth.tenantId).set(twilioData, { merge: true });

        // Log the setup
        await getDb().collection('tenants').doc(auth.tenantId)
            .collection('activity_logs').add({
                type: 'twilio_provisioned',
                subaccountSid: setup.subaccount.sid,
                phoneNumber: setup.phoneNumber?.phoneNumber || null,
                createdBy: auth.uid || 'unknown',
                createdAt: FieldValue.serverTimestamp(),
            });

        return NextResponse.json({
            success: true,
            subaccountSid: setup.subaccount.sid,
            phoneNumber: setup.phoneNumber?.phoneNumber || null,
            webhookConfigured: setup.webhookConfigured,
            webhookUrl: `${webhookBaseUrl}/api/twilio/incoming`,
            statusCallbackUrl: `${webhookBaseUrl}/api/twilio/status`,
        });

    } catch (error) {
        return handleApiError(error, 'TwilioSetup POST');
    }
}

// =============================================
// GET: Get current Twilio setup status & usage
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const tenantDoc = await getDb().collection('tenants').doc(auth.tenantId).get();
        const tenantData = tenantDoc.data();

        if (!tenantData?.twilio?.subaccountSid) {
            return NextResponse.json({
                configured: false,
                message: 'Twilio henüz yapılandırılmamış',
                masterConfigured: !!process.env.TWILIO_ACCOUNT_SID,
            });
        }

        const twilio = tenantData.twilio;

        // Optionally fetch usage (if requested)
        const includeUsage = request.nextUrl.searchParams.get('includeUsage') === 'true';
        let usage = null;

        if (includeUsage && twilio.subaccountSid && twilio.authToken) {
            try {
                usage = await getSubaccountUsage(twilio.subaccountSid, twilio.authToken);
            } catch {
                usage = { error: 'Usage data unavailable' };
            }
        }

        return NextResponse.json({
            configured: true,
            subaccountSid: twilio.subaccountSid,
            phoneNumber: twilio.phoneNumber || null,
            status: twilio.status || 'active',
            webhookBaseUrl: twilio.webhookBaseUrl || null,
            provisionedAt: twilio.provisionedAt || null,
            usage,
        });

    } catch (error) {
        return handleApiError(error, 'TwilioSetup GET');
    }
}

// =============================================
// Search available numbers (query param based)
// GET /api/tenant/twilio-setup?action=search-numbers&country=TR
// =============================================

export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { action } = body;

        if (action === 'search-numbers') {
            const { country = 'US', type = 'Local', contains } = body;

            const numbers = await searchAvailableNumbers(country, {
                type: type as 'Local' | 'Mobile' | 'TollFree',
                contains,
                limit: 10,
            });

            return NextResponse.json({ numbers });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        return handleApiError(error, 'TwilioSetup PATCH');
    }
}
