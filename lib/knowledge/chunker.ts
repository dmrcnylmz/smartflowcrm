/**
 * Text Chunker — Content-Type Aware Document Splitting
 *
 * Strategy varies by content type:
 * - FAQ/Q&A:  Keep Q&A pairs intact, no splitting within a pair
 * - Policy:   Smaller chunks (1200 chars) for precise retrieval
 * - Manual:   Medium chunks (1600 chars) for step-by-step context
 * - General:  Standard chunks (1400 chars) with sentence-aware overlap
 *
 * Optimized for customer service voice AI:
 * - Shorter chunks = more precise retrieval = fewer tokens to LLM
 * - Overlap preserves context continuity
 * - FAQ detection prevents splitting Q&A pairs
 */

// =============================================
// Types
// =============================================

export type ContentType = 'faq' | 'policy' | 'manual' | 'general';

export interface ChunkOptions {
    /** Target chunk size in characters (auto-detected if not set) */
    maxChunkSize?: number;
    /** Overlap between chunks in characters (default: 150) */
    overlap?: number;
    /** Minimum chunk size — discard smaller chunks (default: 80) */
    minChunkSize?: number;
    /** Force a specific content type (auto-detected if not set) */
    contentType?: ContentType;
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
    /** Detected content type */
    contentType: ContentType;
}

// =============================================
// Content-Type Profiles
// =============================================

interface ChunkProfile {
    maxChunkSize: number;
    overlap: number;
    minChunkSize: number;
}

const CHUNK_PROFILES: Record<ContentType, ChunkProfile> = {
    faq: { maxChunkSize: 800, overlap: 0, minChunkSize: 40 },       // Q&A pairs: keep intact, no overlap
    policy: { maxChunkSize: 1200, overlap: 120, minChunkSize: 80 },  // Precise: small chunks for exact answers
    manual: { maxChunkSize: 1600, overlap: 150, minChunkSize: 100 }, // Steps: medium chunks for context
    general: { maxChunkSize: 1400, overlap: 140, minChunkSize: 80 }, // Default: balanced
};

// Sentence boundary patterns
const SENTENCE_ENDINGS = /[.!?。！？]\s+/;
const PARAGRAPH_BREAK = /\n\n+/;

// FAQ detection patterns (Turkish + English)
const FAQ_PATTERNS = [
    /^(?:S|Q|Soru|Question)\s*[:：\d]/im,
    /^(?:C|A|Cevap|Answer)\s*[:：\d]/im,
    /\?\s*\n/,                    // Question mark followed by newline
    /^[-•]\s*.+\?\s*$/m,          // Bullet point ending with ?
    /^#+\s*.+\?/m,                // Markdown heading with ?
    /sss|faq|sıkça sorulan/i,     // FAQ keywords
];

// Policy detection patterns
const POLICY_PATTERNS = [
    /politika|policy|şartlar|terms|koşullar|conditions/i,
    /madde\s*\d|article\s*\d/i,
    /yönetmelik|regulation|prosedür|procedure/i,
    /hüküm|clause|kural|rule/i,
    /iade|refund|iptal|cancel/i,
];

// Manual/instruction detection patterns
const MANUAL_PATTERNS = [
    /adım\s*\d|step\s*\d/i,
    /nasıl|how\s+to/i,
    /kurulum|installation|ayarla|setup|configure/i,
    /talimat|instruction|kılavuz|guide|rehber/i,
    /önce.*sonra|first.*then/i,
];

// =============================================
// Content Type Detection
// =============================================

/**
 * Detect content type from text for optimal chunking strategy.
 */
export function detectContentType(text: string): ContentType {
    const sampleText = text.slice(0, 3000); // Analyze first 3000 chars

    // Count pattern matches
    const faqScore = FAQ_PATTERNS.filter(p => p.test(sampleText)).length;
    const policyScore = POLICY_PATTERNS.filter(p => p.test(sampleText)).length;
    const manualScore = MANUAL_PATTERNS.filter(p => p.test(sampleText)).length;

    // Check for Q&A structure: lines ending with ? followed by answer text
    const questionLines = (sampleText.match(/\?\s*\n/g) || []).length;
    const adjustedFaqScore = faqScore + (questionLines >= 3 ? 2 : 0);

    if (adjustedFaqScore >= 2) return 'faq';
    if (policyScore >= 2) return 'policy';
    if (manualScore >= 2) return 'manual';

    return 'general';
}

// =============================================
// Main Chunker
// =============================================

/**
 * Split text into overlapping chunks with content-type aware boundaries.
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
    const contentType = options?.contentType || detectContentType(text);
    const profile = CHUNK_PROFILES[contentType];

    const maxSize = options?.maxChunkSize || profile.maxChunkSize;
    const overlap = options?.overlap ?? profile.overlap;
    const minSize = options?.minChunkSize || profile.minChunkSize;

    // FAQ content: use specialized Q&A chunker
    if (contentType === 'faq') {
        return chunkFAQ(text, maxSize, minSize, contentType);
    }

    // Single chunk if content is small enough
    if (text.length <= maxSize) {
        return [{
            index: 0,
            content: text.trim(),
            startPos: 0,
            endPos: text.length,
            wordCount: countWords(text),
            contentType,
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
                chunks.push(createChunk(chunks.length, currentChunk.trim(), chunkStartPos, contentType));
            }

            // Split large paragraph by sentences
            const sentenceChunks = splitBySentences(trimmed, maxSize, overlap, minSize);
            for (const sc of sentenceChunks) {
                chunks.push(createChunk(
                    chunks.length,
                    sc.content,
                    globalPos + sc.startPos,
                    contentType,
                ));
            }

            currentChunk = '';
            chunkStartPos = globalPos + trimmed.length;
        }
        // If adding paragraph would exceed max size, create a chunk
        else if (currentChunk.length + trimmed.length + 2 > maxSize) {
            // Save current chunk
            if (currentChunk.trim().length >= minSize) {
                chunks.push(createChunk(chunks.length, currentChunk.trim(), chunkStartPos, contentType));
            }

            // Start new chunk with overlap from previous
            const overlapText = overlap > 0 ? getOverlapText(currentChunk, overlap) : '';
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
        chunks.push(createChunk(chunks.length, currentChunk.trim(), chunkStartPos, contentType));
    }

    return chunks;
}

// =============================================
// FAQ-Specific Chunker
// =============================================

/**
 * Split FAQ content by Q&A pairs, keeping each pair as a single chunk.
 * Merges small adjacent pairs if they fit within maxSize.
 */
function chunkFAQ(text: string, maxSize: number, minSize: number, contentType: ContentType): TextChunk[] {
    const chunks: TextChunk[] = [];

    // Split by common Q&A separators
    const pairs = text.split(/(?=^(?:S|Q|Soru|Question)\s*[:：\d]|^(?:[-•]\s*.+\?\s*$)|^(?:#+\s*.+\?))/im)
        .filter(p => p.trim().length >= minSize);

    if (pairs.length <= 1) {
        // Fallback: split by double newlines before question marks
        const fallbackPairs = text.split(/\n\n+(?=.*\?\s*\n)/);
        if (fallbackPairs.length > 1) {
            let currentChunk = '';
            let pos = 0;

            for (const pair of fallbackPairs) {
                const trimmed = pair.trim();
                if (!trimmed) continue;

                if (currentChunk.length + trimmed.length + 2 > maxSize && currentChunk.length >= minSize) {
                    chunks.push(createChunk(chunks.length, currentChunk.trim(), pos - currentChunk.length, contentType));
                    currentChunk = '';
                }

                if (currentChunk) currentChunk += '\n\n';
                currentChunk += trimmed;
                pos += trimmed.length + 2;
            }

            if (currentChunk.trim().length >= minSize) {
                chunks.push(createChunk(chunks.length, currentChunk.trim(), pos - currentChunk.length, contentType));
            }

            if (chunks.length > 0) return chunks;
        }

        // Ultimate fallback: use general chunking
        if (text.trim().length >= minSize) {
            return [{
                index: 0,
                content: text.trim(),
                startPos: 0,
                endPos: text.length,
                wordCount: countWords(text),
                contentType,
            }];
        }
        return [];
    }

    // Merge small pairs into larger chunks
    let currentChunk = '';
    let pos = 0;

    for (const pair of pairs) {
        const trimmed = pair.trim();
        if (!trimmed) continue;

        // If pair alone exceeds maxSize, add it as-is (truncated if needed)
        if (trimmed.length > maxSize) {
            if (currentChunk.trim().length >= minSize) {
                chunks.push(createChunk(chunks.length, currentChunk.trim(), pos - currentChunk.length, contentType));
                currentChunk = '';
            }
            chunks.push(createChunk(chunks.length, trimmed.slice(0, maxSize), pos, contentType));
            pos += trimmed.length;
            continue;
        }

        // Merge small pairs together
        if (currentChunk.length + trimmed.length + 2 > maxSize && currentChunk.length >= minSize) {
            chunks.push(createChunk(chunks.length, currentChunk.trim(), pos - currentChunk.length, contentType));
            currentChunk = '';
        }

        if (currentChunk) currentChunk += '\n\n';
        currentChunk += trimmed;
        pos += trimmed.length + 2;
    }

    if (currentChunk.trim().length >= minSize) {
        chunks.push(createChunk(chunks.length, currentChunk.trim(), pos - currentChunk.length, contentType));
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
            const overlapText = overlap > 0 ? getOverlapText(current, overlap) : '';
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

function createChunk(index: number, content: string, startPos: number, contentType: ContentType): TextChunk {
    return {
        index,
        content,
        startPos: Math.max(0, startPos),
        endPos: startPos + content.length,
        wordCount: countWords(content),
        contentType,
    };
}

function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}
