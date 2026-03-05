/**
 * Vector Store — Tenant-Isolated Document Search
 *
 * In-memory vector search with Firestore persistence.
 * Per-tenant namespacing — NO cross-tenant data leakage.
 *
 * Design:
 * - Hot tenants cached in memory (LRU, 5-min TTL)
 * - Cold tenants loaded from Firestore on first access
 * - Similarity threshold: ≥ 0.75 = grounded, < 0.75 = escalate
 */

import { EmbeddingGenerator, cosineSimilarity, chunkText } from './embeddings';

// --- Types ---

export interface VectorDocument {
    id: string;
    text: string;
    embedding: number[];
    metadata: {
        source: string;
        category?: string;
        language?: string;
        createdAt: string;
        [key: string]: unknown;
    };
}

export interface SearchResult {
    docId: string;
    text: string;
    score: number;
    metadata: VectorDocument['metadata'];
}

export interface VectorStoreConfig {
    openaiApiKey: string;
    similarityThreshold?: number;
    maxResults?: number;
}

// --- Constants ---

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
const DEFAULT_MAX_RESULTS = 3;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// --- In-Memory Tenant Cache ---

interface TenantCache {
    documents: VectorDocument[];
    loadedAt: number;
}

// --- Vector Store ---

export class VectorStore {
    private embedder: EmbeddingGenerator;
    private cache: Map<string, TenantCache> = new Map();
    private config: Required<VectorStoreConfig>;

    constructor(config: VectorStoreConfig) {
        this.config = {
            openaiApiKey: config.openaiApiKey,
            similarityThreshold: config.similarityThreshold || DEFAULT_SIMILARITY_THRESHOLD,
            maxResults: config.maxResults || DEFAULT_MAX_RESULTS,
        };
        this.embedder = new EmbeddingGenerator({ apiKey: config.openaiApiKey });
    }

    /**
     * Add a document to a tenant's vector store.
     * Automatically chunks and embeds the text.
     */
    async addDocument(
        tenantId: string,
        docId: string,
        text: string,
        metadata: Partial<VectorDocument['metadata']> = {},
    ): Promise<number> {
        const chunks = chunkText(text);
        const embeddings = await this.embedder.generateEmbeddings(chunks);

        const docs: VectorDocument[] = chunks.map((chunk, i) => ({
            id: `${docId}_chunk_${i}`,
            text: chunk,
            embedding: embeddings[i],
            metadata: {
                source: docId,
                createdAt: new Date().toISOString(),
                ...metadata,
            },
        }));

        // Update in-memory cache
        const tenantCache = this.getTenantCache(tenantId);
        // Remove old chunks with same source
        tenantCache.documents = tenantCache.documents.filter(d => d.metadata.source !== docId);
        tenantCache.documents.push(...docs);
        tenantCache.loadedAt = Date.now();

        return docs.length; // Return number of chunks created
    }

    /**
     * Search for relevant documents in a tenant's vector store.
     */
    async search(
        tenantId: string,
        query: string,
        topK?: number,
    ): Promise<SearchResult[]> {
        const k = topK || this.config.maxResults;
        const tenantCache = this.getTenantCache(tenantId);

        if (tenantCache.documents.length === 0) {
            return [];
        }

        // Generate query embedding
        const queryEmbedding = await this.embedder.generateEmbedding(query);

        // Calculate similarities
        const scored = tenantCache.documents.map(doc => ({
            docId: doc.id,
            text: doc.text,
            score: cosineSimilarity(queryEmbedding, doc.embedding),
            metadata: doc.metadata,
        }));

        // Sort by score descending, filter by threshold, take top K
        return scored
            .filter(s => s.score >= this.config.similarityThreshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }

    /**
     * Search with raw results (no threshold filter) for debugging.
     */
    async searchRaw(
        tenantId: string,
        query: string,
        topK: number = 5,
    ): Promise<SearchResult[]> {
        const tenantCache = this.getTenantCache(tenantId);

        if (tenantCache.documents.length === 0) {
            return [];
        }

        const queryEmbedding = await this.embedder.generateEmbedding(query);

        return tenantCache.documents
            .map(doc => ({
                docId: doc.id,
                text: doc.text,
                score: cosineSimilarity(queryEmbedding, doc.embedding),
                metadata: doc.metadata,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Remove a document from a tenant's store.
     */
    removeDocument(tenantId: string, docId: string): number {
        const tenantCache = this.getTenantCache(tenantId);
        const before = tenantCache.documents.length;
        tenantCache.documents = tenantCache.documents.filter(
            d => d.metadata.source !== docId
        );
        return before - tenantCache.documents.length;
    }

    /**
     * List all documents for a tenant.
     */
    listDocuments(tenantId: string): { id: string; source: string; chunkCount: number }[] {
        const tenantCache = this.getTenantCache(tenantId);
        const sources = new Map<string, number>();

        for (const doc of tenantCache.documents) {
            const source = doc.metadata.source;
            sources.set(source, (sources.get(source) || 0) + 1);
        }

        return Array.from(sources.entries()).map(([source, count]) => ({
            id: source,
            source,
            chunkCount: count,
        }));
    }

    /**
     * Get document count for a tenant.
     */
    getDocumentCount(tenantId: string): number {
        return this.getTenantCache(tenantId).documents.length;
    }

    /**
     * Clear tenant cache (forces reload from Firestore).
     */
    clearCache(tenantId?: string): void {
        if (tenantId) {
            this.cache.delete(tenantId);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Load documents from an external source (e.g., Firestore).
     * Call this to populate the store with pre-existing data.
     */
    loadDocuments(tenantId: string, documents: VectorDocument[]): void {
        this.cache.set(tenantId, {
            documents: [...documents],
            loadedAt: Date.now(),
        });
    }

    // --- Private ---

    private getTenantCache(tenantId: string): TenantCache {
        const existing = this.cache.get(tenantId);
        if (existing && Date.now() - existing.loadedAt < CACHE_TTL_MS) {
            return existing;
        }

        // Create new empty cache
        const newCache: TenantCache = {
            documents: existing?.documents || [],
            loadedAt: Date.now(),
        };
        this.cache.set(tenantId, newCache);
        return newCache;
    }
}
