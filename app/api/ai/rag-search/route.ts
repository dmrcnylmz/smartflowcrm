import { NextRequest, NextResponse } from 'next/server';
import { searchFAQ, generateAnswerWithRAG } from '@/lib/ai/rag';

export async function POST(request: NextRequest) {
  // Require tenant authentication
  const tenantId = request.headers.get('x-user-tenant');
  if (!tenantId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { query, category, generateAnswer = false, provider = 'local' } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    // Limit query length to prevent abuse
    const safeQuery = query.slice(0, 500);

    const results = await searchFAQ(safeQuery, category);

    if (generateAnswer && results.length > 0) {
      const answer = await generateAnswerWithRAG(safeQuery, provider);
      return NextResponse.json({
        results,
        answer,
      });
    }

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.warn('[RAG Search] Error:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

