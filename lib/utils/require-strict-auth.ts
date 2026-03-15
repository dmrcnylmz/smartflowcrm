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
    role?: string;
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

    // Determine tenantId strictly from JWT claims.
    // The x-user-tenant header (set by middleware) is only trusted if it matches
    // the JWT's own tenantId claim — never trust client-supplied headers alone.
    let tenantId: string;
    const jwtTenantId = result.payload.tenantId;
    const headerTenantId = request.headers.get('x-user-tenant');

    if (jwtTenantId) {
        // JWT has an explicit tenantId claim — this is authoritative
        if (headerTenantId && headerTenantId !== jwtTenantId) {
            console.warn(
                `[requireStrictAuth] x-user-tenant header "${headerTenantId}" does not match JWT tenantId "${jwtTenantId}" for uid=${result.payload.uid}. Ignoring header — possible spoofing attempt.`
            );
        }
        tenantId = jwtTenantId;
    } else {
        // No tenantId in JWT claims — fall back to UID (single-user / personal account)
        console.warn(
            `[requireStrictAuth] No tenantId in JWT claims for uid=${result.payload.uid}. Falling back to UID as tenantId. Ensure custom claims are set for multi-tenant users.`
        );
        tenantId = result.payload.uid;
    }

    return {
        uid: result.payload.uid,
        email: result.payload.email,
        tenantId,
        role: result.payload.role,
    };
}
