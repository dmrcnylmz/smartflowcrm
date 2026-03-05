/**
 * Strict Authentication Helper for API Routes
 *
 * Uses Firebase Admin SDK for full cryptographic JWT verification.
 * Should be used in all write (POST/PUT/PATCH/DELETE) API routes.
 *
 * Usage:
 *   const auth = await requireStrictAuth(request);
 *   if (auth.error) return auth.error;
 *   // auth.uid, auth.tenantId, auth.email are available
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenStrict } from '@/lib/auth/token-verify-strict';

interface StrictAuthSuccess {
    uid: string;
    email?: string;
    tenantId: string;
    error?: undefined;
}

interface StrictAuthFailure {
    uid?: undefined;
    email?: undefined;
    tenantId?: undefined;
    error: NextResponse;
}

export type StrictAuthResult = StrictAuthSuccess | StrictAuthFailure;

export async function requireStrictAuth(request: NextRequest): Promise<StrictAuthResult> {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
        return {
            error: NextResponse.json(
                { error: 'Kimlik doğrulama gerekli', code: 'AUTH_ERROR' },
                { status: 401 },
            ),
        };
    }

    const result = await verifyTokenStrict(token);

    if (!result.valid || !result.payload) {
        return {
            error: NextResponse.json(
                { error: result.error || 'Geçersiz kimlik bilgisi', code: 'AUTH_ERROR' },
                { status: 401 },
            ),
        };
    }

    const tenantId = request.headers.get('x-user-tenant')
        || result.payload.tenantId
        || result.payload.uid;

    return {
        uid: result.payload.uid,
        email: result.payload.email,
        tenantId,
    };
}
