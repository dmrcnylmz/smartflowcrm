/**
 * Twilio Phone Number Management API
 *
 * GET:  List registered phone numbers for tenant
 * POST: Register a phone number to tenant (maps number → tenant in Firestore)
 * DELETE: Unregister a phone number from tenant
 *
 * This handles the Firestore mapping that enables incoming call routing.
 * When Twilio forwards a call, /api/twilio/incoming looks up which tenant
 * owns the called number in tenant_phone_numbers/{normalizedNumber}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { registerPhoneNumber } from '@/lib/twilio/telephony';
import { configurePhoneWebhooks } from '@/lib/twilio/subaccounts';
import { handleApiError } from '@/lib/utils/error-handler';
import { getAppUrl } from '@/lib/utils/get-app-url';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

/**
 * GET - List phone numbers registered to this tenant
 */
export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userRole = request.headers.get('x-user-role');

        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Query all phone numbers for this tenant
        const snap = await getDb().collection('tenant_phone_numbers')
            .where('tenantId', '==', tenantId)
            .get();

        const numbers = snap.docs.map(doc => ({
            phoneNumber: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({ numbers });

    } catch (error) {
        return handleApiError(error, 'PhoneNumbers GET');
    }
}

/**
 * POST - Register a phone number to this tenant
 *
 * Supports 3 modes:
 *
 * Mode 1: Tenant has subaccount + provides phoneNumberSid
 *   → Auto-configure webhooks on Twilio (best UX)
 *   Body: { phoneNumber: "+905551234567", phoneNumberSid: "PNxxxxxxx" }
 *
 * Mode 2: Tenant has subaccount, system looks up phoneNumberSid
 *   → Searches subaccount's numbers, auto-configures if found
 *   Body: { phoneNumber: "+905551234567", autoConfigureWebhook: true }
 *
 * Mode 3: No subaccount (manual Twilio setup)
 *   → Returns webhook URLs for manual configuration
 *   Body: { phoneNumber: "+905551234567" }
 */
export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userRole = request.headers.get('x-user-role');

        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { phoneNumber, phoneNumberSid, autoConfigureWebhook } = body;

        if (!phoneNumber) {
            return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
        }

        // Validate phone number format (E.164)
        const normalized = phoneNumber.replace(/[\s\-()]/g, '');
        if (!/^\+\d{10,15}$/.test(normalized)) {
            return NextResponse.json(
                { error: 'Invalid phone number format. Use E.164: +905551234567' },
                { status: 400 }
            );
        }

        // Check if number is already registered to another tenant
        const existing = await getDb().collection('tenant_phone_numbers').doc(normalized).get();
        if (existing.exists && existing.data()?.tenantId !== tenantId) {
            return NextResponse.json(
                { error: 'This number is already registered to another account' },
                { status: 409 }
            );
        }

        // Determine webhook base URL
        const host = request.headers.get('host') || '';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const webhookBaseUrl = getAppUrl();

        // Load tenant's Twilio config (subaccount credentials)
        const tenantDoc = await getDb().collection('tenants').doc(tenantId).get();
        const tenantData = tenantDoc.data();
        const twilioConfig = tenantData?.twilio;

        let webhookConfigured = false;
        let resolvedPhoneNumberSid = phoneNumberSid || null;

        // ─── Mode 1 & 2: Auto-configure webhooks if subaccount exists ───
        if (twilioConfig?.subaccountSid && twilioConfig?.authToken) {
            const subSid = twilioConfig.subaccountSid;
            const subToken = twilioConfig.authToken;

            // If we have phoneNumberSid, configure directly
            if (resolvedPhoneNumberSid) {
                try {
                    await configurePhoneWebhooks(subSid, subToken, resolvedPhoneNumberSid, webhookBaseUrl);
                    webhookConfigured = true;
                } catch (err) {
                    console.error('[PhoneNumbers] Webhook config failed:', err instanceof Error ? err.message : err);
                    // Continue — register the number anyway, user can configure manually
                }
            }

            // If autoConfigureWebhook but no SID, look up the number in subaccount
            if (!resolvedPhoneNumberSid && autoConfigureWebhook) {
                try {
                    const lookupUrl = `https://api.twilio.com/2010-04-01/Accounts/${subSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalized)}`;
                    const lookupRes = await fetch(lookupUrl, {
                        headers: {
                            'Authorization': 'Basic ' + Buffer.from(`${subSid}:${subToken}`).toString('base64'),
                        },
                        signal: AbortSignal.timeout(10000),
                    });

                    if (lookupRes.ok) {
                        const lookupData = await lookupRes.json();
                        const found = lookupData.incoming_phone_numbers?.[0];
                        if (found?.sid) {
                            resolvedPhoneNumberSid = found.sid;
                            await configurePhoneWebhooks(subSid, subToken, found.sid, webhookBaseUrl);
                            webhookConfigured = true;
                        }
                    }
                } catch (err) {
                    console.error('[PhoneNumbers] Auto-lookup failed:', err instanceof Error ? err.message : err);
                }
            }
        }

        // ─── Register the number in Firestore (all modes) ───
        await registerPhoneNumber(getDb(), normalized, tenantId);

        // Store extra info in the phone number mapping
        await getDb().collection('tenant_phone_numbers').doc(normalized).set({
            tenantId,
            phoneNumber: normalized,
            phoneNumberSid: resolvedPhoneNumberSid || null,
            subaccountSid: twilioConfig?.subaccountSid || null,
            webhookConfigured,
            registeredAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Also save reference in tenant config
        await getDb().collection('tenants').doc(tenantId).update({
            'business.phone': normalized,
            updatedAt: new Date().toISOString(),
        });

        // Log activity
        await getDb().collection('tenants').doc(tenantId)
            .collection('activity_logs').add({
                type: 'phone_registered',
                phoneNumber: normalized,
                webhookConfigured,
                autoConfigured: webhookConfigured && !phoneNumberSid,
                createdAt: Date.now(),
            });

        return NextResponse.json({
            success: true,
            phoneNumber: normalized,
            phoneNumberSid: resolvedPhoneNumberSid,
            webhookConfigured,
            webhookUrl: `${webhookBaseUrl}/api/twilio/incoming`,
            statusCallbackUrl: `${webhookBaseUrl}/api/twilio/status`,
            message: webhookConfigured
                ? 'Numara kaydedildi ve webhook\'lar otomatik yapılandırıldı. Çağrı almaya hazır!'
                : 'Numara kaydedildi. Twilio konsolunuzdan webhook URL\'lerini manuel olarak yapılandırın.',
            ...((!webhookConfigured) && {
                manualSetupRequired: true,
                instructions: [
                    'Twilio Console → Phone Numbers → Active Numbers → numara seç',
                    `Voice Configuration → "A call comes in" → Webhook: ${webhookBaseUrl}/api/twilio/incoming`,
                    `Status Callback URL: ${webhookBaseUrl}/api/twilio/status`,
                ],
            }),
        });

    } catch (error) {
        return handleApiError(error, 'PhoneNumbers POST');
    }
}

/**
 * DELETE - Unregister a phone number from this tenant
 *
 * Query: ?phoneNumber=+905551234567
 */
export async function DELETE(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userRole = request.headers.get('x-user-role');

        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        if (userRole !== 'owner') {
            return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
        }

        const phoneNumber = request.nextUrl.searchParams.get('phoneNumber');
        if (!phoneNumber) {
            return NextResponse.json({ error: 'phoneNumber query param required' }, { status: 400 });
        }

        const normalized = phoneNumber.replace(/[\s\-()]/g, '');

        // Verify the number belongs to this tenant
        const doc = await getDb().collection('tenant_phone_numbers').doc(normalized).get();
        if (!doc.exists || doc.data()?.tenantId !== tenantId) {
            return NextResponse.json({ error: 'Number not found for this tenant' }, { status: 404 });
        }

        // Delete the mapping
        await getDb().collection('tenant_phone_numbers').doc(normalized).delete();

        // Log activity
        await getDb().collection('tenants').doc(tenantId)
            .collection('activity_logs').add({
                type: 'phone_unregistered',
                phoneNumber: normalized,
                createdAt: Date.now(),
            });

        return NextResponse.json({ success: true, message: 'Number unregistered' });

    } catch (error) {
        return handleApiError(error, 'PhoneNumbers DELETE');
    }
}
