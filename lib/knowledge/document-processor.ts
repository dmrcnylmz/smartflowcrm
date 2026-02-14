/**
 * Document Processor — Parse Various Document Formats
 *
 * Supported formats:
 * - Plain text (.txt, .md)
 * - URL (web pages — extracted via fetch + HTML-to-text)
 * - PDF (via pdf-parse, optional)
 *
 * Each processed doc returns a normalized text string for chunking.
 */

// =============================================
// Types
// =============================================

export interface DocumentSource {
    type: 'text' | 'url' | 'pdf' | 'file';
    content: string; // raw text, URL, or base64 for files
    filename?: string;
    mimeType?: string;
}

export interface ProcessedDocument {
    title: string;
    content: string;
    metadata: {
        source: string;
        type: DocumentSource['type'];
        wordCount: number;
        charCount: number;
        processedAt: string;
    };
}

// =============================================
// Processor
// =============================================

/**
 * Process a document source into normalized text.
 */
export async function processDocument(source: DocumentSource): Promise<ProcessedDocument> {
    switch (source.type) {
        case 'text':
            return processText(source);
        case 'url':
            return processUrl(source);
        case 'pdf':
            return processPdf(source);
        case 'file':
            return processFile(source);
        default:
            throw new Error(`Unsupported document type: ${source.type}`);
    }
}

// --- Text ---

function processText(source: DocumentSource): ProcessedDocument {
    const content = source.content.trim();
    return {
        title: source.filename || extractTitle(content) || 'Metin Belgesi',
        content,
        metadata: {
            source: source.filename || 'direct-input',
            type: 'text',
            wordCount: countWords(content),
            charCount: content.length,
            processedAt: new Date().toISOString(),
        },
    };
}

// --- URL ---

async function processUrl(source: DocumentSource): Promise<ProcessedDocument> {
    const url = source.content.trim();

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SmartFlow-KB-Bot/1.0',
                'Accept': 'text/html,application/xhtml+xml,text/plain',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const content = htmlToText(html);

        return {
            title: extractHtmlTitle(html) || new URL(url).hostname,
            content,
            metadata: {
                source: url,
                type: 'url',
                wordCount: countWords(content),
                charCount: content.length,
                processedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        throw new Error(`URL fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// --- PDF ---

async function processPdf(source: DocumentSource): Promise<ProcessedDocument> {
    // Base64 decode → parse with pdf-parse
    try {
        const buffer = Buffer.from(source.content, 'base64');

        // Dynamic import for pdf-parse (optional dependency)
        let pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }>;
        try {
            // @ts-ignore — pdf-parse is an optional dependency
            pdfParse = (await import('pdf-parse')).default;
        } catch {
            // Fallback: just try to extract text from buffer
            const text = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F\u0400-\u04FF]/g, ' ');
            return {
                title: source.filename || 'PDF Belgesi',
                content: text.trim(),
                metadata: {
                    source: source.filename || 'pdf-upload',
                    type: 'pdf',
                    wordCount: countWords(text),
                    charCount: text.length,
                    processedAt: new Date().toISOString(),
                },
            };
        }

        const result = await pdfParse(buffer);
        const content = result.text.trim();

        return {
            title: source.filename || 'PDF Belgesi',
            content,
            metadata: {
                source: source.filename || 'pdf-upload',
                type: 'pdf',
                wordCount: countWords(content),
                charCount: content.length,
                processedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        throw new Error(`PDF processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// --- Generic File ---

async function processFile(source: DocumentSource): Promise<ProcessedDocument> {
    // Treat as text for now
    return processText(source);
}

// =============================================
// Helpers
// =============================================

function extractTitle(text: string): string {
    // First non-empty line as title
    const firstLine = text.split('\n').find(line => line.trim().length > 0);
    if (firstLine && firstLine.length < 200) return firstLine.trim();
    return '';
}

function extractHtmlTitle(html: string): string {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return match ? match[1].trim() : '';
}

function htmlToText(html: string): string {
    // Remove script and style tags
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

    // Convert block elements to newlines
    text = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));

    // Clean up whitespace
    text = text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
}

function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}
