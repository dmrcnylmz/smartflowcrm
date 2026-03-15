/**
 * Consent Management API
 *
 * GET  /api/compliance/consent?phone=+905551234567  — check consent status
 * POST /api/compliance/consent                       — record consent
 * DELETE /api/compliance/consent?phone=+905551234567 — revoke consent
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import {
    checkOutboundConsent,
    recordOutboundConsent,
    revokeConsent,
    isConsentValid,
    type ContactConsent,
    type ConsentStatus,
    type ConsentSource,
} from '@/lib/compliance/consent-manager';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

const VALID_STATUSES: ConsentStatus[] = ['granted', 'denied', 'pending', 'expired', 'withdrawn'];
const VALID_SOURCES: ConsentSource[] = ['manual', 'csv_import', 'api', 'iys', 'web_form'];

/**
 * GET: Check consent status for a phone number
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const phone = request.nextUrl.searchParams.get('phone');
        if (!phone) {
            return NextResponse.json(
                { error: 'phone query parameter is required' },
                { status: 400 },
            );
        }

        const consent = await checkOutboundConsent(getDb(), auth.tenantId, phone);

        return NextResponse.json({
            phoneNumber: phone,
            consent,
            isValid: isConsentValid(consent),
        });
    } catch (error) {
        return handleApiError(error, 'Consent GET');
    }
}

/**
 * POST: Record consent for a contact
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { phoneNumber, consentStatus, consentSource, consentText, country, iysReferenceId } = body;

        if (!phoneNumber) {
            return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
        }

        if (!consentStatus || !VALID_STATUSES.includes(consentStatus)) {
            return NextResponse.json(
                { error: `consentStatus must be one of: ${VALID_STATUSES.join(', ')}` },
                { status: 400 },
            );
        }

        if (!consentSource || !VALID_SOURCES.includes(consentSource)) {
            return NextResponse.json(
                { error: `consentSource must be one of: ${VALID_SOURCES.join(', ')}` },
                { status: 400 },
            );
        }

        const consent: ContactConsent = {
            phoneNumber,
            consentStatus,
            consentSource,
            consentDate: new Date().toISOString(),
            consentText: consentText || undefined,
            country: country || 'TR',
            iysReferenceId: iysReferenceId || undefined,
            updatedAt: new Date().toISOString(),
            updatedBy: auth.uid,
        };

        await recordOutboundConsent(getDb(), auth.tenantId, consent);

        return NextResponse.json(
            { message: 'Consent recorded', phoneNumber },
            { status: 201 },
        );
    } catch (error) {
        return handleApiError(error, 'Consent POST');
    }
}

/**
 * DELETE: Revoke consent for a phone number
 */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const phone = request.nextUrl.searchParams.get('phone');
        if (!phone) {
            return NextResponse.json(
                { error: 'phone query parameter is required' },
                { status: 400 },
            );
        }

        await revokeConsent(getDb(), auth.tenantId, phone, auth.uid);

        return NextResponse.json({ message: 'Consent revoked', phoneNumber: phone });
    } catch (error) {
        return handleApiError(error, 'Consent DELETE');
    }
}
