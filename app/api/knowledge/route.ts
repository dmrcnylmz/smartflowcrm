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

// =============================================
// POST: Ingest a new document
// =============================================

export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json(
                { error: 'Tenant context required' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const { type, content, filename } = body;

        if (!type || !content) {
            return NextResponse.json(
                { error: 'type and content are required. type: text|url|pdf' },
                { status: 400 },
            );
        }

        const source: DocumentSource = {
            type,
            content,
            filename,
        };

        const result = await ingestDocument(tenantId, source);

        return NextResponse.json(result, {
            status: result.status === 'error' ? 500 : 201,
        });

    } catch (error) {
        console.error('[KB API] Ingest error:', error);
        return NextResponse.json(
            { error: 'Ingestion failed', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// GET: List documents or query KB
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json(
                { error: 'Tenant context required' },
                { status: 403 },
            );
        }

        const query = request.nextUrl.searchParams.get('query');
        const action = request.nextUrl.searchParams.get('action');

        // Query mode: retrieve relevant chunks
        if (query) {
            const topK = parseInt(request.nextUrl.searchParams.get('topK') || '5');
            const results = await queryKnowledgeBase(tenantId, query, topK);
            return NextResponse.json({
                query,
                results,
                count: results.length,
            });
        }

        // Stats mode
        if (action === 'stats') {
            const stats = await getKBStats(tenantId);
            return NextResponse.json(stats);
        }

        // List mode: return all documents
        const documents = await listKBDocuments(tenantId);
        return NextResponse.json({
            documents,
            count: documents.length,
        });

    } catch (error) {
        console.error('[KB API] Query error:', error);
        return NextResponse.json(
            { error: 'Query failed', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// DELETE: Remove a document
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json(
                { error: 'Tenant context required' },
                { status: 403 },
            );
        }

        const { documentId } = await request.json();
        if (!documentId) {
            return NextResponse.json(
                { error: 'documentId is required' },
                { status: 400 },
            );
        }

        await deleteKBDocument(tenantId, documentId);

        return NextResponse.json({
            message: `Document ${documentId} deleted successfully`,
        });

    } catch (error) {
        console.error('[KB API] Delete error:', error);
        return NextResponse.json(
            { error: 'Delete failed', details: String(error) },
            { status: 500 },
        );
    }
}
