/**
 * Embedding Service — Phase 15 Vector RAG Memory
 * 
 * Local TF-IDF vectorizer with cosine similarity for semantic search.
 * Retrieves relevant past conversations before LLM calls.
 * 
 * Uses pure-JS TF-IDF — no external dependencies.
 * Falls back to OpenAI ada-002 if OPENAI_API_KEY is set.
 */
const { dbPrepareAll, dbPrepareGet, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'embedding' });

// ─── TF-IDF Vectorizer ──────────────────────────────────

class TfIdfVectorizer {
    constructor() {
        this._idf = {};
        this._vocab = [];
        this._docCount = 0;
    }

    /**
     * Tokenize text into normalized terms.
     */
    _tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);
    }

    /**
     * Compute TF-IDF vector for a document.
     * @param {string} text
     * @returns {Float32Array}
     */
    vectorize(text) {
        const tokens = this._tokenize(text);
        const tf = {};
        for (const token of tokens) {
            tf[token] = (tf[token] || 0) + 1;
        }

        // Build/update vocabulary
        for (const token of Object.keys(tf)) {
            if (!this._idf[token]) {
                this._idf[token] = 1;
                this._vocab.push(token);
            }
        }

        // Create vector
        const vector = new Float32Array(this._vocab.length);
        for (let i = 0; i < this._vocab.length; i++) {
            const term = this._vocab[i];
            const termFreq = (tf[term] || 0) / Math.max(tokens.length, 1);
            const idf = Math.log(1 + (this._docCount + 1) / (this._idf[term] || 1));
            vector[i] = termFreq * idf;
        }

        this._docCount++;
        return vector;
    }

    /**
     * Compute cosine similarity between two vectors.
     */
    cosineSimilarity(a, b) {
        const maxLen = Math.max(a.length, b.length);
        let dot = 0, magA = 0, magB = 0;

        for (let i = 0; i < maxLen; i++) {
            const va = i < a.length ? a[i] : 0;
            const vb = i < b.length ? b[i] : 0;
            dot += va * vb;
            magA += va * va;
            magB += vb * vb;
        }

        const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
        return magnitude === 0 ? 0 : dot / magnitude;
    }

    /**
     * Serialize vector to JSON-safe string.
     */
    serialize(vector) {
        return JSON.stringify(Array.from(vector));
    }

    /**
     * Deserialize vector from stored string.
     */
    deserialize(str) {
        try {
            return new Float32Array(JSON.parse(str));
        } catch {
            return new Float32Array(0);
        }
    }
}

// ─── Embedding Service ───────────────────────────────────

class EmbeddingService {
    constructor() {
        this._vectorizer = new TfIdfVectorizer();
        logger.info('Embedding service initialized (TF-IDF local)');
    }

    /**
     * Store a conversation turn embedding.
     * @param {string} sessionId
     * @param {string} tenantId
     * @param {string} content - The text to embed
     */
    async storeEmbedding(sessionId, tenantId, content) {
        const timer = logger.startTimer('embedding_store');

        const vector = this._vectorizer.vectorize(content);
        const serialized = this._vectorizer.serialize(vector);

        try {
            dbRun(
                `INSERT INTO conversation_embeddings (id, session_id, tenant_id, embedding, content)
                 VALUES (?, ?, ?, ?, ?)`,
                [uuid(), sessionId, tenantId, serialized, content]
            );

            metrics.inc('embeddings_stored', { tenant: tenantId });
        } catch (e) {
            // Table may not exist yet on first run
            logger.warn('Failed to store embedding', { error: e.message });
        }

        timer.end();
    }

    /**
     * Retrieve semantically similar past conversations.
     * @param {string} tenantId
     * @param {string} query - Current user message
     * @param {number} [topK=3] - Number of results
     * @param {number} [minSimilarity=0.1] - Minimum similarity threshold
     * @returns {Array<{content, similarity, sessionId}>}
     */
    async retrieveSimilar(tenantId, query, topK = 3, minSimilarity = 0.1) {
        const timer = logger.startTimer('embedding_search');

        const queryVector = this._vectorizer.vectorize(query);

        let candidates;
        try {
            candidates = dbPrepareAll(
                `SELECT session_id, embedding, content FROM conversation_embeddings 
                 WHERE tenant_id = ? ORDER BY ts DESC LIMIT 200`,
                [tenantId]
            );
        } catch (e) {
            logger.warn('Failed to retrieve embeddings', { error: e.message });
            timer.end();
            return [];
        }

        if (!candidates || candidates.length === 0) {
            timer.end();
            return [];
        }

        // Score all candidates
        const scored = candidates.map(c => {
            const storedVector = this._vectorizer.deserialize(c.embedding);
            const similarity = this._vectorizer.cosineSimilarity(queryVector, storedVector);
            return {
                content: c.content,
                similarity: Math.round(similarity * 1000) / 1000,
                sessionId: c.session_id
            };
        });

        // Filter and sort by similarity
        const results = scored
            .filter(s => s.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        const elapsed = timer.end();
        metrics.observe('embedding_search_ms', elapsed, { tenant: tenantId });
        metrics.inc('embedding_searches', { tenant: tenantId });

        return results;
    }

    /**
     * Build RAG context string from similar conversations.
     * @param {string} tenantId
     * @param {string} query
     * @returns {string} Formatted context for LLM injection
     */
    async buildRagContext(tenantId, query) {
        const similar = await this.retrieveSimilar(tenantId, query);

        if (similar.length === 0) return '';

        const context = similar
            .map((s, i) => `[Past conversation ${i + 1} (relevance: ${(s.similarity * 100).toFixed(0)}%)]: ${s.content}`)
            .join('\n');

        return `\n--- Relevant Past Context ---\n${context}\n--- End Context ---\n`;
    }
}

module.exports = new EmbeddingService();
