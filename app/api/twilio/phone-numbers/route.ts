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
import { getFirestore } from 'firebase-admin/firestore';
import { registerPhoneNumber } from '@/lib/twilio/telephony';
import { handleApiError } from '@/lib/utils/error-handler';

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
 * Body: { phoneNumber: "+905551234567" }
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
        const { phoneNumber } = body;

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

        // Register the number
        await registerPhoneNumber(getDb(), normalized, tenantId);

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
                createdAt: Date.now(),
            });

        return NextResponse.json({
            success: true,
            phoneNumber: normalized,
            webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'}/api/twilio/incoming`,
            statusCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'}/api/twilio/status`,
            message: 'Number registered. Configure this webhook URL in your Twilio console.',
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
