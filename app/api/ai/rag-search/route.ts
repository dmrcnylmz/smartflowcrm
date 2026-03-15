import { NextRequest, NextResponse } from 'next/server';
import { searchFAQ, generateAnswerWithRAG } from '@/lib/ai/rag';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError } from '@/lib/utils/error-handler';

export async function POST(request: NextRequest) {
  // Require strict JWT authentication (Firebase Admin SDK)
  const auth = await requireStrictAuth(request);
  if (auth.error) return auth.error;
  const tenantId = auth.tenantId;

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
    return handleApiError(error, 'RAG Search');
  }
}

