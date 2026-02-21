/**
 * Knowledge Base API — Document management and RAG query endpoint
 *
 * POST: Ingest a new document (text, URL, or PDF)
 * GET:  List KB documents or query the knowledge base
 * DELETE: Remove a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestDocument, listKBDocuments, deleteKBDocument, queryKnowledgeBase, getKBStats } from '@/lib/knowledge/pipeline';
import type { DocumentSource } from '@/lib/knowledge/document-processor';
import { handleApiError, requireAuth, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

/** Resolve tenant: prefer x-user-tenant, fallback to x-user-uid */
function getTenantId(request: NextRequest): string | null {
    return request.headers.get('x-user-tenant')
        || request.headers.get('x-user-uid')
        || null;
}

// =============================================
// POST: Ingest a new document
// =============================================

export async function POST(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const validation = requireFields(body, ['type', 'content']);
        if (validation) return errorResponse(validation);

        const source: DocumentSource = {
            type: body.type,
            content: body.content,
            filename: body.filename,
        };

        const result = await ingestDocument(tenantId!, source);

        return NextResponse.json(result, {
            status: result.status === 'error' ? 500 : 201,
        });

    } catch (error) {
        return handleApiError(error, 'Knowledge POST');
    }
}

// =============================================
// GET: List documents or query KB
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const query = request.nextUrl.searchParams.get('query');
        const action = request.nextUrl.searchParams.get('action');

        if (query) {
            const topK = parseInt(request.nextUrl.searchParams.get('topK') || '5');
            const results = await queryKnowledgeBase(tenantId!, query, topK);
            return NextResponse.json({ query, results, count: results.length });
        }

        if (action === 'stats') {
            const stats = await getKBStats(tenantId!);
            return NextResponse.json(stats);
        }

        const documents = await listKBDocuments(tenantId!);
        return NextResponse.json({ documents, count: documents.length });

    } catch (error) {
        return handleApiError(error, 'Knowledge GET');
    }
}

// =============================================
// DELETE: Remove a document
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const validation = requireFields(body, ['documentId']);
        if (validation) return errorResponse(validation);

        await deleteKBDocument(tenantId!, body.documentId);

        return NextResponse.json({ message: `Document ${body.documentId} deleted` });

    } catch (error) {
        return handleApiError(error, 'Knowledge DELETE');
    }
}
