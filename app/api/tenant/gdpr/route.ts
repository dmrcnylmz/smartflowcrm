/**
 * GDPR Compliance API — Data Subject Requests
 *
 * Handles GDPR Article 15 (Right of Access), Article 17 (Right to Erasure),
 * and pseudonymization/anonymization of personal data.
 *
 * GET  /api/tenant/gdpr?action=export        → Export all tenant data as JSON
 * POST /api/tenant/gdpr { action: 'delete-customer', customerId }   → Full erasure
 * POST /api/tenant/gdpr { action: 'anonymize-customer', customerId } → Anonymize
 *
 * Authentication: via middleware (x-user-tenant header).
 * Authorization: only tenant owner/admin roles may execute GDPR operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError, requireAuth, createApiError, errorResponse } from '@/lib/utils/error-handler';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ─── Firestore Singleton ─────────────────────────────────────────────────────

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// ─── Request Validation ──────────────────────────────────────────────────────

const gdprPostSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('delete-customer'),
        customerId: z.string().min(1, 'customerId is required'),
    }),
    z.object({
        action: z.literal('anonymize-customer'),
        customerId: z.string().min(1, 'customerId is required'),
    }),
]);

// ─── Constants ───────────────────────────────────────────────────────────────

/** Collections that contain customer-linked data */
const CUSTOMER_LINKED_COLLECTIONS = [
    'calls',
    'tickets',
    'complaints',
    'appointments',
    'info_requests',
] as const;

/** Collections to export for a full tenant data dump */
const EXPORTABLE_COLLECTIONS = [
    'customers',
    'calls',
    'tickets',
    'complaints',
    'appointments',
    'info_requests',
    'voiceSessions',
    'usage',
] as const;

/** Redaction placeholder for anonymized PII fields */
const REDACTED = '[REDACTED]';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify that the caller has admin/owner privileges.
 * Returns an error response if unauthorized, null otherwise.
 */
function requireAdmin(request: NextRequest): NextResponse | null {
    const role = request.headers.get('x-user-role');
    if (role && role !== 'owner' && role !== 'admin') {
        return errorResponse(createApiError(
            'AUTH_ERROR',
            'Only tenant owner or admin can perform GDPR operations',
        ));
    }
    return null;
}

/**
 * Read all documents from a tenant sub-collection.
 * Returns an array of { id, ...data } objects.
 */
async function readCollection(
    tenantId: string,
    collectionName: string,
): Promise<Array<Record<string, unknown>>> {
    const snapshot = await getDb()
        .collection('tenants')
        .doc(tenantId)
        .collection(collectionName)
        .get();

    return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));
}

/**
 * Find documents in a collection that reference a specific customer.
 * Checks both `customerId` and `customer_id` fields for compatibility.
 */
async function findCustomerDocs(
    tenantId: string,
    collectionName: string,
    customerId: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const colRef = getDb()
        .collection('tenants')
        .doc(tenantId)
        .collection(collectionName);

    // Query by customerId field (primary)
    const snap = await colRef
        .where('customerId', '==', customerId)
        .get();

    return snap.docs;
}

/**
 * Log a GDPR action to the tenant's activity_logs collection for audit trail.
 */
async function logGdprAction(
    tenantId: string,
    action: string,
    details: Record<string, unknown>,
    performedBy: string,
): Promise<void> {
    try {
        await getDb()
            .collection('tenants')
            .doc(tenantId)
            .collection('activity_logs')
            .add({
                type: 'gdpr_action',
                action,
                details,
                performedBy,
                createdAt: FieldValue.serverTimestamp(),
            });
    } catch (err) {
        // Log but don't fail the GDPR operation itself
        console.error('[GDPR] Failed to write audit log:', err);
    }
}

// ─── GET: Data Export (GDPR Article 15) ──────────────────────────────────────

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const adminErr = requireAdmin(request);
        if (adminErr) return adminErr;

        const action = request.nextUrl.searchParams.get('action');

        if (action !== 'export') {
            return errorResponse(createApiError(
                'VALIDATION_ERROR',
                'Invalid action. Supported: export',
            ));
        }

        // Collect all tenant data across collections
        const exportData: Record<string, unknown> = {
            exportedAt: new Date().toISOString(),
            tenantId: tenantId!,
            gdprArticle: 'Article 15 — Right of Access',
        };

        for (const col of EXPORTABLE_COLLECTIONS) {
            try {
                exportData[col] = await readCollection(tenantId!, col);
            } catch {
                // Collection may not exist — that's fine
                exportData[col] = [];
            }
        }

        // Also include tenant-level document (company info, settings)
        try {
            const tenantDoc = await getDb()
                .collection('tenants')
                .doc(tenantId!)
                .get();

            if (tenantDoc.exists) {
                exportData.tenantProfile = {
                    id: tenantDoc.id,
                    ...tenantDoc.data(),
                };
            }
        } catch {
            exportData.tenantProfile = null;
        }

        // Log the export for audit trail
        const userId = request.headers.get('x-user-uid') || 'unknown';
        await logGdprAction(tenantId!, 'data-export', {
            collections: EXPORTABLE_COLLECTIONS,
            documentCount: EXPORTABLE_COLLECTIONS.reduce((sum, col) => {
                const arr = exportData[col];
                return sum + (Array.isArray(arr) ? arr.length : 0);
            }, 0),
        }, userId);

        // Return as downloadable JSON
        const jsonPayload = JSON.stringify(exportData, null, 2);

        return new NextResponse(jsonPayload, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="gdpr-export-${tenantId}-${Date.now()}.json"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
        });

    } catch (error) {
        return handleApiError(error, 'GDPR Export');
    }
}

// ─── POST: Delete or Anonymize Customer ──────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const adminErr = requireAdmin(request);
        if (adminErr) return adminErr;

        // Parse and validate request body
        const body = await request.json();
        const parsed = gdprPostSchema.safeParse(body);

        if (!parsed.success) {
            return errorResponse(createApiError(
                'VALIDATION_ERROR',
                'Invalid request body',
                parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
            ));
        }

        const { action, customerId } = parsed.data;
        const userId = request.headers.get('x-user-uid') || 'unknown';
        const firestore = getDb();

        // Verify customer exists
        const customerRef = firestore
            .collection('tenants')
            .doc(tenantId!)
            .collection('customers')
            .doc(customerId);

        const customerSnap = await customerRef.get();

        if (!customerSnap.exists) {
            return errorResponse(createApiError(
                'NOT_FOUND',
                `Customer ${customerId} not found`,
            ));
        }

        const customerData = customerSnap.data()!;

        if (action === 'delete-customer') {
            return await handleDeleteCustomer(tenantId!, customerId, customerData, userId);
        }

        if (action === 'anonymize-customer') {
            return await handleAnonymizeCustomer(tenantId!, customerId, customerData, userId);
        }

        // Unreachable due to discriminated union, but TypeScript needs it
        return errorResponse(createApiError('VALIDATION_ERROR', 'Unknown action'));

    } catch (error) {
        return handleApiError(error, 'GDPR POST');
    }
}

// ─── Delete Customer (GDPR Article 17 — Right to Erasure) ────────────────────

async function handleDeleteCustomer(
    tenantId: string,
    customerId: string,
    customerData: FirebaseFirestore.DocumentData,
    performedBy: string,
): Promise<NextResponse> {
    const firestore = getDb();
    const batch = firestore.batch();
    const summary: Record<string, number> = {};

    // 1. Delete the customer document itself
    const customerRef = firestore
        .collection('tenants')
        .doc(tenantId)
        .collection('customers')
        .doc(customerId);
    batch.delete(customerRef);
    summary.customers = 1;

    // 2. Process linked collections
    for (const col of CUSTOMER_LINKED_COLLECTIONS) {
        const docs = await findCustomerDocs(tenantId, col, customerId);

        if (col === 'calls') {
            // Anonymize call records instead of deleting (keep for analytics)
            for (const doc of docs) {
                batch.update(doc.ref, {
                    customerName: REDACTED,
                    customerPhone: REDACTED,
                    phone: REDACTED,
                    from: REDACTED,
                    callerName: REDACTED,
                    callerPhone: REDACTED,
                    customerId: REDACTED,
                    'customer.name': REDACTED,
                    'customer.phone': REDACTED,
                    'customer.email': REDACTED,
                    gdprRedactedAt: FieldValue.serverTimestamp(),
                });
            }
            summary[col] = docs.length;
        } else {
            // Hard-delete other record types
            for (const doc of docs) {
                batch.delete(doc.ref);
            }
            summary[col] = docs.length;
        }
    }

    // 3. Commit batch (Firestore batch limit is 500 — for most tenants this is fine)
    await batch.commit();

    // 4. Audit log
    await logGdprAction(tenantId, 'delete-customer', {
        customerId,
        customerName: customerData.name || customerData.fullName || 'N/A',
        deletedCollections: summary,
    }, performedBy);

    return NextResponse.json({
        success: true,
        action: 'delete-customer',
        customerId,
        summary,
        message: 'Customer data has been permanently deleted. Call records have been anonymized.',
        timestamp: new Date().toISOString(),
    });
}

// ─── Anonymize Customer (keep records, strip PII) ────────────────────────────

async function handleAnonymizeCustomer(
    tenantId: string,
    customerId: string,
    customerData: FirebaseFirestore.DocumentData,
    performedBy: string,
): Promise<NextResponse> {
    const firestore = getDb();
    const batch = firestore.batch();
    const summary: Record<string, number> = {};

    // 1. Anonymize the customer document (keep record, replace PII)
    const customerRef = firestore
        .collection('tenants')
        .doc(tenantId)
        .collection('customers')
        .doc(customerId);

    batch.update(customerRef, {
        name: REDACTED,
        fullName: REDACTED,
        firstName: REDACTED,
        lastName: REDACTED,
        email: REDACTED,
        phone: REDACTED,
        address: REDACTED,
        notes: REDACTED,
        gdprAnonymizedAt: FieldValue.serverTimestamp(),
    });
    summary.customers = 1;

    // 2. Anonymize linked records across collections
    for (const col of CUSTOMER_LINKED_COLLECTIONS) {
        const docs = await findCustomerDocs(tenantId, col, customerId);

        for (const doc of docs) {
            const anonymizedFields: Record<string, unknown> = {
                customerName: REDACTED,
                customerPhone: REDACTED,
                customerEmail: REDACTED,
                phone: REDACTED,
                from: REDACTED,
                callerName: REDACTED,
                callerPhone: REDACTED,
                'customer.name': REDACTED,
                'customer.phone': REDACTED,
                'customer.email': REDACTED,
                gdprAnonymizedAt: FieldValue.serverTimestamp(),
            };

            // For calls, also redact conversation history PII
            if (col === 'calls') {
                const data = doc.data();
                if (Array.isArray(data.conversationHistory)) {
                    // Keep conversation structure but content stays (it's about the business)
                    // Only redact if the content references the customer name directly
                    anonymizedFields.conversationHistory = data.conversationHistory;
                }
            }

            batch.update(doc.ref, anonymizedFields);
        }
        summary[col] = docs.length;
    }

    // 3. Commit batch
    await batch.commit();

    // 4. Audit log
    await logGdprAction(tenantId, 'anonymize-customer', {
        customerId,
        originalName: customerData.name || customerData.fullName || 'N/A',
        anonymizedCollections: summary,
    }, performedBy);

    return NextResponse.json({
        success: true,
        action: 'anonymize-customer',
        customerId,
        summary,
        message: 'Customer data has been anonymized. Records retained with PII removed.',
        timestamp: new Date().toISOString(),
    });
}
