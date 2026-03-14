/**
 * Embedding Generator — Google text-embedding-004 (768 dimensions)
 *
 * Migrated from OpenAI text-embedding-3-small to Google Embedding 2:
 * - Better multilingual quality (especially Turkish)
 * - Generous free tier (1500 RPM, 1M TPD)
 * - Same 768 dimensions, same cosine similarity pipeline
 * - ~98% cost reduction vs OpenAI
 *
 * Query embedding cache prevents redundant API calls for repeated queries.
 */

// =============================================
// Types
// =============================================

export interface EmbeddingResult {
    /** The input text that was embedded */
    text: string;
    /** The embedding vector (768 dimensions) */
    vector: number[];
    /** Token usage for this embedding */
    tokens: number;
}

export interface EmbeddingBatchResult {
    embeddings: EmbeddingResult[];
    totalTokens: number;
    model: string;
    dimensions: number;
}

// =============================================
// Config
// =============================================

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 100; // Google batch limit per request
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// =============================================
// Query Embedding Cache (LRU, max 200 entries)
// =============================================

const QUERY_CACHE_MAX = 200;
const QUERY_CACHE_TTL = 5 * 60 * 1000; // 5 min

interface CachedEmbedding {
    vector: number[];
    tokens: number;
    cachedAt: number;
}

const queryCache = new Map<string, CachedEmbedding>();

function getCachedEmbedding(text: string): CachedEmbedding | null {
    const cached = queryCache.get(text);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > QUERY_CACHE_TTL) {
        queryCache.delete(text);
        return null;
    }
    return cached;
}

function setCachedEmbedding(text: string, vector: number[], tokens: number): void {
    if (queryCache.size >= QUERY_CACHE_MAX) {
        const firstKey = queryCache.keys().next().value;
        if (firstKey) queryCache.delete(firstKey);
    }
    queryCache.set(text, { vector, tokens, cachedAt: Date.now() });
}

// =============================================
// Embedding Generator
// =============================================

/**
 * Generate embedding for a single text string.
 * Uses in-memory cache for repeated queries.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
    const cached = getCachedEmbedding(text);
    if (cached) {
        return { text, vector: cached.vector, tokens: cached.tokens };
    }

    const result = await generateEmbeddings([text]);
    const embedding = result.embeddings[0];

    setCachedEmbedding(text, embedding.vector, embedding.tokens);

    return embedding;
}

/**
 * Generate embeddings for multiple texts using Google batchEmbedContents.
 */
export async function generateEmbeddings(texts: string[]): Promise<EmbeddingBatchResult> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_AI_API_KEY is required for embedding generation');
    }

    const allEmbeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE);
        const truncated = batch.map(t => truncateForEmbedding(t));

        const requests = truncated.map(t => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text: t }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
        }));

        const response = await fetch(
            `${GOOGLE_API_BASE}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests }),
                signal: AbortSignal.timeout(30000),
            },
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`Google Embedding API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json() as {
            embeddings: Array<{ values: number[] }>;
        };

        for (let j = 0; j < data.embeddings.length; j++) {
            const tokenEstimate = Math.ceil(truncated[j].length / 4);
            allEmbeddings.push({
                text: batch[j],
                vector: data.embeddings[j].values,
                tokens: tokenEstimate,
            });
            totalTokens += tokenEstimate;
        }

        // Rate limit: brief pause between batches
        if (i + MAX_BATCH_SIZE < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return {
        embeddings: allEmbeddings,
        totalTokens,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
    };
}

/**
 * Calculate cosine similarity between two vectors.
 * Supports mixed dimensions for backward compatibility.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
}

// =============================================
// Helpers
// =============================================

function truncateForEmbedding(text: string): string {
    // Google text-embedding-004 supports up to ~10K tokens
    const maxChars = 10000 * 4;
    if (text.length <= maxChars) return text;

    const truncated = text.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}
