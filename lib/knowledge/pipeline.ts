/**
 * Knowledge Base Pipeline — End-to-End Ingestion & Retrieval
 *
 * Orchestrates the full pipeline:
 * 1. Document Processing → normalized text
 * 2. Text Chunking → overlapping chunks
 * 3. Embedding Generation → vectors
 * 4. Storage → Firestore (tenants/{id}/kb_chunks/)
 * 5. Retrieval → query embedding → cosine similarity → top-K
 */

import { processDocument, type DocumentSource, type ProcessedDocument } from './document-processor';
import { chunkText, type TextChunk } from './chunker';
import { generateEmbedding, generateEmbeddings, cosineSimilarity, type EmbeddingResult } from './embeddings';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// =============================================
// Types
// =============================================

export interface KBDocument {
    id: string;
    tenantId: string;
    title: string;
    sourceType: DocumentSource['type'];
    source: string;
    chunkCount: number;
    totalTokens: number;
    status: 'processing' | 'ready' | 'error';
    error?: string;
    metadata: Record<string, unknown>;
    createdAt: unknown;
    updatedAt: unknown;
}

export interface KBChunk {
    id: string;
    documentId: string;
    index: number;
    content: string;
    vector: number[];
    wordCount: number;
    startPos: number;
    endPos: number;
}

export interface RetrievalResult {
    chunkId: string;
    documentId: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
}

export interface IngestResult {
    documentId: string;
    title: string;
    chunkCount: number;
    totalTokens: number;
    status: 'ready' | 'error';
    error?: string;
}

// =============================================
// Firestore helpers
// =============================================

let db: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore {
    if (!db) {
        initAdmin();
        db = getFirestore();
    }
    return db;
}

function tenantKbDocs(tenantId: string) {
    return getDb().collection('tenants').doc(tenantId).collection('kb_documents');
}

function tenantKbChunks(tenantId: string) {
    return getDb().collection('tenants').doc(tenantId).collection('kb_chunks');
}

// =============================================
// Ingest Pipeline
// =============================================

/**
 * Ingest a document source into the knowledge base.
 *
 * Pipeline: Parse → Chunk → Embed → Store
 */
export async function ingestDocument(
    tenantId: string,
    source: DocumentSource,
): Promise<IngestResult> {
    const firestore = getDb();

    // 1. Create document record (status: processing)
    const docRef = tenantKbDocs(tenantId).doc();
    const documentId = docRef.id;

    await docRef.set({
        tenantId,
        sourceType: source.type,
        source: source.type === 'url' ? source.content : (source.filename || 'direct-input'),
        status: 'processing',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    try {
        // 2. Process document → normalized text
        const processed = await processDocument(source);
        console.log(`[KB] Processed: "${processed.title}" (${processed.metadata.wordCount} words)`);

        // 3. Chunk text
        const chunks = chunkText(processed.content);
        console.log(`[KB] Chunked into ${chunks.length} chunks`);

        // 4. Generate embeddings for all chunks
        const embeddingResult = await generateEmbeddings(
            chunks.map(c => c.content),
        );
        console.log(`[KB] Generated ${embeddingResult.embeddings.length} embeddings (${embeddingResult.totalTokens} tokens)`);

        // 5. Store chunks with vectors in Firestore
        const BATCH_SIZE = 500; // Firestore batch limit
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = firestore.batch();
            const batchChunks = chunks.slice(i, i + BATCH_SIZE);

            for (let j = 0; j < batchChunks.length; j++) {
                const chunk = batchChunks[j];
                const embedding = embeddingResult.embeddings[i + j];
                const chunkRef = tenantKbChunks(tenantId).doc();

                batch.set(chunkRef, {
                    documentId,
                    index: chunk.index,
                    content: chunk.content,
                    vector: embedding.vector,
                    wordCount: chunk.wordCount,
                    startPos: chunk.startPos,
                    endPos: chunk.endPos,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }

            await batch.commit();
        }

        // 6. Update document status → ready
        await docRef.update({
            title: processed.title,
            chunkCount: chunks.length,
            totalTokens: embeddingResult.totalTokens,
            status: 'ready',
            metadata: processed.metadata,
            updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`[KB] Document "${processed.title}" ingested: ${chunks.length} chunks, ${embeddingResult.totalTokens} tokens`);

        return {
            documentId,
            title: processed.title,
            chunkCount: chunks.length,
            totalTokens: embeddingResult.totalTokens,
            status: 'ready',
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[KB] Ingestion failed:`, errorMsg);

        await docRef.update({
            status: 'error',
            error: errorMsg,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            documentId,
            title: '',
            chunkCount: 0,
            totalTokens: 0,
            status: 'error',
            error: errorMsg,
        };
    }
}

// =============================================
// Retrieval — Hybrid Search (Semantic + Keyword)
// =============================================

/**
 * Query the knowledge base with hybrid search:
 * 1. Semantic search (cosine similarity on embeddings)
 * 2. Keyword search (BM25-like TF scoring)
 * 3. Score fusion with configurable weights
 * 4. Result deduplication & reranking
 */
export async function queryKnowledgeBase(
    tenantId: string,
    query: string,
    topK: number = 5,
    minScore: number = 0.25,
): Promise<RetrievalResult[]> {
    // 1. Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // 2. Load all chunk vectors for this tenant
    const chunksSnap = await tenantKbChunks(tenantId).get();

    if (chunksSnap.empty) {
        return [];
    }

    // 3. Prepare keyword tokens from query
    const queryTokens = tokenize(query);

    // 4. Score each chunk with hybrid approach
    const scoredChunks: Array<{
        chunkId: string;
        documentId: string;
        content: string;
        semanticScore: number;
        keywordScore: number;
        fusedScore: number;
        index: number;
    }> = [];

    for (const doc of chunksSnap.docs) {
        const data = doc.data();
        if (!data.vector || !Array.isArray(data.vector)) continue;

        // Semantic score
        const semanticScore = cosineSimilarity(queryEmbedding.vector, data.vector);

        // Keyword score (BM25-lite)
        const keywordScore = computeKeywordScore(data.content, queryTokens);

        // Fused score: 70% semantic + 30% keyword
        const fusedScore = (semanticScore * 0.7) + (keywordScore * 0.3);

        if (fusedScore >= minScore) {
            scoredChunks.push({
                chunkId: doc.id,
                documentId: data.documentId,
                content: data.content,
                semanticScore,
                keywordScore,
                fusedScore,
                index: data.index || 0,
            });
        }
    }

    // 5. Sort by fused score descending
    scoredChunks.sort((a, b) => b.fusedScore - a.fusedScore);

    // 6. Deduplicate — remove near-duplicate content from same document
    const deduped = deduplicateResults(scoredChunks);

    // 7. Return top-K with metadata
    return deduped.slice(0, topK).map(c => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        content: c.content,
        score: c.fusedScore,
        metadata: {
            semanticScore: c.semanticScore,
            keywordScore: c.keywordScore,
            chunkIndex: c.index,
        },
    }));
}

/**
 * Get RAG context for a voice agent query.
 * Returns formatted context string for injection into the system prompt.
 * Includes context window optimization.
 */
export async function getRAGContext(
    tenantId: string,
    userQuery: string,
    maxChunks: number = 3,
    maxContextLength: number = 3000,
): Promise<string> {
    const results = await queryKnowledgeBase(tenantId, userQuery, maxChunks + 2);

    if (results.length === 0) {
        return '';
    }

    // Context window optimization — fit within maxContextLength
    const selectedChunks: RetrievalResult[] = [];
    let totalLength = 0;

    for (const result of results) {
        if (selectedChunks.length >= maxChunks) break;
        if (totalLength + result.content.length > maxContextLength) {
            // Try truncating the last chunk to fit
            const remaining = maxContextLength - totalLength;
            if (remaining > 200) {
                selectedChunks.push({
                    ...result,
                    content: result.content.slice(0, remaining) + '...',
                });
            }
            break;
        }
        selectedChunks.push(result);
        totalLength += result.content.length;
    }

    if (selectedChunks.length === 0) return '';

    const context = selectedChunks
        .map((r, i) => `[Kaynak ${i + 1}] (Güven: ${(r.score * 100).toFixed(0)}%)\n${r.content}`)
        .join('\n\n---\n\n');

    return `\n\n--- BİLGİ TABANI ---\nAşağıdaki bilgileri yanıtınızda kullanabilirsiniz:\n\n${context}\n--- BİLGİ TABANI SONU ---`;
}

// =============================================
// Hybrid Search Helpers
// =============================================

/** Tokenize text for keyword matching */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2) // skip very short words
        .filter(t => !TURKISH_STOP_WORDS.has(t));
}

/** Compute keyword relevance score (BM25-like TF scoring) */
function computeKeywordScore(content: string, queryTokens: string[]): number {
    if (queryTokens.length === 0) return 0;

    const contentLower = content.toLowerCase();
    const contentTokens = tokenize(content);
    const contentLength = contentTokens.length;
    if (contentLength === 0) return 0;

    let matchedTokens = 0;
    let totalTF = 0;

    for (const token of queryTokens) {
        // Exact token match
        const tf = contentTokens.filter(t => t === token || t.includes(token)).length;
        if (tf > 0) {
            matchedTokens++;
            // BM25-like saturation: tf / (tf + 1.2)
            totalTF += tf / (tf + 1.2);
        }

        // Phrase match bonus: check if multi-word token appears in content
        if (contentLower.includes(token)) {
            totalTF += 0.5;
        }
    }

    // Coverage: what fraction of query tokens matched
    const coverage = matchedTokens / queryTokens.length;

    // Normalize: combine TF and coverage
    const score = (totalTF / queryTokens.length) * 0.6 + coverage * 0.4;

    return Math.min(score, 1.0);
}

/** Remove near-duplicate chunks (same document, adjacent indices) */
function deduplicateResults(
    results: Array<{ chunkId: string; documentId: string; content: string; semanticScore: number; keywordScore: number; fusedScore: number; index: number }>,
): typeof results {
    const seen = new Map<string, number>(); // documentId+index → position in output
    const deduped: typeof results = [];

    for (const r of results) {
        const key = `${r.documentId}_${r.index}`;
        const prevKey = `${r.documentId}_${r.index - 1}`;
        const nextKey = `${r.documentId}_${r.index + 1}`;

        // If exact same chunk exists, skip
        if (seen.has(key)) continue;

        // If adjacent chunk from same doc already included with higher score, skip
        if (seen.has(prevKey) || seen.has(nextKey)) {
            const existingIdx = seen.get(prevKey) ?? seen.get(nextKey);
            if (existingIdx !== undefined && deduped[existingIdx].fusedScore >= r.fusedScore) {
                continue;
            }
        }

        seen.set(key, deduped.length);
        deduped.push(r);
    }

    return deduped;
}

/** Turkish stop words to exclude from keyword matching */
const TURKISH_STOP_WORDS = new Set([
    'bir', 'bu', 've', 'ile', 'için', 'olarak', 'olan', 'den', 'dan',
    'gibi', 'daha', 'çok', 'var', 'yok', 'ama', 'ancak', 'veya',
    'hem', 'ise', 'kadar', 'sonra', 'önce', 'üzerinde', 'altında',
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was',
    'been', 'have', 'has', 'will', 'can', 'not', 'but', 'all', 'also',
]);

// =============================================
// Document Management
// =============================================

/**
 * List all KB documents for a tenant.
 */
export async function listKBDocuments(tenantId: string): Promise<KBDocument[]> {
    const snap = await tenantKbDocs(tenantId)
        .orderBy('createdAt', 'desc')
        .get();

    return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
    } as KBDocument));
}

/**
 * Delete a KB document and all its chunks.
 */
export async function deleteKBDocument(
    tenantId: string,
    documentId: string,
): Promise<void> {
    const firestore = getDb();

    // Delete all chunks for this document
    const chunksSnap = await tenantKbChunks(tenantId)
        .where('documentId', '==', documentId)
        .get();

    const BATCH_SIZE = 500;
    for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
        const batch = firestore.batch();
        const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);
        for (const doc of batchDocs) {
            batch.delete(doc.ref);
        }
        await batch.commit();
    }

    // Delete the document record
    await tenantKbDocs(tenantId).doc(documentId).delete();

    console.log(`[KB] Deleted document ${documentId} and ${chunksSnap.size} chunks`);
}

/**
 * Get KB statistics for a tenant.
 */
export async function getKBStats(tenantId: string): Promise<{
    documentCount: number;
    chunkCount: number;
    totalTokens: number;
    sourceTypes: Record<string, number>;
}> {
    const docs = await listKBDocuments(tenantId);
    const readyDocs = docs.filter(d => d.status === 'ready');

    const sourceTypes: Record<string, number> = {};
    let totalTokens = 0;
    let chunkCount = 0;

    for (const doc of readyDocs) {
        sourceTypes[doc.sourceType] = (sourceTypes[doc.sourceType] || 0) + 1;
        totalTokens += doc.totalTokens || 0;
        chunkCount += doc.chunkCount || 0;
    }

    return {
        documentCount: readyDocs.length,
        chunkCount,
        totalTokens,
        sourceTypes,
    };
}
