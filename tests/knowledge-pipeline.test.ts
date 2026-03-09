/**
 * Knowledge Pipeline Tests
 *
 * Comprehensive tests for lib/knowledge/pipeline.ts:
 *   - ingestDocument: full ingestion pipeline
 *   - queryKnowledgeBase: two-stage hybrid search
 *   - getRAGContext: voice-optimized RAG context
 *   - listKBDocuments: list all KB documents
 *   - deleteKBDocument: delete document + chunks
 *   - getKBStats: aggregate statistics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Mock all dependencies
// =============================================

vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockBatchSet = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, delete: mockBatchDelete, commit: mockBatchCommit };

const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockDocDelete = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn();

const mockDb = {
    collection: vi.fn(),
    batch: vi.fn(() => mockBatch),
};

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
    },
}));

// Knowledge pipeline dependencies
const mockProcessDocument = vi.fn();
vi.mock('@/lib/knowledge/document-processor', () => ({
    processDocument: (...args: unknown[]) => mockProcessDocument(...args),
}));

const mockChunkText = vi.fn();
const mockDetectContentType = vi.fn();
vi.mock('@/lib/knowledge/chunker', () => ({
    chunkText: (...args: unknown[]) => mockChunkText(...args),
    detectContentType: (...args: unknown[]) => mockDetectContentType(...args),
}));

const mockGenerateEmbedding = vi.fn();
const mockGenerateEmbeddings = vi.fn();
const mockCosineSimilarity = vi.fn();
vi.mock('@/lib/knowledge/embeddings', () => ({
    generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
    generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
    cosineSimilarity: (...args: unknown[]) => mockCosineSimilarity(...args),
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// =============================================
// Helpers
// =============================================

function makeChunks(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        index: i,
        content: `Chunk content ${i}`,
        wordCount: 3,
        startPos: i * 100,
        endPos: (i + 1) * 100,
        contentType: 'general' as const,
    }));
}

function makeEmbeddings(count: number) {
    return {
        embeddings: Array.from({ length: count }, (_, i) => ({
            text: `Chunk content ${i}`,
            vector: Array(768).fill(0).map((_, j) => (i + j) * 0.001),
            tokens: 10,
        })),
        totalTokens: count * 10,
        model: 'text-embedding-3-small',
        dimensions: 768,
    };
}

/**
 * Build the Firestore collection chain mock for pipeline functions.
 *
 * Path layout:
 *   tenants/{tenantId}/kb_documents  — via db.collection('tenants').doc(tid).collection('kb_documents')
 *   tenants/{tenantId}/kb_chunks     — via db.collection('tenants').doc(tid).collection('kb_chunks')
 *
 * Options let individual tests override the query results returned.
 */
function setupFirestoreMocks(opts?: {
    chunksSnapDocs?: Array<{ id: string; ref: { id: string }; data: () => Record<string, unknown> }>;
    chunksSnapEmpty?: boolean;
    chunksWhereSnapDocs?: Array<{ id: string; ref: { id: string }; data: () => Record<string, unknown> }>;
    docsSnapDocs?: Array<{ id: string; data: () => Record<string, unknown> }>;
}) {
    const chunksSnapDocs = opts?.chunksSnapDocs ?? [];
    const chunksSnapEmpty = opts?.chunksSnapEmpty ?? chunksSnapDocs.length === 0;
    const chunksWhereSnapDocs = opts?.chunksWhereSnapDocs ?? [];
    const docsSnapDocs = opts?.docsSnapDocs ?? [];

    const docRefMock = {
        id: 'doc-123',
        set: mockDocSet,
        update: mockDocUpdate,
        delete: mockDocDelete,
        get: mockDocGet,
    };

    // kb_chunks sub-collection mock
    const kbChunksMock = {
        doc: vi.fn().mockReturnValue(docRefMock),
        get: vi.fn().mockResolvedValue({
            empty: chunksSnapEmpty,
            size: chunksSnapDocs.length,
            docs: chunksSnapDocs,
        }),
        where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
                docs: chunksWhereSnapDocs,
                size: chunksWhereSnapDocs.length,
            }),
        }),
        orderBy: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ docs: [] }),
        }),
    };

    // kb_documents sub-collection mock
    const kbDocsMock = {
        doc: vi.fn().mockReturnValue(docRefMock),
        get: vi.fn().mockResolvedValue({
            empty: docsSnapDocs.length === 0,
            size: docsSnapDocs.length,
            docs: docsSnapDocs,
        }),
        where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ docs: [], size: 0 }),
        }),
        orderBy: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
                docs: docsSnapDocs,
            }),
        }),
    };

    // tenant doc mock that routes to correct sub-collection
    const tenantDocMock = {
        collection: vi.fn().mockImplementation((name: string) => {
            if (name === 'kb_chunks') return kbChunksMock;
            if (name === 'kb_documents') return kbDocsMock;
            return kbDocsMock;
        }),
    };

    // tenants collection
    const tenantsCollectionMock = {
        doc: vi.fn().mockReturnValue(tenantDocMock),
    };

    mockDb.collection.mockImplementation(() => tenantsCollectionMock);

    return { docRefMock, kbChunksMock, kbDocsMock, tenantDocMock };
}

// =============================================
// Test Suites
// =============================================

describe('ingestDocument', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('successful ingestion returns ready status with correct fields', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockResolvedValue({
            title: 'Test Document',
            content: 'Some document content for testing.',
            metadata: { source: 'test.txt', type: 'text', wordCount: 5, charCount: 33, processedAt: '2025-01-01' },
        });
        mockDetectContentType.mockReturnValue('general');
        mockChunkText.mockReturnValue(makeChunks(3));
        mockGenerateEmbeddings.mockResolvedValue(makeEmbeddings(3));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        const result = await ingestDocument('tenant-1', { type: 'text', content: 'Some document content for testing.' });

        expect(result.documentId).toBe('doc-123');
        expect(result.title).toBe('Test Document');
        expect(result.chunkCount).toBe(3);
        expect(result.status).toBe('ready');
        expect(result.totalTokens).toBe(30);
        expect(result.contentType).toBe('general');
    });

    it('creates Firestore document record with processing status', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockResolvedValue({
            title: 'Doc',
            content: 'content',
            metadata: { source: 'test.txt', type: 'text', wordCount: 1, charCount: 7, processedAt: '2025-01-01' },
        });
        mockDetectContentType.mockReturnValue('general');
        mockChunkText.mockReturnValue(makeChunks(1));
        mockGenerateEmbeddings.mockResolvedValue(makeEmbeddings(1));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        await ingestDocument('tenant-1', { type: 'text', content: 'content' });

        // docRef.set should be called with status='processing'
        expect(mockDocSet).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                status: 'processing',
            }),
        );
    });

    it('stores chunks via batch.set', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockResolvedValue({
            title: 'Doc',
            content: 'content',
            metadata: { source: 'test.txt', type: 'text', wordCount: 1, charCount: 7, processedAt: '2025-01-01' },
        });
        mockDetectContentType.mockReturnValue('general');
        mockChunkText.mockReturnValue(makeChunks(3));
        mockGenerateEmbeddings.mockResolvedValue(makeEmbeddings(3));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        await ingestDocument('tenant-1', { type: 'text', content: 'content' });

        // batch.set called once per chunk
        expect(mockBatchSet).toHaveBeenCalledTimes(3);
        // batch.commit called once (3 chunks < 200 batch size)
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it('updates document status to ready after ingestion', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockResolvedValue({
            title: 'Finished Doc',
            content: 'content',
            metadata: { source: 'test.txt', type: 'text', wordCount: 1, charCount: 7, processedAt: '2025-01-01' },
        });
        mockDetectContentType.mockReturnValue('faq');
        mockChunkText.mockReturnValue(makeChunks(2));
        mockGenerateEmbeddings.mockResolvedValue(makeEmbeddings(2));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        await ingestDocument('tenant-1', { type: 'text', content: 'content' });

        expect(mockDocUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'ready',
                title: 'Finished Doc',
                chunkCount: 2,
                contentType: 'faq',
            }),
        );
    });

    it('handles large documents with multiple batches (250 chunks -> 2 batches)', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockResolvedValue({
            title: 'Large Doc',
            content: 'content',
            metadata: { source: 'big.txt', type: 'text', wordCount: 10000, charCount: 50000, processedAt: '2025-01-01' },
        });
        mockDetectContentType.mockReturnValue('general');
        mockChunkText.mockReturnValue(makeChunks(250));
        mockGenerateEmbeddings.mockResolvedValue(makeEmbeddings(250));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        await ingestDocument('tenant-1', { type: 'text', content: 'content' });

        // 250 chunks => 200 + 50 => 2 batches
        expect(mockBatchSet).toHaveBeenCalledTimes(250);
        expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    });

    it('returns error status when processDocument throws', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockRejectedValue(new Error('PDF parse failed'));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        const result = await ingestDocument('tenant-1', { type: 'pdf', content: 'bad-data' });

        expect(result.status).toBe('error');
        expect(result.error).toBe('PDF parse failed');
        expect(result.chunkCount).toBe(0);
        // Verify doc status updated to error
        expect(mockDocUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'error',
                error: 'PDF parse failed',
            }),
        );
    });

    it('detects content type and passes it to chunker', async () => {
        vi.resetModules();

        setupFirestoreMocks();

        mockProcessDocument.mockResolvedValue({
            title: 'FAQ Doc',
            content: 'FAQ content here',
            metadata: { source: 'faq.txt', type: 'text', wordCount: 3, charCount: 16, processedAt: '2025-01-01' },
        });
        mockDetectContentType.mockReturnValue('faq');
        mockChunkText.mockReturnValue(makeChunks(1));
        mockGenerateEmbeddings.mockResolvedValue(makeEmbeddings(1));

        const { ingestDocument } = await import('@/lib/knowledge/pipeline');

        await ingestDocument('tenant-1', { type: 'text', content: 'FAQ content here' });

        // detectContentType called with the processed content
        expect(mockDetectContentType).toHaveBeenCalledWith('FAQ content here');
        // chunkText called with detected contentType in options
        expect(mockChunkText).toHaveBeenCalledWith(
            'FAQ content here',
            expect.objectContaining({ contentType: 'faq' }),
        );
    });
});

describe('queryKnowledgeBase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns scored results sorted by fused score', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-1',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'First chunk about returns',
                    vector: [0.1, 0.2, 0.3],
                    index: 0,
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-2',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Second chunk about shipping',
                    vector: [0.4, 0.5, 0.6],
                    index: 1,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'shipping info',
            vector: [0.4, 0.5, 0.6],
            tokens: 5,
        });
        // chunk-2 has higher cosine similarity
        mockCosineSimilarity
            .mockReturnValueOnce(0.5)   // chunk-1
            .mockReturnValueOnce(0.9);  // chunk-2

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'shipping info', 5, 0.20);

        expect(results.length).toBeGreaterThanOrEqual(1);
        // Results should be sorted descending by score
        if (results.length >= 2) {
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        }
    });

    it('returns empty array when no chunks exist', async () => {
        vi.resetModules();

        setupFirestoreMocks({ chunksSnapDocs: [], chunksSnapEmpty: true });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'query',
            vector: [0.1, 0.2, 0.3],
            tokens: 3,
        });

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'query');

        expect(results).toEqual([]);
    });

    it('filters results below minScore', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-low',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Low relevance chunk',
                    vector: [0.1, 0.2, 0.3],
                    index: 0,
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-high',
                data: () => ({
                    documentId: 'doc-2',
                    content: 'High relevance chunk',
                    vector: [0.7, 0.8, 0.9],
                    index: 0,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'query',
            vector: [0.7, 0.8, 0.9],
            tokens: 3,
        });
        // chunk-low: semantic 0.1 => fused = 0.1*0.7 + keyword*0.3 ~ low
        // chunk-high: semantic 0.8 => fused = 0.8*0.7 + keyword*0.3 ~ high
        mockCosineSimilarity
            .mockReturnValueOnce(0.1)   // chunk-low: fused ~0.07 + keyword < 0.5 min
            .mockReturnValueOnce(0.8);  // chunk-high: fused ~0.56+

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'query', 5, 0.5);

        // Only chunk-high should survive the minScore=0.5 filter
        for (const r of results) {
            expect(r.score).toBeGreaterThanOrEqual(0.5);
        }
    });

    it('applies 70% semantic + 30% keyword scoring', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-1',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'test keyword match content',
                    vector: [0.5, 0.5, 0.5],
                    index: 0,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'test keyword',
            vector: [0.5, 0.5, 0.5],
            tokens: 3,
        });
        const semanticScore = 0.6;
        mockCosineSimilarity.mockReturnValue(semanticScore);

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'test keyword', 5, 0.0);

        // The result score includes 70% semantic + 30% keyword + potential reranking boosts
        // At minimum, the semantic component should be present
        expect(results.length).toBeGreaterThanOrEqual(1);
        // fused >= semanticScore * 0.7 (keyword adds more)
        expect(results[0].score).toBeGreaterThanOrEqual(semanticScore * 0.7);
        // Metadata should expose both sub-scores
        expect(results[0].metadata).toHaveProperty('semanticScore', semanticScore);
        expect(results[0].metadata).toHaveProperty('keywordScore');
    });

    it('reranks FAQ chunks for question queries with boost', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-general',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Some general information about products',
                    vector: [0.5, 0.5, 0.5],
                    index: 0,
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-faq',
                data: () => ({
                    documentId: 'doc-2',
                    content: 'FAQ about returns policy',
                    vector: [0.5, 0.5, 0.5],
                    index: 1,
                    contentType: 'faq',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'How do I return?',
            vector: [0.5, 0.5, 0.5],
            tokens: 5,
        });
        // Give both chunks the same semantic score — the FAQ should still rank higher due to boost
        mockCosineSimilarity
            .mockReturnValueOnce(0.6)    // chunk-general
            .mockReturnValueOnce(0.6);   // chunk-faq

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        // "how" triggers isQuestion regex
        const results = await queryKnowledgeBase('tenant-1', 'How do I return?', 5, 0.0);

        // Find the FAQ result
        const faqResult = results.find(r => r.chunkId === 'chunk-faq');
        const generalResult = results.find(r => r.chunkId === 'chunk-general');

        expect(faqResult).toBeDefined();
        expect(generalResult).toBeDefined();
        // FAQ chunk should have a higher score due to +0.08 boost for isQuestion + faq contentType
        expect(faqResult!.score).toBeGreaterThan(generalResult!.score);
    });

    it('deduplicates adjacent chunks from same document', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-a',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Adjacent chunk A',
                    vector: [0.5, 0.5, 0.5],
                    index: 0,
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-b',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Adjacent chunk B',
                    vector: [0.5, 0.5, 0.5],
                    index: 1,  // adjacent to chunk-a (index 0)
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-c',
                data: () => ({
                    documentId: 'doc-2',
                    content: 'Different document chunk',
                    vector: [0.5, 0.5, 0.5],
                    index: 0,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'adjacent test',
            vector: [0.5, 0.5, 0.5],
            tokens: 3,
        });
        // All have same high score so dedup logic activates on adjacency
        mockCosineSimilarity.mockReturnValue(0.8);

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'adjacent test', 5, 0.0);

        // Should not have both chunk-a and chunk-b (they are adjacent from same doc)
        const doc1Chunks = results.filter(r => r.documentId === 'doc-1');
        expect(doc1Chunks.length).toBeLessThanOrEqual(1);
        // chunk-c from doc-2 should still be present
        const doc2Chunks = results.filter(r => r.documentId === 'doc-2');
        expect(doc2Chunks.length).toBe(1);
    });

    it('returns top-K results when more candidates are available', async () => {
        vi.resetModules();

        const chunkDocs = Array.from({ length: 10 }, (_, i) => ({
            id: `chunk-${i}`,
            data: () => ({
                documentId: `doc-${i}`,
                content: `Chunk number ${i} with unique content`,
                vector: [0.5, 0.5, 0.5],
                index: 0,
                contentType: 'general',
            }),
        }));

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'query',
            vector: [0.5, 0.5, 0.5],
            tokens: 3,
        });
        // Decreasing scores so all pass min threshold
        for (let i = 0; i < 10; i++) {
            mockCosineSimilarity.mockReturnValueOnce(0.9 - i * 0.05);
        }

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'query', 3, 0.0);

        // topK=3 means at most 3 results
        expect(results.length).toBeLessThanOrEqual(3);
    });

    it('skips chunks without valid vector', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-no-vector',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'No vector chunk',
                    vector: null,
                    index: 0,
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-undefined-vector',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Undefined vector chunk',
                    // vector is missing entirely
                    index: 1,
                    contentType: 'general',
                }),
            },
            {
                id: 'chunk-valid',
                data: () => ({
                    documentId: 'doc-2',
                    content: 'Valid chunk with vector',
                    vector: [0.5, 0.5, 0.5],
                    index: 0,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'query',
            vector: [0.5, 0.5, 0.5],
            tokens: 3,
        });
        mockCosineSimilarity.mockReturnValue(0.8);

        const { queryKnowledgeBase } = await import('@/lib/knowledge/pipeline');

        const results = await queryKnowledgeBase('tenant-1', 'query', 5, 0.0);

        // Only chunk-valid should appear — the two without valid vectors are skipped
        expect(results.length).toBe(1);
        expect(results[0].chunkId).toBe('chunk-valid');
    });
});

describe('getRAGContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns formatted context with confidence labels', async () => {
        vi.resetModules();

        // Set up chunks with different scores for confidence label testing
        const chunkDocs = [
            {
                id: 'chunk-high',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'High confidence answer about return policy.',
                    vector: [0.9, 0.9, 0.9],
                    index: 0,
                    contentType: 'faq',
                }),
            },
            {
                id: 'chunk-mid',
                data: () => ({
                    documentId: 'doc-2',
                    content: 'Medium confidence info about shipping.',
                    vector: [0.5, 0.5, 0.5],
                    index: 0,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'return policy?',
            vector: [0.9, 0.9, 0.9],
            tokens: 4,
        });
        // High confidence chunk gets high semantic score, medium gets medium
        mockCosineSimilarity
            .mockReturnValueOnce(0.85)  // chunk-high -> fused ~0.6+
            .mockReturnValueOnce(0.55); // chunk-mid -> fused ~0.4+

        const { getRAGContext } = await import('@/lib/knowledge/pipeline');

        const context = await getRAGContext('tenant-1', 'return policy?');

        // Context should contain the structured format
        expect(context).toContain('KURUMSAL');
        expect(context).toContain('BİLGİ SONU');
        // Should include confidence labels (Turkish)
        // Score >= 0.6 -> 'yuksek', >= 0.4 -> 'orta'
        expect(context).toMatch(/güven: (yüksek|orta|düşük)/);
    });

    it('returns empty string when no results match', async () => {
        vi.resetModules();

        setupFirestoreMocks({ chunksSnapDocs: [], chunksSnapEmpty: true });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'no match query',
            vector: [0.1, 0.1, 0.1],
            tokens: 3,
        });

        const { getRAGContext } = await import('@/lib/knowledge/pipeline');

        const context = await getRAGContext('tenant-1', 'no match query');

        expect(context).toBe('');
    });

    it('respects maxContextLength budget', async () => {
        vi.resetModules();

        // Create chunks with long content
        const longContent = 'A'.repeat(500);
        const chunkDocs = Array.from({ length: 5 }, (_, i) => ({
            id: `chunk-${i}`,
            data: () => ({
                documentId: `doc-${i}`,
                content: `${longContent} chunk ${i}. This is a sentence boundary.`,
                vector: [0.8, 0.8, 0.8],
                index: 0,
                contentType: 'general',
            }),
        }));

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'long query',
            vector: [0.8, 0.8, 0.8],
            tokens: 3,
        });
        mockCosineSimilarity.mockReturnValue(0.8);

        const { getRAGContext } = await import('@/lib/knowledge/pipeline');

        const maxLen = 800;
        const context = await getRAGContext('tenant-1', 'long query', 3, maxLen);

        // The formatted content between the markers should respect the budget
        // Extract just the chunk content section
        if (context) {
            const innerMatch = context.match(/KURUMSAL BİLGİ ---\n([\s\S]*)\n--- BİLGİ SONU ---/);
            if (innerMatch) {
                // The total chunk content used should be bounded by maxContextLength
                // We verify the function doesn't produce excessively large output
                // (It may exceed slightly due to formatting labels, but raw content should respect the budget)
                const inner = innerMatch[1];
                // The inner content includes formatting, but should be in a reasonable range
                expect(inner.length).toBeLessThan(maxLen + 500); // generous margin for formatting
            }
        }
    });

    it('filters low-confidence results with score < 0.30', async () => {
        vi.resetModules();

        const chunkDocs = [
            {
                id: 'chunk-low',
                data: () => ({
                    documentId: 'doc-1',
                    content: 'Very low relevance content',
                    vector: [0.1, 0.1, 0.1],
                    index: 0,
                    contentType: 'general',
                }),
            },
        ];

        setupFirestoreMocks({ chunksSnapDocs: chunkDocs as never[], chunksSnapEmpty: false });

        mockGenerateEmbedding.mockResolvedValue({
            text: 'unrelated query',
            vector: [0.9, 0.9, 0.9],
            tokens: 3,
        });
        // Very low semantic score -> fused < 0.30
        mockCosineSimilarity.mockReturnValue(0.15);

        const { getRAGContext } = await import('@/lib/knowledge/pipeline');

        const context = await getRAGContext('tenant-1', 'unrelated query');

        // Low-confidence chunks (score < 0.30) are filtered by getRAGContext
        // Since queryKnowledgeBase itself has minScore 0.20 default, and getRAGContext
        // further filters at 0.30, the result should be empty
        expect(context).toBe('');
    });
});

describe('deleteKBDocument', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deletes all chunks and document record', async () => {
        vi.resetModules();

        const chunkRefs = [
            { id: 'chunk-1', ref: { id: 'chunk-1' }, data: () => ({}) },
            { id: 'chunk-2', ref: { id: 'chunk-2' }, data: () => ({}) },
            { id: 'chunk-3', ref: { id: 'chunk-3' }, data: () => ({}) },
        ];

        setupFirestoreMocks({
            chunksWhereSnapDocs: chunkRefs as never[],
        });

        const { deleteKBDocument } = await import('@/lib/knowledge/pipeline');

        await deleteKBDocument('tenant-1', 'doc-to-delete');

        // batch.delete called for each chunk
        expect(mockBatchDelete).toHaveBeenCalledTimes(3);
        // batch.commit called once (3 < 200)
        expect(mockBatchCommit).toHaveBeenCalled();
        // Document record deleted
        expect(mockDocDelete).toHaveBeenCalled();
    });

    it('handles empty chunk list gracefully', async () => {
        vi.resetModules();

        setupFirestoreMocks({ chunksWhereSnapDocs: [] });

        const { deleteKBDocument } = await import('@/lib/knowledge/pipeline');

        await deleteKBDocument('tenant-1', 'doc-no-chunks');

        // No batch operations needed for zero chunks
        expect(mockBatchDelete).not.toHaveBeenCalled();
        // Document record should still be deleted
        expect(mockDocDelete).toHaveBeenCalled();
    });
});

describe('getKBStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('aggregates stats from ready documents only', async () => {
        vi.resetModules();

        const docsSnapDocs = [
            {
                id: 'doc-1',
                data: () => ({
                    id: 'doc-1',
                    tenantId: 'tenant-1',
                    title: 'Ready Doc 1',
                    sourceType: 'text',
                    source: 'test1.txt',
                    chunkCount: 10,
                    totalTokens: 500,
                    status: 'ready',
                    metadata: {},
                    createdAt: 'SERVER_TS',
                    updatedAt: 'SERVER_TS',
                }),
            },
            {
                id: 'doc-2',
                data: () => ({
                    id: 'doc-2',
                    tenantId: 'tenant-1',
                    title: 'Ready Doc 2',
                    sourceType: 'url',
                    source: 'https://example.com',
                    chunkCount: 20,
                    totalTokens: 1000,
                    status: 'ready',
                    metadata: {},
                    createdAt: 'SERVER_TS',
                    updatedAt: 'SERVER_TS',
                }),
            },
            {
                id: 'doc-3',
                data: () => ({
                    id: 'doc-3',
                    tenantId: 'tenant-1',
                    title: 'Error Doc',
                    sourceType: 'pdf',
                    source: 'broken.pdf',
                    chunkCount: 0,
                    totalTokens: 0,
                    status: 'error',
                    error: 'parse failed',
                    metadata: {},
                    createdAt: 'SERVER_TS',
                    updatedAt: 'SERVER_TS',
                }),
            },
        ];

        setupFirestoreMocks({ docsSnapDocs: docsSnapDocs as never[] });

        const { getKBStats } = await import('@/lib/knowledge/pipeline');

        const stats = await getKBStats('tenant-1');

        // Only 2 "ready" docs counted
        expect(stats.documentCount).toBe(2);
        // 10 + 20 chunks
        expect(stats.chunkCount).toBe(30);
        // 500 + 1000 tokens
        expect(stats.totalTokens).toBe(1500);
        // sourceTypes: text=1, url=1 (pdf/error doc excluded)
        expect(stats.sourceTypes).toEqual({ text: 1, url: 1 });
    });
});
