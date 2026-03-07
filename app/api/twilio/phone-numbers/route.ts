/**
 * [DEPRECATED] Twilio Phone Number Management API
 *
 * This endpoint is deprecated. Use the new unified phone system instead:
 *   - GET  /api/phone/numbers     — List tenant numbers
 *   - POST /api/phone/provision   — Provision new number (auto-routes TR→SIP, global→Twilio)
 *   - DELETE /api/phone/numbers   — Release number
 *
 * Kept for backward compatibility — returns deprecation notice.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEPRECATION_NOTICE = {
    deprecated: true,
    message: 'Bu endpoint kullanımdan kaldırıldı. Yeni telefon API\'sini kullanın.',
    migration: {
        listNumbers: 'GET /api/phone/numbers',
        provisionNumber: 'POST /api/phone/provision — { country: "TR" | "US" | ... }',
        releaseNumber: 'DELETE /api/phone/numbers — { phoneNumber: "+90..." }',
    },
};

export async function GET(_request: NextRequest) {
    return NextResponse.json(
        { ...DEPRECATION_NOTICE, hint: 'GET /api/phone/numbers kullanın' },
        { status: 301 },
    );
}

export async function POST(_request: NextRequest) {
    return NextResponse.json(
        { ...DEPRECATION_NOTICE, hint: 'POST /api/phone/provision kullanın — { country: "TR" }' },
        { status: 301 },
    );
}

export async function DELETE(_request: NextRequest) {
    return NextResponse.json(
        { ...DEPRECATION_NOTICE, hint: 'DELETE /api/phone/numbers kullanın — { phoneNumber: "+90..." }' },
        { status: 301 },
    );
}
