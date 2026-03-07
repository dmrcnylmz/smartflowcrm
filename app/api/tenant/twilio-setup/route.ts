/**
 * [DEPRECATED] Tenant Twilio Setup API
 *
 * This endpoint is deprecated. The new hybrid phone system handles provisioning:
 *   - POST /api/phone/provision — Unified number provisioning (TR→SIP pool, global→Twilio)
 *   - GET  /api/phone/numbers   — List tenant's phone numbers
 *   - Admin pool management via /api/phone/pool
 *
 * Subaccount-based setup is no longer needed. The system uses master Twilio
 * credentials with Elastic SIP Trunking for Turkey and direct API for global.
 *
 * Kept for backward compatibility — returns deprecation notice.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEPRECATION_NOTICE = {
    deprecated: true,
    message: 'Twilio subaccount kurulumu artık gerekli değil. Yeni hibrit telefon sistemi otomatik olarak çalışır.',
    migration: {
        provisionNumber: 'POST /api/phone/provision — { country: "TR" | "US" | ... }',
        listNumbers: 'GET /api/phone/numbers',
        poolManagement: 'GET/POST/DELETE /api/phone/pool (admin)',
        portingRequests: 'GET/POST/PATCH /api/phone/porting',
    },
    info: 'Türkiye numaraları SIP trunk havuzundan, diğer ülkeler Twilio API ile sağlanır.',
};

export async function POST(_request: NextRequest) {
    return NextResponse.json(
        { ...DEPRECATION_NOTICE, hint: 'POST /api/phone/provision kullanın' },
        { status: 301 },
    );
}

export async function GET(_request: NextRequest) {
    return NextResponse.json(
        { ...DEPRECATION_NOTICE, hint: 'GET /api/phone/numbers kullanın' },
        { status: 301 },
    );
}

export async function PATCH(_request: NextRequest) {
    return NextResponse.json(
        { ...DEPRECATION_NOTICE, hint: 'POST /api/phone/provision kullanın' },
        { status: 301 },
    );
}
