/**
 * Tenant Middleware — API Route-Level Tenant Isolation
 *
 * Extracts tenantId from:
 * 1. JWT custom claims (x-user-tenant header, set by Edge middleware)
 * 2. X-Tenant-Id header (for service-to-service / API key calls)
 * 3. Query parameter ?tenantId= (for development/testing only)
 *
 * Usage:
 *   import { withTenant, getTenantContext } from '@/lib/tenant/middleware';
 *
 *   export const POST = withTenant(async (req, ctx) => {
 *     const { tenantId, tenantRef, userId } = ctx;
 *     const calls = await tenantRef.collection('calls').get();
 *     ...
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import type { TenantConfig } from './types';

// =============================================
// Types
// =============================================

export interface TenantContext {
    /** Unique tenant identifier */
    tenantId: string;

    /** Firebase user UID */
    userId: string;

    /** User email */
    userEmail?: string;

    /** User role within the tenant */
    userRole: 'owner' | 'admin' | 'agent' | 'viewer';

    /** Firestore DocumentReference to the tenant root */
    tenantRef: FirebaseFirestore.DocumentReference;

    /** Convenience: get a scoped subcollection */
    collection: (name: string) => FirebaseFirestore.CollectionReference;

    /** Convenience: get a scoped document */
    doc: (collectionName: string, docId: string) => FirebaseFirestore.DocumentReference;
}

export type TenantHandler = (
    req: NextRequest,
    ctx: TenantContext,
) => Promise<NextResponse>;

// =============================================
// In-memory tenant cache (for admin Firestore)
// =============================================

let adminDb: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore {
    if (!adminDb) {
        initAdmin();
        adminDb = getFirestore();
    }
    return adminDb;
}

// =============================================
// Tenant context resolver
// =============================================

function resolvetenantId(req: NextRequest): string | null {
    // Priority 1: Edge middleware forwarded from JWT claims
    const fromMiddleware = req.headers.get('x-user-tenant');
    if (fromMiddleware) return fromMiddleware;

    // Priority 2: Explicit header (service-to-service, API key)
    const fromHeader = req.headers.get('x-tenant-id');
    if (fromHeader) return fromHeader;

    // Priority 3: Query param (dev/testing only)
    if (process.env.NODE_ENV === 'development') {
        const fromQuery = req.nextUrl.searchParams.get('tenantId');
        if (fromQuery) return fromQuery;
    }

    return null;
}

function resolveUserRole(req: NextRequest): 'owner' | 'admin' | 'agent' | 'viewer' {
    const role = req.headers.get('x-user-role');
    if (role && ['owner', 'admin', 'agent', 'viewer'].includes(role)) {
        return role as TenantContext['userRole'];
    }
    return 'viewer'; // Least privilege default
}

// =============================================
// withTenant HOF
// =============================================

/**
 * Higher-order function that wraps an API route handler with tenant isolation.
 * Injects TenantContext into the handler.
 *
 * For public/unauthenticated routes, use withOptionalTenant instead.
 */
export function withTenant(handler: TenantHandler) {
    return async (req: NextRequest): Promise<NextResponse> => {
        const tenantId = resolvetenantId(req);
        const userId = req.headers.get('x-user-uid');
        const userEmail = req.headers.get('x-user-email') || undefined;

        // Tenant ID required
        if (!tenantId) {
            return NextResponse.json(
                {
                    error: 'Tenant context missing',
                    message: 'Bu endpoint tenant bağlamı gerektirir. Lütfen geçerli bir hesapla giriş yapın.',
                },
                { status: 403 },
            );
        }

        // User ID required
        if (!userId) {
            return NextResponse.json(
                {
                    error: 'User context missing',
                    message: 'Kimlik doğrulaması gerekli.',
                },
                { status: 401 },
            );
        }

        const db = getDb();
        const tenantRef = db.collection('tenants').doc(tenantId);

        const ctx: TenantContext = {
            tenantId,
            userId,
            userEmail,
            userRole: resolveUserRole(req),
            tenantRef,
            collection: (name: string) => tenantRef.collection(name),
            doc: (collectionName: string, docId: string) =>
                tenantRef.collection(collectionName).doc(docId),
        };

        return handler(req, ctx);
    };
}

/**
 * Like withTenant, but allows requests without tenant context.
 * TenantContext will be null if no tenant is identified.
 */
export function withOptionalTenant(
    handler: (req: NextRequest, ctx: TenantContext | null) => Promise<NextResponse>,
) {
    return async (req: NextRequest): Promise<NextResponse> => {
        const tenantId = resolvetenantId(req);
        const userId = req.headers.get('x-user-uid');

        if (!tenantId || !userId) {
            return handler(req, null);
        }

        const db = getDb();
        const tenantRef = db.collection('tenants').doc(tenantId);

        const ctx: TenantContext = {
            tenantId,
            userId,
            userEmail: req.headers.get('x-user-email') || undefined,
            userRole: resolveUserRole(req),
            tenantRef,
            collection: (name: string) => tenantRef.collection(name),
            doc: (collectionName: string, docId: string) =>
                tenantRef.collection(collectionName).doc(docId),
        };

        return handler(req, ctx);
    };
}

// =============================================
// Utility: Get tenant config from Firestore
// =============================================

export async function getTenantConfigAdmin(tenantId: string): Promise<TenantConfig | null> {
    const db = getDb();
    const snap = await db.collection('tenants').doc(tenantId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as TenantConfig;
}

// =============================================
// Role-based guards
// =============================================

export function requireRole(
    ctx: TenantContext,
    ...allowedRoles: TenantContext['userRole'][]
): NextResponse | null {
    if (allowedRoles.includes(ctx.userRole)) return null;
    return NextResponse.json(
        {
            error: 'Forbidden',
            message: 'Bu işlem için yetkiniz bulunmamaktadır.',
            required: allowedRoles,
            current: ctx.userRole,
        },
        { status: 403 },
    );
}
