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
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        const action = request.nextUrl.searchParams.get('action') as AuditAction | null;
        const userId = request.nextUrl.searchParams.get('userId');
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
        const includeRetention = request.nextUrl.searchParams.get('retention') === 'true';

        const logs = await queryAuditLogs(getDb(), tenantId, {
            action: action || undefined,
            userId: userId || undefined,
            limit,
        });

        let retention = undefined;
        if (includeRetention) {
            retention = await getRetentionPolicy(getDb(), tenantId);
        }

        return NextResponse.json({
            logs,
            count: logs.length,
            ...(retention ? { retention } : {}),
        });

    } catch (error) {
        console.error('[Compliance API] Error:', error);
        return NextResponse.json(
            { error: 'Audit query failed', details: String(error) },
            { status: 500 },
        );
    }
}

/**
 * POST: PII redaction or consent recording
 */
export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        const body = await request.json();
        const { operation } = body;

        if (operation === 'redact') {
            const { text } = body;
            if (!text) {
                return NextResponse.json({ error: 'text is required' }, { status: 400 });
            }
            const result = redactPII(text);
            return NextResponse.json(result);
        }

        if (operation === 'consent') {
            const consentId = await recordConsent(getDb(), tenantId, {
                userId: body.userId,
                callerPhone: body.callerPhone,
                callRecording: body.callRecording ?? false,
                dataProcessing: body.dataProcessing ?? false,
                analytics: body.analytics ?? false,
                ipAddress: request.headers.get('x-forwarded-for') || undefined,
            });
            return NextResponse.json({ consentId, message: 'Consent recorded' }, { status: 201 });
        }

        return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });

    } catch (error) {
        console.error('[Compliance API] Error:', error);
        return NextResponse.json(
            { error: 'Compliance operation failed', details: String(error) },
            { status: 500 },
        );
    }
}
