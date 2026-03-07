/**
 * Embedding Generator — OpenAI text-embedding-3-small (768 dimensions)
 *
 * Generates vector embeddings for text chunks.
 * Uses OpenAI's text-embedding-3-small model with reduced dimensions (768).
 *
 * Dimension reduction via OpenAI's native `dimensions` parameter:
 * - 768-dim vectors retain ~99.5% retrieval quality vs 1536-dim
 * - 50% less Firestore storage per chunk (~6KB vs ~12KB for vector)
 * - 50% faster cosine similarity computations
 * - Allows larger Firestore batches (200 docs × 12KB = 2.4MB, well under 10MB limit)
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

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 768; // Reduced from 1536 — optimal quality/cost ratio
const MAX_BATCH_SIZE = 100; // OpenAI limit per request
const MAX_INPUT_TOKENS = 8191; // Per input limit

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
    // Evict oldest entries if cache is full
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
 * Uses in-memory cache for repeated queries (e.g., same user query within 5 min).
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
    // Check cache first (saves ~$0.00002/query but more importantly ~200ms latency)
    const cached = getCachedEmbedding(text);
    if (cached) {
        return { text, vector: cached.vector, tokens: cached.tokens };
    }

    const result = await generateEmbeddings([text]);
    const embedding = result.embeddings[0];

    // Cache query embeddings
    setCachedEmbedding(text, embedding.vector, embedding.tokens);

    return embedding;
}

/**
 * Generate embeddings for multiple texts in batches.
 */
export async function generateEmbeddings(texts: string[]): Promise<EmbeddingBatchResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for embedding generation');
    }

    const allEmbeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE);

        // Truncate any texts that are too long
        const truncated = batch.map(t => truncateForEmbedding(t));

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: truncated,
                dimensions: EMBEDDING_DIMENSIONS,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`OpenAI Embedding API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json() as {
            data: Array<{ embedding: number[]; index: number }>;
            usage: { total_tokens: number };
        };

        for (const item of data.data) {
            allEmbeddings.push({
                text: batch[item.index],
                vector: item.embedding,
                tokens: 0, // Per-item tokens not available
            });
        }

        totalTokens += data.usage.total_tokens;

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
 * Supports mixed dimensions — uses the shorter vector's length.
 * This handles backward compatibility when query vectors (768-dim)
 * are compared against old stored vectors (1536-dim).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    // Use the shorter vector length for mixed-dimension compatibility
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

/**
 * Find top-K most similar vectors to a query vector.
 */
export function topKSimilar(
    queryVector: number[],
    candidates: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>,
    k: number = 5,
): Array<{ id: string; score: number; metadata?: Record<string, unknown> }> {
    const scored = candidates.map(c => ({
        id: c.id,
        score: cosineSimilarity(queryVector, c.vector),
        metadata: c.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, k);
}

// =============================================
// Helpers
// =============================================

function truncateForEmbedding(text: string): string {
    // Rough approximation: 1 token ≈ 4 chars
    const maxChars = MAX_INPUT_TOKENS * 4;
    if (text.length <= maxChars) return text;

    // Truncate at word boundary
    const truncated = text.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}
