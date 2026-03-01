/**
 * API Route Tests — /api/knowledge
 *
 * Tests GET (list/query) and POST (ingest) handlers.
 * Mocks lib/knowledge/pipeline functions used by the route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// Mock the knowledge pipeline module
const mockListKBDocuments = vi.fn();
const mockQueryKnowledgeBase = vi.fn();
const mockIngestDocument = vi.fn();
const mockDeleteKBDocument = vi.fn();
const mockGetKBStats = vi.fn();

vi.mock('@/lib/knowledge/pipeline', () => ({
    listKBDocuments: (...args: unknown[]) => mockListKBDocuments(...args),
    queryKnowledgeBase: (...args: unknown[]) => mockQueryKnowledgeBase(...args),
    ingestDocument: (...args: unknown[]) => mockIngestDocument(...args),
    deleteKBDocument: (...args: unknown[]) => mockDeleteKBDocument(...args),
    getKBStats: (...args: unknown[]) => mockGetKBStats(...args),
}));

describe('/api/knowledge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('should return documents list', async () => {
            const mockDocs = [
                { id: 'doc1', title: 'FAQ', status: 'ready', chunkCount: 10 },
                { id: 'doc2', title: 'Policy', status: 'ready', chunkCount: 5 },
            ];
            mockListKBDocuments.mockResolvedValue(mockDocs);

            const { GET } = await import('@/app/api/knowledge/route');
            const request = createMockRequest('/api/knowledge', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.documents).toHaveLength(2);
            expect(data.count).toBe(2);
        });

        it('should cap topK at 50 for query requests', async () => {
            mockQueryKnowledgeBase.mockResolvedValue([]);

            const { GET } = await import('@/app/api/knowledge/route');
            const request = createMockRequest('/api/knowledge?query=test&topK=99999', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            await response.json();

            // The route caps topK at 50
            expect(mockQueryKnowledgeBase).toHaveBeenCalledWith('tenant-123', 'test', 50);
        });

        it('should return 401 when tenant header is missing', async () => {
            const { GET } = await import('@/app/api/knowledge/route');
            const request = createMockRequest('/api/knowledge');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });

    describe('POST', () => {
        it('should create a knowledge document', async () => {
            mockIngestDocument.mockResolvedValue({
                status: 'success',
                documentId: 'new-doc1',
                chunkCount: 8,
            });

            const { POST } = await import('@/app/api/knowledge/route');
            const request = createMockRequest('/api/knowledge', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: { type: 'text', content: 'Our return policy allows returns within 30 days.' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.status).toBe('success');
            expect(data.documentId).toBe('new-doc1');
            expect(mockIngestDocument).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({ type: 'text' })
            );
        });
    });
});
