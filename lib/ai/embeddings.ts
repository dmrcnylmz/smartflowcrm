/**
 * Vector Embeddings
 *
 * OpenAI text-embedding-3-small for document and query embedding.
 * Cosine similarity for vector search.
 */

import OpenAI from 'openai';

// --- Types ---

export interface EmbeddingConfig {
    apiKey: string;
    model?: string;
    dimensions?: number;
}

// --- Constants ---

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

// --- Embedding Generator ---

export class EmbeddingGenerator {
    private client: OpenAI;
    private model: string;
    private dimensions: number;

    constructor(config: EmbeddingConfig) {
        this.client = new OpenAI({ apiKey: config.apiKey });
        this.model = config.model || DEFAULT_MODEL;
        this.dimensions = config.dimensions || DEFAULT_DIMENSIONS;
    }

    /**
     * Generate embedding for a single text.
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const cleaned = text.replace(/\n/g, ' ').trim();
        if (!cleaned) return new Array(this.dimensions).fill(0);

        const response = await this.client.embeddings.create({
            model: this.model,
            input: cleaned,
            dimensions: this.dimensions,
        });

        return response.data[0].embedding;
    }

    /**
     * Generate embeddings for multiple texts (batch).
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        const cleaned = texts.map(t => t.replace(/\n/g, ' ').trim());

        const response = await this.client.embeddings.create({
            model: this.model,
            input: cleaned,
            dimensions: this.dimensions,
        });

        // Sort by index to maintain order
        return response.data
            .sort((a, b) => a.index - b.index)
            .map(d => d.embedding);
    }
}

// --- Cosine Similarity ---

/**
 * Calculate cosine similarity between two vectors.
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal).
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

// --- Text Chunking ---

/**
 * Split text into chunks of 100-300 tokens (~400-1200 chars).
 * Preserves sentence boundaries.
 */
export function chunkText(text: string, maxChunkChars: number = 800): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
