/**
 * Text Chunker — Split Documents into Overlapping Chunks
 *
 * Strategy:
 * - Target chunk size: ~512 tokens (~2048 chars)
 * - Overlap: 50 tokens (~200 chars) for context continuity
 * - Sentence-aware splitting (avoid breaking mid-sentence)
 * - Preserves semantic context with overlap
 */

// =============================================
// Types
// =============================================

export interface ChunkOptions {
    /** Target chunk size in characters (default: 2000) */
    maxChunkSize?: number;
    /** Overlap between chunks in characters (default: 200) */
    overlap?: number;
    /** Minimum chunk size — discard smaller chunks (default: 100) */
    minChunkSize?: number;
}

export interface TextChunk {
    /** Chunk index (0-based) */
    index: number;
    /** Chunk text content */
    content: string;
    /** Approximate start character position in original document */
    startPos: number;
    /** Approximate end character position */
    endPos: number;
    /** Approximate word count */
    wordCount: number;
}

// =============================================
// Constants
// =============================================

const DEFAULT_MAX_CHUNK_SIZE = 2000;  // ~500 tokens
const DEFAULT_OVERLAP = 200;          // ~50 tokens
const DEFAULT_MIN_CHUNK_SIZE = 100;  // Discard tiny chunks

// Sentence boundary patterns
const SENTENCE_ENDINGS = /[.!?。！？]\s+/;
const PARAGRAPH_BREAK = /\n\n+/;

// =============================================
// Chunker
// =============================================

/**
 * Split text into overlapping chunks with sentence-aware boundaries.
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
    const maxSize = options?.maxChunkSize || DEFAULT_MAX_CHUNK_SIZE;
    const overlap = options?.overlap || DEFAULT_OVERLAP;
    const minSize = options?.minChunkSize || DEFAULT_MIN_CHUNK_SIZE;

    if (text.length <= maxSize) {
        // Document fits in a single chunk
        return [{
            index: 0,
            content: text.trim(),
            startPos: 0,
            endPos: text.length,
            wordCount: countWords(text),
        }];
    }

    // Step 1: Split into paragraphs first
    const paragraphs = text.split(PARAGRAPH_BREAK).filter(p => p.trim().length > 0);

    // Step 2: Build chunks from paragraphs
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let chunkStartPos = 0;
    let globalPos = 0;

    for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();

        // If paragraph alone exceeds max size, split by sentences
        if (trimmed.length > maxSize) {
            // Flush current chunk first
            if (currentChunk.trim().length >= minSize) {
                chunks.push(createChunk(chunks.length, currentChunk.trim(), chunkStartPos));
            }

            // Split large paragraph by sentences
            const sentenceChunks = splitBySentences(trimmed, maxSize, overlap, minSize);
            for (const sc of sentenceChunks) {
                chunks.push(createChunk(
                    chunks.length,
                    sc.content,
                    globalPos + sc.startPos,
                ));
            }

            currentChunk = '';
            chunkStartPos = globalPos + trimmed.length;
        }
        // If adding paragraph would exceed max size, create a chunk
        else if (currentChunk.length + trimmed.length + 2 > maxSize) {
            // Save current chunk
            if (currentChunk.trim().length >= minSize) {
                chunks.push(createChunk(chunks.length, currentChunk.trim(), chunkStartPos));
            }

            // Start new chunk with overlap from previous
            const overlapText = getOverlapText(currentChunk, overlap);
            currentChunk = overlapText + (overlapText ? '\n\n' : '') + trimmed;
            chunkStartPos = globalPos - overlapText.length;
        }
        // Otherwise, append paragraph
        else {
            if (currentChunk) currentChunk += '\n\n';
            currentChunk += trimmed;
        }

        globalPos += trimmed.length + 2; // +2 for \n\n
    }

    // Flush remaining
    if (currentChunk.trim().length >= minSize) {
        chunks.push(createChunk(chunks.length, currentChunk.trim(), chunkStartPos));
    }

    return chunks;
}

// =============================================
// Helpers
// =============================================

function splitBySentences(
    text: string,
    maxSize: number,
    overlap: number,
    minSize: number,
): Array<{ content: string; startPos: number }> {
    const sentences = text.split(SENTENCE_ENDINGS).filter(s => s.trim());
    const result: Array<{ content: string; startPos: number }> = [];
    let current = '';
    let startPos = 0;
    let pos = 0;

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        // Add sentence ending back
        const withEnding = trimmed + '. ';

        if (current.length + withEnding.length > maxSize && current.length >= minSize) {
            result.push({ content: current.trim(), startPos });

            // Overlap
            const overlapText = getOverlapText(current, overlap);
            current = overlapText + ' ' + withEnding;
            startPos = pos - overlapText.length;
        } else {
            current += withEnding;
        }

        pos += withEnding.length;
    }

    if (current.trim().length >= minSize) {
        result.push({ content: current.trim(), startPos });
    }

    return result;
}

function getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text;

    // Get last 'overlapSize' characters, but start at a sentence/word boundary
    const tail = text.slice(-overlapSize);
    const sentenceStart = tail.indexOf('. ');
    if (sentenceStart > 0 && sentenceStart < overlapSize / 2) {
        return tail.slice(sentenceStart + 2);
    }

    // Fallback: start at word boundary
    const wordStart = tail.indexOf(' ');
    return wordStart > 0 ? tail.slice(wordStart + 1) : tail;
}

function createChunk(index: number, content: string, startPos: number): TextChunk {
    return {
        index,
        content,
        startPos: Math.max(0, startPos),
        endPos: startPos + content.length,
        wordCount: countWords(content),
    };
}

function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}
