/**
 * Sentiment Analysis API — Analyze text sentiment
 *
 * POST: Analyze a single text or conversation turn
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeSentiment, analyzeConversationSentiment, createConversationContext, type ConversationContext } from '@/lib/voice/sentiment';

export async function POST(request: NextRequest) {
    try {
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
        console.error('[Sentiment API] Error:', error);
        return NextResponse.json(
            { error: 'Sentiment analysis failed', details: String(error) },
            { status: 500 },
        );
    }
}
