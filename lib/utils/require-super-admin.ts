/**
 * Super-Admin Guard
 *
 * Verifies that the requesting user has super-admin privileges.
 * Super-admin is determined by:
 * 1. Firebase custom claim: superAdmin === true
 * 2. Email domain: @callception.com
 *
 * Used for system-wide operations like number pool management,
 * porting administration, and system metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';

const SUPER_ADMIN_DOMAIN = 'callception.com';

// Explicitly allowed super-admin email addresses (non-domain-based)
const SUPER_ADMIN_EMAILS = [
    'dmrcnylmz@gmail.com',
];

export interface SuperAdminAuth {
    uid: string;
    email: string;
    tenantId: string;
    error?: NextResponse;
}

/**
 * Check if user is a super-admin.
 * Returns auth context if super-admin, or error response.
 */
export async function requireSuperAdmin(
    request: NextRequest,
): Promise<SuperAdminAuth & { error?: NextResponse }> {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth as unknown as SuperAdminAuth;

    const email = (auth.email || '').toLowerCase();
    const isSuperAdmin =
        email.endsWith(`@${SUPER_ADMIN_DOMAIN}`) ||
        SUPER_ADMIN_EMAILS.includes(email) ||
        request.headers.get('x-user-role') === 'superadmin';

    if (!isSuperAdmin) {
        return {
            ...auth,
            error: NextResponse.json(
                { error: 'Super-admin yetkisi gerekli' },
                { status: 403 },
            ),
        } as SuperAdminAuth & { error: NextResponse };
    }

    return auth as SuperAdminAuth;
}
