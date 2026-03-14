/**
 * Vector Embeddings — Google text-embedding-004
 *
 * Thin wrapper over knowledge/embeddings for backward compatibility.
 * Used by VectorStore and RAG modules.
 *
 * Re-exports cosineSimilarity from the canonical source.
 */

export { cosineSimilarity } from '@/lib/knowledge/embeddings';
import { generateEmbedding, generateEmbeddings as batchEmbed } from '@/lib/knowledge/embeddings';

// --- Types ---

export interface EmbeddingConfig {
    apiKey?: string; // Kept for interface compat, uses GOOGLE_AI_API_KEY env
    model?: string;
    dimensions?: number;
}

// --- EmbeddingGenerator class (used by VectorStore) ---

export class EmbeddingGenerator {
    constructor(_config?: EmbeddingConfig) {
        // Config is ignored — uses GOOGLE_AI_API_KEY from env
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const cleaned = text.replace(/\n/g, ' ').trim();
        if (!cleaned) return new Array(768).fill(0);
        const result = await generateEmbedding(cleaned);
        return result.vector;
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        const cleaned = texts.map(t => t.replace(/\n/g, ' ').trim());
        const result = await batchEmbed(cleaned);
        return result.embeddings.map(e => e.vector);
    }
}

// --- Text Chunking (delegates to knowledge/chunker) ---

import { chunkText as adaptiveChunk } from '@/lib/knowledge/chunker';

/**
 * Split text into chunks. Uses adaptive content-type aware chunking.
 */
export function chunkText(text: string, maxChunkChars: number = 800): string[] {
    const chunks = adaptiveChunk(text, { maxChunkSize: maxChunkChars });
    return chunks.map(c => c.content);
}
