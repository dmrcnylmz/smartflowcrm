/**
 * RAG Pipeline
 * Retrieves relevant documents and augments LLM context.
 */

import { VectorStore, type SearchResult } from './vector-store';
import { logger } from '@/lib/utils/logger';
import { queryKnowledgeBase, type RetrievalResult } from '@/lib/knowledge/pipeline';
import { generateWithFallback } from '@/lib/ai/llm-fallback-chain';

export interface RAGConfig {
  topK?: number;
  minSimilarity?: number;
  maxTokens?: number;
}

export interface RAGResult {
  context: string;
  sources: SearchResult[];
  tokensUsed: number;
}

const DEFAULT_CONFIG: RAGConfig = {
  topK: 3,
  minSimilarity: 0.3,
  maxTokens: 600, // Optimized: ~2400 chars, minimal LLM input for fast voice responses
};

/**
 * Retrieve relevant context for a query.
 */
export async function retrieveContext(
  query: string,
  vectorStore: VectorStore,
  _embedder: unknown,
  config: RAGConfig = {},
  tenantId: string = 'default'
): Promise<RAGResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Search vector store (VectorStore handles embedding internally)
    const results = await vectorStore.search(
      tenantId,
      query,
      mergedConfig.topK!
    );

    if (results.length === 0) {
      return { context: '', sources: [], tokensUsed: 0 };
    }

    // Build context from results
    const contextParts: string[] = [];
    let totalTokens = 0;
    const usedSources: SearchResult[] = [];

    for (const result of results) {
      const tokenEstimate = Math.ceil(result.text.length / 4);
      if (totalTokens + tokenEstimate > mergedConfig.maxTokens!) break;

      contextParts.push(result.text);
      totalTokens += tokenEstimate;
      usedSources.push(result);
    }

    return {
      context: contextParts.join('\n\n---\n\n'),
      sources: usedSources,
      tokensUsed: totalTokens,
    };
  } catch (error) {
    console.error('[RAG] Context retrieval failed:', error);
    return { context: '', sources: [], tokensUsed: 0 };
  }
}

/**
 * Build an augmented prompt with RAG context.
 */
export function buildAugmentedPrompt(
  userMessage: string,
  ragContext: string,
  systemPrompt?: string
): string {
  if (!ragContext) {
    return userMessage;
  }

  const contextSection = `
--- KURUMSAL BİLGİ ---
${ragContext}
--- BİLGİ SONU ---

Yukarıdaki bilgileri kullanarak müşterinin sorusunu kısa ve öz yanıtla. Bilgi dışında kalan konularda "Bu konuda bilgim yok" de.`;

  return `${systemPrompt ? systemPrompt + '\n\n' : ''}${contextSection}\n\nMüşteri: ${userMessage}`;
}

/**
 * Search FAQ / Knowledge Base entries.
 * Uses the knowledge pipeline's hybrid search (semantic + keyword).
 * Falls back gracefully when the knowledge pipeline is unavailable.
 */
export async function searchFAQ(
  query: string,
  category?: string,
  tenantId: string = 'default',
  topK: number = 5,
): Promise<{ question: string; answer: string; score: number; category?: string }[]> {
  try {
    logger.debug(`[RAG] Searching FAQ for: "${query}"${category ? ` in category: ${category}` : ''} (tenant: ${tenantId})`);

    // Use knowledge pipeline hybrid search (semantic + keyword)
    const results: RetrievalResult[] = await queryKnowledgeBase(
      tenantId,
      category ? `[${category}] ${query}` : query,
      topK,
      0.25,
    );

    if (results.length === 0) {
      logger.debug(`[RAG] No FAQ results found for: "${query}"`);
      return [];
    }

    // Map retrieval results to FAQ format
    // The content field contains the chunk text; use query as the "question"
    // and the retrieved chunk content as the "answer"
    return results.map((result) => ({
      question: query,
      answer: result.content,
      score: result.score,
      category: category || (result.metadata?.category as string | undefined),
    }));
  } catch (error) {
    // Graceful fallback — log and return empty instead of crashing
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`[RAG] FAQ search failed (falling back to empty): ${errorMsg}`);
    return [];
  }
}

/**
 * Generate an answer using RAG pipeline.
 * Combines document retrieval with LLM generation via the fallback chain.
 *
 * Steps:
 * 1. Retrieve relevant documents from the knowledge base (hybrid search)
 * 2. Build an augmented prompt with source context injected
 * 3. Call LLM via the fallback chain (Groq -> Gemini -> OpenAI)
 * 4. Return the generated answer with source citations
 */
export async function generateAnswerWithRAG(
  query: string,
  provider: string = 'local',
  tenantId: string = 'default',
  options: { maxChunks?: number; maxTokens?: number; temperature?: number; language?: 'tr' | 'en' | 'de' | 'fr' } = {},
): Promise<string> {
  const {
    maxChunks = 3,
    maxTokens = 500,
    temperature = 0.3,
    language = 'tr',
  } = options;

  try {
    logger.debug(`[RAG] Generating answer for: "${query}" using provider: ${provider} (tenant: ${tenantId})`);

    // 1. Retrieve relevant documents from the knowledge base
    const results = await queryKnowledgeBase(tenantId, query, maxChunks + 2, 0.25);

    // If no relevant documents found, return a helpful fallback message
    if (results.length === 0) {
      logger.debug(`[RAG] No context found for: "${query}"`);
      return language === 'en'
        ? 'No relevant information was found in the knowledge base for this question. Please contact a customer representative for assistance.'
        : 'Bu soru hakkında bilgi bankasında yeterli veri bulunamadı. Lütfen bir müşteri temsilcisiyle iletişime geçin.';
    }

    // 2. Select chunks that fit within token budget (~600 tokens = ~2400 chars)
    const selectedResults: RetrievalResult[] = [];
    let totalLength = 0;
    const maxContextLength = 2400;

    for (const result of results) {
      if (selectedResults.length >= maxChunks) break;
      if (totalLength + result.content.length > maxContextLength) {
        const remaining = maxContextLength - totalLength;
        if (remaining > 200) {
          selectedResults.push({
            ...result,
            content: result.content.slice(0, remaining) + '...',
          });
        }
        break;
      }
      selectedResults.push(result);
      totalLength += result.content.length;
    }

    if (selectedResults.length === 0) {
      return language === 'en'
        ? 'No relevant information was found in the knowledge base for this question. Please contact a customer representative for assistance.'
        : 'Bu soru hakkında bilgi bankasında yeterli veri bulunamadı. Lütfen bir müşteri temsilcisiyle iletişime geçin.';
    }

    // 3. Build the context string with source citations
    const contextParts = selectedResults.map(
      (r, i) => `[Kaynak ${i + 1}] (Güven: ${(r.score * 100).toFixed(0)}%)\n${r.content}`
    );
    const contextStr = contextParts.join('\n\n---\n\n');

    // 4. Build the augmented prompt as chat messages
    const isEnglish = language === 'en';

    const systemPrompt = isEnglish
      ? `You are a helpful customer support assistant. Answer the customer's question using ONLY the information provided in the knowledge base context below. If the context does not contain enough information to fully answer the question, say so honestly. Always cite the source numbers [Source 1], [Source 2], etc. when using information from the context. Be concise and accurate.`
      : `Sen yardımsever bir müşteri destek asistanısın. Müşterinin sorusunu YALNIZCA aşağıdaki bilgi bankası bağlamında verilen bilgileri kullanarak yanıtla. Bağlam soruyu tam olarak yanıtlamak için yeterli bilgi içermiyorsa, bunu dürüstçe belirt. Bağlamdaki bilgileri kullanırken her zaman kaynak numaralarını [Kaynak 1], [Kaynak 2] vb. olarak belirt. Kısa ve doğru yanıt ver.`;

    const userPrompt = isEnglish
      ? `Knowledge Base Context:\n---\n${contextStr}\n---\n\nCustomer Question: ${query}`
      : `Bilgi Bankası Bağlamı:\n---\n${contextStr}\n---\n\nMüşteri Sorusu: ${query}`;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // 5. Generate answer via LLM fallback chain
    const llmResult = await generateWithFallback(messages, {
      maxTokens,
      temperature,
      language,
    });

    logger.debug(`[RAG] Answer generated via ${llmResult.source} (${selectedResults.length} sources used)`);

    // 6. Append source summary to the answer
    const sourcesSummary = selectedResults
      .map((r, i) => `[Kaynak ${i + 1}]: Güven ${(r.score * 100).toFixed(0)}% (Döküman: ${r.documentId})`)
      .join('\n');

    return `${llmResult.text}\n\n---\nKaynaklar:\n${sourcesSummary}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`[RAG] Answer generation failed: ${errorMsg}`);
    return language === 'en'
      ? 'An error occurred while generating the answer. Please try again or contact a customer representative.'
      : 'Yanıt oluşturulurken bir hata oluştu. Lütfen tekrar deneyin veya bir müşteri temsilcisiyle iletişime geçin.';
  }
}
