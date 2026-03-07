/**
 * Sentiment Analysis API — Analyze text sentiment
 *
 * POST: Analyze a single text or conversation turn
 *
 * Requires authentication (Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeSentiment, analyzeConversationSentiment, createConversationContext, type ConversationContext } from '@/lib/voice/sentiment';
import { handleApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { text, conversationContext } = body;

        if (!text) {
            return NextResponse.json(
                { error: 'text is required' },
                { status: 400 },
            );
        }

        // If conversation context is provided, use conversation-aware analysis
        if (conversationContext) {
            const ctx: ConversationContext = {
                turns: conversationContext.turns || [],
                averageSentiment: conversationContext.averageSentiment || 0,
                negativeStreak: conversationContext.negativeStreak || 0,
            };

            const { result, updatedContext } = analyzeConversationSentiment(text, ctx);

            return NextResponse.json({
                sentiment: result,
                conversationContext: updatedContext,
            });
        }

        // Single text analysis
        const result = analyzeSentiment(text);

        return NextResponse.json({
            sentiment: result,
        });

    } catch (error) {
        return handleApiError(error, 'VoiceSentiment');
    }
}
