// RAG (Retrieval-Augmented Generation) for FAQ system
import { getDocuments } from '../firebase/db';

export interface RAGResult {
  answer: string;
  sources: Array<{ title: string; content: string; score: number }>;
}

// Simple keyword-based document search
export async function searchDocuments(query: string, limit: number = 3) {
  try {
    const docs = await getDocuments();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    // Score each document based on keyword matches
    const scored = docs.map((doc: { id?: string; title?: string; content?: string; category?: string }) => {
      const content = (doc.content || '').toLowerCase();
      const title = (doc.title || '').toLowerCase();
      
      let score = 0;
      queryWords.forEach((word) => {
        if (title.includes(word)) score += 3;
        if (content.includes(word)) score += 1;
      });

      return { ...doc, score } as typeof doc & { score: number };
    });

    // Sort by score and return top N
    return scored
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.error('Document search error:', error);
    return [];
  }
}

// Alias functions for compatibility
export async function searchFAQ(query: string, category?: string) {
  return searchDocuments(query, 3);
}

export async function generateAnswerWithRAG(query: string, provider: string = 'local'): Promise<RAGResult> {
  return generateAnswer(query);
}

// Generate answer from documents
export async function generateAnswer(query: string): Promise<RAGResult> {
  try {
    const relevantDocs = await searchDocuments(query, 3);

    if (relevantDocs.length === 0) {
      return {
        answer: 'Üzgünüm, bu konu hakkında bilgi bulunamadı. Lütfen daha spesifik bir soru sorun veya destek ekibiyle iletişime geçin.',
        sources: [],
      };
    }

    // For now, return the most relevant document's content
    const topDoc = relevantDocs[0];
    return {
      answer: topDoc.content || '',
      sources: relevantDocs.map((doc) => ({
        title: doc.title || '',
        content: (doc.content || '').substring(0, 200) + '...',
        score: doc.score,
      })),
    };
  } catch (error) {
    console.error('RAG answer generation error:', error);
    return {
      answer: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
      sources: [],
    };
  }
}

