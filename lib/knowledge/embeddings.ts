/**
 * Embedding Generator — OpenAI text-embedding-3-small
 *
 * Generates vector embeddings for text chunks.
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions).
 * Supports batch embedding with rate limiting.
 */

// =============================================
// Types
// =============================================

export interface EmbeddingResult {
    /** The input text that was embedded */
    text: string;
    /** The embedding vector (1536 dimensions for text-embedding-3-small) */
    vector: number[];
    /** Token usage for this embedding */
    tokens: number;
}

export interface EmbeddingBatchResult {
    embeddings: EmbeddingResult[];
    totalTokens: number;
    model: string;
}

// =============================================
// Config
// =============================================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_BATCH_SIZE = 100; // OpenAI limit per request
const MAX_INPUT_TOKENS = 8191; // Per input limit

// =============================================
// Embedding Generator
// =============================================

/**
 * Generate embeddings for a single text string.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
    const result = await generateEmbeddings([text]);
    return result.embeddings[0];
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
    };
}

/**
 * Calculate cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
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
