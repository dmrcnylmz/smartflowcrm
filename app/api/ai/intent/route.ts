import { NextRequest, NextResponse } from 'next/server';
import { detectIntent, detectIntentWithLLM, routeIntent } from '@/lib/ai/router';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, useLLM = false } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid text parameter' },
        { status: 400 }
      );
    }

    // Detect intent (fast or LLM-based)
    const intentResult = useLLM
      ? await detectIntentWithLLM(text)
      : detectIntent(text);

    // Route to appropriate handler
    const routeResult = routeIntent(intentResult);

    return NextResponse.json({ ...intentResult, route: routeResult });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.warn('[Intent API] Error:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

