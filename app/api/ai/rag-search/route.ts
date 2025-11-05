import { NextRequest, NextResponse } from 'next/server';
import { searchFAQ, generateAnswerWithRAG } from '@/lib/ai/rag';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, category, generateAnswer = false, provider = 'local' } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    const results = await searchFAQ(query, category);

    if (generateAnswer && results.length > 0) {
      const answer = await generateAnswerWithRAG(query, provider);
      return NextResponse.json({
        results,
        answer,
      });
    }

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('RAG search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

