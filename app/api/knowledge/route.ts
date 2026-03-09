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
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { meterKbQuery } from '@/lib/billing/metering';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // File processing can take longer

// ─── Rate Limiting for uploads ───────────────────────────────────────────────
const uploadRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkUploadRateLimit(tenantId: string): boolean {
    const now = Date.now();
    const entry = uploadRateLimitMap.get(tenantId);
    if (!entry || entry.resetAt < now) {
        uploadRateLimitMap.set(tenantId, { count: 1, resetAt: now + 60_000 });
        return true;
    }
    if (entry.count >= 10) return false; // 10 uploads per minute per tenant
    entry.count++;
    return true;
}

// =============================================
// POST: Ingest a new document
// =============================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        if (!checkUploadRateLimit(auth.tenantId)) {
            return NextResponse.json({ error: 'Upload rate limit exceeded' }, { status: 429 });
        }

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

        const result = await ingestDocument(auth.tenantId, source);

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
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const query = request.nextUrl.searchParams.get('query');
        const action = request.nextUrl.searchParams.get('action');

        if (query) {
            const topK = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('topK') || '5') || 5, 1), 50);
            const results = await queryKnowledgeBase(auth.tenantId, query, topK);

            // Fire-and-forget: meter KB query
            initAdmin();
            meterKbQuery(getFirestore(), auth.tenantId).catch(() => {});

            return NextResponse.json({ query, results, count: results.length }, {
                headers: cacheHeaders('MEDIUM'),
            });
        }

        if (action === 'stats') {
            const stats = await getKBStats(auth.tenantId);
            return NextResponse.json(stats, {
                headers: cacheHeaders('MEDIUM'),
            });
        }

        const documents = await listKBDocuments(auth.tenantId);
        return NextResponse.json({ documents, count: documents.length }, {
            headers: cacheHeaders('MEDIUM'),
        });

    } catch (error) {
        return handleApiError(error, 'Knowledge GET');
    }
}

// =============================================
// DELETE: Remove a document
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const validation = requireFields(body, ['documentId']);
        if (validation) return errorResponse(validation);

        await deleteKBDocument(auth.tenantId, body.documentId);

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

    // Reject unknown MIME types not in allowlist
    if (!ALLOWED_MIME_TYPES[mimeType] && !inferTypeFromFilename(file.name)) {
        throw new Error(`Desteklenmeyen dosya türü: ${mimeType}`);
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate PDF magic bytes
    if (resolvedType === 'pdf') {
        const header = buffer.slice(0, 5).toString('ascii');
        if (!header.startsWith('%PDF')) {
            throw new Error('Geçersiz PDF dosyası');
        }
    }

    // For text-based types, convert to string; for binary (PDF), use base64
    let content: string;
    if (resolvedType === 'pdf') {
        content = buffer.toString('base64');
    } else {
        content = buffer.toString('utf-8');
    }

    // Sanitize filename to prevent path traversal
    const safeName = (filename || file.name)
        .replace(/[^a-zA-Z0-9._\-\u00C0-\u024F\u0400-\u04FF]/g, '_')
        .substring(0, 255);

    return {
        type: resolvedType,
        content,
        filename: safeName,
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
