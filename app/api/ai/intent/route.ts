import { NextRequest, NextResponse } from 'next/server';
import { routeIntent } from '@/lib/ai/router';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, useLLM = false, provider = 'local' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid text parameter' },
        { status: 400 }
      );
    }

    const intentResult = await routeIntent(text, useLLM, provider);

    return NextResponse.json(intentResult);
  } catch (error: unknown) {
    console.error('Intent detection error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

