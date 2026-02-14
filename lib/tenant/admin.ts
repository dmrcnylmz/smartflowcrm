/**
 * Tenant Admin Helpers — Server-Side Tenant Management
 *
 * Used by admin API routes and onboarding wizard to:
 * - Create new tenants
 * - Assign users to tenants (via Firebase custom claims)
 * - Manage tenant lifecycle
 */

import { initAdmin } from '@/lib/auth/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { TenantConfig } from './types';
import { DEFAULT_TENANT } from './types';

// =============================================
// Initialize
// =============================================

let db: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore {
    if (!db) {
        initAdmin();
        db = getFirestore();
    }
    return db;
}

// =============================================
// Tenant CRUD
// =============================================

/**
 * Create a new tenant document in Firestore.
 * Returns the generated tenant ID.
 */
export async function createTenant(
    data: Omit<TenantConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
    const firestore = getDb();

    // Generate a URL-safe tenant ID from company name
    const tenantId = generateTenantId(data.companyName);

    // Check for collision
    const existing = await firestore.collection('tenants').doc(tenantId).get();
    if (existing.exists) {
        throw new Error(`Tenant ID "${tenantId}" already exists`);
    }

    // Create tenant root document
    await firestore.collection('tenants').doc(tenantId).set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    // Initialize default subcollections with a placeholder doc
    // (Firestore doesn't create empty subcollections)
    const batch = firestore.batch();
    const tenantRef = firestore.collection('tenants').doc(tenantId);

    batch.set(tenantRef.collection('_meta').doc('init'), {
        initialized: true,
        collections: ['calls', 'appointments', 'complaints', 'customers', 'info_requests', 'activity_logs', 'documents', 'usage'],
        createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(`[TenantAdmin] Created tenant: ${tenantId} (${data.companyName})`);
    return tenantId;
}

/**
 * Update a tenant's configuration.
 */
export async function updateTenant(
    tenantId: string,
    data: Partial<TenantConfig>,
): Promise<void> {
    const firestore = getDb();
    await firestore.collection('tenants').doc(tenantId).update({
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Get a tenant's configuration.
 */
export async function getTenant(tenantId: string): Promise<TenantConfig | null> {
    const firestore = getDb();
    const snap = await firestore.collection('tenants').doc(tenantId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as TenantConfig;
}

/**
 * List all tenants (admin only).
 */
export async function listTenants(limitCount: number = 100): Promise<TenantConfig[]> {
    const firestore = getDb();
    const snap = await firestore
        .collection('tenants')
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TenantConfig));
}

/**
 * Deactivate (soft-delete) a tenant.
 */
export async function deactivateTenant(tenantId: string): Promise<void> {
    await updateTenant(tenantId, { active: false } as Partial<TenantConfig>);
    console.log(`[TenantAdmin] Deactivated tenant: ${tenantId}`);
}

// =============================================
// User ↔ Tenant Assignment (via Custom Claims)
// =============================================

/**
 * Assign a user to a tenant by setting custom claims on their Firebase Auth token.
 *
 * After this, the user's JWT will include:
 *   { tenantId: "acme-corp", role: "admin" }
 *
 * The Edge middleware reads these claims and forwards them as headers.
 */
export async function assignUserToTenant(
    uid: string,
    tenantId: string,
    role: 'owner' | 'admin' | 'agent' | 'viewer' = 'viewer',
): Promise<void> {
    const auth = getAuth();

    // Verify tenant exists
    const tenant = await getTenant(tenantId);
    if (!tenant) {
        throw new Error(`Tenant "${tenantId}" not found`);
    }

    // Set custom claims
    await auth.setCustomUserClaims(uid, {
        tenantId,
        role,
    });

    // Also record in Firestore for querying (claims aren't queryable)
    const firestore = getDb();
    await firestore
        .collection('tenants')
        .doc(tenantId)
        .collection('members')
        .doc(uid)
        .set({
            uid,
            role,
            assignedAt: FieldValue.serverTimestamp(),
        });

    console.log(`[TenantAdmin] Assigned user ${uid} to tenant ${tenantId} as ${role}`);
}

/**
 * Remove a user from a tenant.
 */
export async function removeUserFromTenant(
    uid: string,
    tenantId: string,
): Promise<void> {
    const auth = getAuth();

    // Clear tenant claims
    await auth.setCustomUserClaims(uid, {
        tenantId: null,
        role: null,
    });

    // Remove from Firestore members
    const firestore = getDb();
    await firestore
        .collection('tenants')
        .doc(tenantId)
        .collection('members')
        .doc(uid)
        .delete();

    console.log(`[TenantAdmin] Removed user ${uid} from tenant ${tenantId}`);
}

/**
 * Get all members of a tenant.
 */
export async function getTenantMembers(
    tenantId: string,
): Promise<Array<{ uid: string; role: string; assignedAt: unknown }>> {
    const firestore = getDb();
    const snap = await firestore
        .collection('tenants')
        .doc(tenantId)
        .collection('members')
        .get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() } as { uid: string; role: string; assignedAt: unknown }));
}

/**
 * Get the tenant assignment for a user.
 */
export async function getUserTenant(uid: string): Promise<{ tenantId: string; role: string } | null> {
    const auth = getAuth();
    const user = await auth.getUser(uid);
    const claims = user.customClaims;
    if (!claims?.tenantId) return null;
    return { tenantId: claims.tenantId, role: claims.role || 'viewer' };
}

// =============================================
// Helper: Generate tenant ID
// =============================================

function generateTenantId(companyName: string): string {
    return companyName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-')          // Spaces → hyphens
        .replace(/-+/g, '-')           // Collapse hyphens
        .replace(/^-|-$/g, '')         // Trim hyphens
        .slice(0, 30)                  // Max 30 chars
        || 'tenant-' + Date.now();     // Fallback
}

/**
 * Create the default/demo tenant if it doesn't exist.
 * Called during app initialization.
 */
export async function ensureDefaultTenant(): Promise<void> {
    const existing = await getTenant('default');
    if (existing) return;

    const firestore = getDb();
    const { id, createdAt, updatedAt, ...tenantData } = DEFAULT_TENANT;

    await firestore.collection('tenants').doc('default').set({
        ...tenantData,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    console.log('[TenantAdmin] Created default tenant');
}
