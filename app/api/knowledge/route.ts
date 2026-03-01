/**
 * Knowledge Base API — Document management and RAG query endpoint
 *
 * POST: Ingest a new document (text, URL, PDF upload, or file upload)
 *       Supports both JSON body and multipart/form-data for file uploads
 * GET:  List KB documents or query the knowledge base
 * DELETE: Remove a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestDocument, listKBDocuments, deleteKBDocument, queryKnowledgeBase, getKBStats } from '@/lib/knowledge/pipeline';
import type { DocumentSource } from '@/lib/knowledge/document-processor';
import { handleApiError, requireAuth, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // File processing can take longer

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

        const contentType = request.headers.get('content-type') || '';
        let source: DocumentSource;

        if (contentType.includes('multipart/form-data')) {
            // ─── File Upload (multipart/form-data) ───
            source = await parseMultipartUpload(request);
        } else {
            // ─── JSON body (text or URL) ───
            const body = await request.json();
            const validation = requireFields(body, ['type', 'content']);
            if (validation) return errorResponse(validation);

            source = {
                type: body.type,
                content: body.content,
                filename: body.filename,
            };
        }

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
            const topK = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('topK') || '5') || 5, 1), 50);
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

// =============================================
// Multipart File Upload Parser
// =============================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES: Record<string, DocumentSource['type']> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/markdown': 'text',
    'text/csv': 'text',
    'application/json': 'text',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file', // .docx
};

async function parseMultipartUpload(request: NextRequest): Promise<DocumentSource> {
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const filename = formData.get('filename') as string | null;
    const docType = formData.get('type') as string | null;

    if (!file) {
        throw new Error('No file provided in the upload');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Determine document type from MIME or extension
    const mimeType = file.type || 'application/octet-stream';
    const resolvedType = (docType as DocumentSource['type'])
        || ALLOWED_MIME_TYPES[mimeType]
        || inferTypeFromFilename(file.name)
        || 'file';

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // For text-based types, convert to string; for binary (PDF), use base64
    let content: string;
    if (resolvedType === 'pdf') {
        content = buffer.toString('base64');
    } else {
        content = buffer.toString('utf-8');
    }

    return {
        type: resolvedType,
        content,
        filename: filename || file.name,
        mimeType,
    };
}

function inferTypeFromFilename(name: string): DocumentSource['type'] | null {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'pdf';
        case 'txt':
        case 'md':
        case 'markdown':
        case 'csv':
        case 'json':
        case 'log':
            return 'text';
        case 'docx':
            return 'file';
        default:
            return null;
    }
}
