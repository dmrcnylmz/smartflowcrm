/**
 * Knowledge Base Pipeline — End-to-End Ingestion & Retrieval
 *
 * Optimized for customer service voice AI:
 *
 * Ingestion Pipeline:
 * 1. Document Processing → normalized text
 * 2. Content-type detection (FAQ, policy, manual, general)
 * 3. Adaptive chunking → content-type aware chunks
 * 4. Embedding generation (768-dim) → vectors
 * 5. Storage → Firestore (batched at 200 docs/batch)
 *
 * Retrieval Pipeline:
 * 1. Query embedding (cached) → vector
 * 2. Hybrid search: 70% semantic + 30% keyword (BM25-lite)
 * 3. Two-stage reranking: broad top-10 → rerank → top-3
 * 4. Token budget: max 600 tokens (~2400 chars) of RAG context
 * 5. Voice-optimized prompt formatting
 */

import { processDocument, type DocumentSource, type ProcessedDocument } from './document-processor';
import { chunkText, detectContentType, type TextChunk, type ContentType } from './chunker';
import { generateEmbedding, generateEmbeddings, cosineSimilarity, type EmbeddingResult } from './embeddings';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/lib/utils/logger';

// =============================================
// Types
// =============================================

export interface KBDocument {
    id: string;
    tenantId: string;
    agentId?: string;  // Agent-specific KB — when set, document belongs to a specific agent
    title: string;
    sourceType: DocumentSource['type'];
    source: string;
    chunkCount: number;
    totalTokens: number;
    status: 'processing' | 'ready' | 'error';
    error?: string;
    contentType?: ContentType;
    metadata: Record<string, unknown>;
    createdAt: unknown;
    updatedAt: unknown;
}

export interface KBChunk {
    id: string;
    documentId: string;
    agentId?: string;  // Inherited from parent document for faster filtered queries
    index: number;
    content: string;
    vector: number[];
    wordCount: number;
    startPos: number;
    endPos: number;
    contentType?: ContentType;
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
    contentType: ContentType;
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
 * Pipeline: Parse → Detect Content Type → Adaptive Chunk → Embed → Store
 */
export async function ingestDocument(
    tenantId: string,
    source: DocumentSource,
    agentId?: string,
): Promise<IngestResult> {
    const firestore = getDb();

    // 1. Create document record (status: processing)
    const docRef = tenantKbDocs(tenantId).doc();
    const documentId = docRef.id;

    await docRef.set({
        tenantId,
        ...(agentId ? { agentId } : {}),
        sourceType: source.type,
        source: source.type === 'url' ? source.content : (source.filename || 'direct-input'),
        status: 'processing',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    try {
        // 2. Process document → normalized text
        const processed = await processDocument(source);
        logger.debug(`[KB] Processed: "${processed.title}" (${processed.metadata.wordCount} words)`);

        // 3. Detect content type for adaptive chunking
        const contentType = detectContentType(processed.content);
        logger.debug(`[KB] Content type detected: ${contentType}`);

        // 4. Chunk text with content-type aware strategy
        const chunks = chunkText(processed.content, { contentType });
        logger.debug(`[KB] Chunked into ${chunks.length} chunks (type: ${contentType})`);

        // 5. Generate embeddings for all chunks (768-dim)
        const embeddingResult = await generateEmbeddings(
            chunks.map(c => c.content),
        );
        logger.debug(`[KB] Generated ${embeddingResult.embeddings.length} embeddings (${embeddingResult.dimensions}-dim, ${embeddingResult.totalTokens} tokens)`);

        // 6. Store chunks with vectors in Firestore
        // Each chunk doc ≈ 12KB (768-dim vector = ~6KB + text + metadata)
        // Firestore batch limit = 10MB → safe max ≈ 200 docs per batch
        const BATCH_SIZE = 200;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = firestore.batch();
            const batchChunks = chunks.slice(i, i + BATCH_SIZE);

            for (let j = 0; j < batchChunks.length; j++) {
                const chunk = batchChunks[j];
                const embedding = embeddingResult.embeddings[i + j];
                const chunkRef = tenantKbChunks(tenantId).doc();

                batch.set(chunkRef, {
                    documentId,
                    ...(agentId ? { agentId } : {}),
                    index: chunk.index,
                    content: chunk.content,
                    vector: embedding.vector,
                    wordCount: chunk.wordCount,
                    startPos: chunk.startPos,
                    endPos: chunk.endPos,
                    contentType: chunk.contentType,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }

            await batch.commit();
        }

        // 7. Update document status → ready
        await docRef.update({
            title: processed.title,
            chunkCount: chunks.length,
            totalTokens: embeddingResult.totalTokens,
            contentType,
            status: 'ready',
            metadata: processed.metadata,
            updatedAt: FieldValue.serverTimestamp(),
        });

        logger.debug(`[KB] Document "${processed.title}" ingested: ${chunks.length} chunks, ${embeddingResult.totalTokens} tokens, type: ${contentType}`);

        return {
            documentId,
            title: processed.title,
            chunkCount: chunks.length,
            totalTokens: embeddingResult.totalTokens,
            contentType,
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
            contentType: 'general',
            status: 'error',
            error: errorMsg,
        };
    }
}

// =============================================
// Retrieval — Two-Stage Hybrid Search
// =============================================

/**
 * Query the knowledge base with two-stage hybrid search:
 *
 * Stage 1 — Broad retrieval:
 * 1. Semantic search (cosine similarity on embeddings)
 * 2. Keyword search (BM25-like TF scoring)
 * 3. Score fusion: 70% semantic + 30% keyword
 * 4. Take top-(topK * 3) candidates
 *
 * Stage 2 — Reranking:
 * 1. Query-chunk relevance boost (question→FAQ, policy→exact match)
 * 2. Freshness signal (newer documents slight boost)
 * 3. Deduplication (remove near-duplicates from same document)
 * 4. Return top-K
 */
export async function queryKnowledgeBase(
    tenantId: string,
    query: string,
    topK: number = 5,
    minScore: number = 0.20,
    agentId?: string,
): Promise<RetrievalResult[]> {
    // 1. Generate query embedding (cached for repeated queries)
    const queryEmbedding = await generateEmbedding(query);

    // 2. Load chunk vectors for this tenant
    // If agentId is provided, load both agent-specific AND global (no agentId) chunks
    // This gives agent-specific KB priority while still using shared knowledge
    let chunksQuery: FirebaseFirestore.Query = tenantKbChunks(tenantId);
    if (agentId) {
        // We'll filter in-memory to include both agent-specific and global chunks
        // Firestore doesn't support OR queries on optional fields efficiently
    }
    const chunksSnap = await chunksQuery.get();

    if (chunksSnap.empty) {
        return [];
    }

    // 3. Prepare keyword tokens from query
    const queryTokens = tokenize(query);
    const isQuestion = /\?|nasıl|nedir|ne zaman|nerede|kim|kaç|how|what|when|where|who/i.test(query);

    // Stage 1: Broad retrieval — score all chunks
    const broadK = Math.min(topK * 3, chunksSnap.size); // Retrieve 3x candidates for reranking
    const scoredChunks: Array<{
        chunkId: string;
        documentId: string;
        content: string;
        semanticScore: number;
        keywordScore: number;
        fusedScore: number;
        index: number;
        contentType: ContentType;
    }> = [];

    for (const doc of chunksSnap.docs) {
        const data = doc.data();
        if (!data.vector || !Array.isArray(data.vector)) continue;

        // Agent-specific filtering: skip chunks belonging to OTHER agents
        if (agentId && data.agentId && data.agentId !== agentId) continue;

        // Semantic score
        const semanticScore = cosineSimilarity(queryEmbedding.vector, data.vector);

        // Keyword score (BM25-lite)
        const keywordScore = computeKeywordScore(data.content, queryTokens);

        // Fused score: 70% semantic + 30% keyword
        let fusedScore = (semanticScore * 0.7) + (keywordScore * 0.3);

        // Boost agent-specific chunks when querying with agentId
        if (agentId && data.agentId === agentId) {
            fusedScore = Math.min(fusedScore + 0.05, 1.0);
        }

        if (fusedScore >= minScore) {
            scoredChunks.push({
                chunkId: doc.id,
                documentId: data.documentId,
                content: data.content,
                semanticScore,
                keywordScore,
                fusedScore,
                index: data.index || 0,
                contentType: data.contentType || 'general',
            });
        }
    }

    // Sort by fused score
    scoredChunks.sort((a, b) => b.fusedScore - a.fusedScore);

    // Take broad candidates
    const candidates = scoredChunks.slice(0, broadK);

    // Stage 2: Rerank
    const reranked = rerankResults(candidates, query, isQuestion);

    // Deduplicate — remove near-duplicate content from same document
    const deduped = deduplicateResults(reranked);

    // Return top-K with metadata
    return deduped.slice(0, topK).map(c => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        content: c.content,
        score: c.fusedScore,
        metadata: {
            semanticScore: c.semanticScore,
            keywordScore: c.keywordScore,
            contentType: c.contentType,
            chunkIndex: c.index,
        },
    }));
}

/**
 * Rerank candidates with domain-specific signals.
 */
function rerankResults(
    candidates: Array<{
        chunkId: string;
        documentId: string;
        content: string;
        semanticScore: number;
        keywordScore: number;
        fusedScore: number;
        index: number;
        contentType: ContentType;
    }>,
    query: string,
    isQuestion: boolean,
): typeof candidates {
    return candidates.map(c => {
        let boost = 0;

        // Boost FAQ chunks for question-type queries
        if (isQuestion && c.contentType === 'faq') {
            boost += 0.08;
        }

        // Boost policy chunks for policy-related queries
        if (/iade|iptal|garanti|şart|koşul|return|refund|cancel|warranty|policy/i.test(query) &&
            c.contentType === 'policy') {
            boost += 0.06;
        }

        // Boost chunks that contain exact query phrases
        const queryLower = query.toLowerCase();
        const contentLower = c.content.toLowerCase();
        if (queryLower.length > 5 && contentLower.includes(queryLower)) {
            boost += 0.10; // Exact phrase match is very strong signal
        }

        // Slight boost for first chunks (often contain key info like titles/summaries)
        if (c.index === 0) {
            boost += 0.02;
        }

        return {
            ...c,
            fusedScore: Math.min(c.fusedScore + boost, 1.0),
        };
    }).sort((a, b) => b.fusedScore - a.fusedScore);
}

/**
 * Get RAG context for a voice agent query.
 * Returns formatted context string for injection into the system prompt.
 *
 * Token budget optimization:
 * - Max 600 tokens (~2400 chars) of RAG context
 * - Minimizes LLM input tokens → faster response, lower cost
 * - Voice-optimized formatting: concise, no redundancy
 */
export async function getRAGContext(
    tenantId: string,
    userQuery: string,
    maxChunks: number = 3,
    maxContextLength: number = 2400, // ~600 tokens — optimal for voice AI
    agentId?: string,
): Promise<string> {
    const results = await queryKnowledgeBase(tenantId, userQuery, maxChunks + 2, 0.20, agentId);

    if (results.length === 0) {
        return '';
    }

    // Context window optimization — fit within token budget
    const selectedChunks: RetrievalResult[] = [];
    let totalLength = 0;

    for (const result of results) {
        if (selectedChunks.length >= maxChunks) break;

        // Skip low-confidence results
        if (result.score < 0.30) continue;

        if (totalLength + result.content.length > maxContextLength) {
            // Try truncating the last chunk to fit
            const remaining = maxContextLength - totalLength;
            if (remaining > 150) {
                // Truncate at sentence boundary
                const truncated = truncateAtSentence(result.content, remaining);
                selectedChunks.push({
                    ...result,
                    content: truncated,
                });
            }
            break;
        }
        selectedChunks.push(result);
        totalLength += result.content.length;
    }

    if (selectedChunks.length === 0) return '';

    // Voice-optimized prompt formatting
    const context = selectedChunks
        .map((r, i) => {
            const confidence = r.score >= 0.6 ? 'yüksek' : r.score >= 0.4 ? 'orta' : 'düşük';
            return `[${i + 1}] (güven: ${confidence})\n${r.content}`;
        })
        .join('\n\n');

    return `\n--- KURUMSAL BİLGİ ---\nAşağıdaki bilgileri kullanarak yanıt ver. Bilgi dışında kalan konularda "Bu konuda bilgim yok" de.\n\n${context}\n--- BİLGİ SONU ---`;
}

/**
 * Truncate text at the nearest sentence boundary.
 */
function truncateAtSentence(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.slice(0, maxLength);
    // Find last sentence ending
    const lastPeriod = truncated.lastIndexOf('. ');
    const lastQuestion = truncated.lastIndexOf('? ');
    const lastExclaim = truncated.lastIndexOf('! ');
    const lastBoundary = Math.max(lastPeriod, lastQuestion, lastExclaim);

    if (lastBoundary > maxLength * 0.5) {
        return truncated.slice(0, lastBoundary + 1);
    }

    return truncated + '...';
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
    results: Array<{ chunkId: string; documentId: string; content: string; semanticScore: number; keywordScore: number; fusedScore: number; index: number; contentType: ContentType }>,
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
 * Link existing KB documents to an agent by updating agentId.
 * Used after wizard creates an agent — associates KB docs added during wizard.
 */
export async function linkKBDocumentsToAgent(
    tenantId: string,
    documentIds: string[],
    agentId: string,
): Promise<{ updated: number }> {
    if (!documentIds.length || !agentId) return { updated: 0 };

    const db = getDb();
    const batch = db.batch();
    let updated = 0;

    for (const docId of documentIds) {
        const docRef = tenantKbDocs(tenantId).doc(docId);
        batch.update(docRef, { agentId });

        // Also update all chunks for this document
        const chunksSnap = await tenantKbChunks(tenantId)
            .where('documentId', '==', docId)
            .get();
        chunksSnap.docs.forEach(chunk => {
            batch.update(chunk.ref, { agentId });
        });
        updated++;
    }

    await batch.commit();
    return { updated };
}

/**
 * List all KB documents for a tenant.
 */
export async function listKBDocuments(tenantId: string, agentId?: string): Promise<KBDocument[]> {
    let query: FirebaseFirestore.Query = tenantKbDocs(tenantId)
        .orderBy('createdAt', 'desc');

    // If agentId is provided, filter for agent-specific docs only
    if (agentId) {
        query = tenantKbDocs(tenantId)
            .where('agentId', '==', agentId)
            .orderBy('createdAt', 'desc');
    }

    const snap = await query.get();

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

    const BATCH_SIZE = 200;
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

    logger.debug(`[KB] Deleted document ${documentId} and ${chunksSnap.size} chunks`);
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
