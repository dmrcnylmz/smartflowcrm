import { NextRequest, NextResponse } from 'next/server';
import { detectIntentFast } from '@/lib/ai/intent-fast';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text field is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (text.length > 2000) {
      return NextResponse.json(
        { error: 'Text exceeds maximum length of 2000 characters' },
        { status: 400 }
      );
    }

    const result = detectIntentFast(text.trim());

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[API] Intent detection error:', error);
    return NextResponse.json(
      { error: 'Intent detection failed' },
      { status: 500 }
    );
  }
}
