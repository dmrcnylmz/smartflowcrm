/**
 * Compliance API — Audit Logs & PII Operations
 *
 * GET: Query audit logs
 * POST: Redact PII from text / Record consent
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { queryAuditLogs, redactPII, recordConsent, getRetentionPolicy, type AuditAction } from '@/lib/compliance/audit';
import { handleApiError, requireAuth, requireFields, createApiError, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

/**
 * GET: Query audit logs for the tenant
 */
export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const action = request.nextUrl.searchParams.get('action') as AuditAction | null;
        const userId = request.nextUrl.searchParams.get('userId');
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
        const includeRetention = request.nextUrl.searchParams.get('retention') === 'true';

        const logs = await queryAuditLogs(getDb(), tenantId!, {
            action: action || undefined,
            userId: userId || undefined,
            limit,
        });

        let retention = undefined;
        if (includeRetention) {
            retention = await getRetentionPolicy(getDb(), tenantId!);
        }

        return NextResponse.json({
            logs,
            count: logs.length,
            ...(retention ? { retention } : {}),
        });

    } catch (error) {
        return handleApiError(error, 'Compliance GET');
    }
}

/**
 * POST: PII redaction or consent recording
 */
export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const { operation } = body;

        if (operation === 'redact') {
            const validation = requireFields(body, ['text']);
            if (validation) return errorResponse(validation);

            const result = redactPII(body.text);
            return NextResponse.json(result);
        }

        if (operation === 'consent') {
            const consentId = await recordConsent(getDb(), tenantId!, {
                userId: body.userId,
                callerPhone: body.callerPhone,
                callRecording: body.callRecording ?? false,
                dataProcessing: body.dataProcessing ?? false,
                analytics: body.analytics ?? false,
                ipAddress: request.headers.get('x-forwarded-for') || undefined,
            });
            return NextResponse.json({ consentId, message: 'Consent recorded' }, { status: 201 });
        }

        return errorResponse(createApiError('VALIDATION_ERROR', 'Bilinmeyen operation. Geçerli: redact, consent'));

    } catch (error) {
        return handleApiError(error, 'Compliance POST');
    }
}
