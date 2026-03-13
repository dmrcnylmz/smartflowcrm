/**
 * Support Chat API — Public AI Chat Endpoint
 *
 * POST /api/chat/support
 *
 * Streaming chat endpoint for the landing page support widget.
 * Uses GPT-4o-mini with a dedicated support prompt.
 * No authentication required — rate limited by IP.
 *
 * Request: { sessionId: string, message: string, language?: 'tr' | 'en' }
 * Response: text/event-stream (SSE) with token chunks
 */

import { NextRequest, NextResponse } from 'next/server';
import { LLMStreaming, type ConversationTurn } from '@/lib/ai/llm-streaming';
import { buildSupportPrompt } from '@/lib/ai/support-prompt';
import { checkRateLimit } from '@/lib/utils/rate-limiter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 500;
const MAX_TURNS = 20;
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SESSIONS = 10_000;
const RATE_LIMIT = { limit: 20, windowSeconds: 300, tier: 'support-chat' };

// ─── In-Memory Session Store ────────────────────────────────────────────────

interface Session {
    turns: ConversationTurn[];
    lastActivity: number;
}

const sessions = new Map<string, Session>();

function cleanExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.lastActivity > SESSION_TTL_MS) {
            sessions.delete(id);
        }
    }
}

function getOrCreateSession(sessionId: string): Session {
    // Periodic cleanup
    if (sessions.size > MAX_SESSIONS * 0.9) {
        cleanExpiredSessions();
    }

    let session = sessions.get(sessionId);
    if (!session) {
        session = { turns: [], lastActivity: Date.now() };
        sessions.set(sessionId, session);
    }
    session.lastActivity = Date.now();
    return session;
}

// ─── LLM Instance ──────────────────────────────────────────────────────────

let llm: LLMStreaming | null = null;

function getLLM(): LLMStreaming {
    if (!llm) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

        llm = new LLMStreaming({
            apiKey,
            model: 'gpt-4o-mini',
            maxTokens: 400,
            temperature: 0.4,
            timeoutMs: 15_000,
        });
    }
    return llm;
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        // Rate limit by IP
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rateResult = await checkRateLimit(ip, RATE_LIMIT);
        if (!rateResult.success) {
            return NextResponse.json(
                { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.' },
                { status: 429 },
            );
        }

        // Parse body
        const body = await request.json();
        const { sessionId, message, language = 'tr' } = body;

        if (!sessionId || typeof sessionId !== 'string') {
            return NextResponse.json({ error: 'sessionId gerekli' }, { status: 400 });
        }

        if (!message || typeof message !== 'string') {
            return NextResponse.json({ error: 'message gerekli' }, { status: 400 });
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json(
                { error: `Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir` },
                { status: 400 },
            );
        }

        const lang = language === 'en' ? 'en' : 'tr';

        // Get session and add user message
        const session = getOrCreateSession(sessionId);

        // Trim to max turns
        if (session.turns.length >= MAX_TURNS) {
            session.turns = session.turns.slice(-MAX_TURNS + 2);
        }

        session.turns.push({ role: 'user', content: message });

        // Build prompt and stream response
        const systemPrompt = buildSupportPrompt(lang);
        const streaming = getLLM();

        // Check if non-streaming is requested (for voice mode)
        const wantsJson = request.headers.get('accept') === 'application/json';

        if (wantsJson) {
            // Non-streaming JSON response (for voice mode)
            let fullResponse = '';
            const generator = streaming.streamCompletion(
                systemPrompt,
                session.turns.slice(0, -1), // exclude current user message (passed separately)
                message,
                false, // no tools
                lang,
            );

            for await (const token of generator) {
                fullResponse += token;
            }

            session.turns.push({ role: 'assistant', content: fullResponse });

            return NextResponse.json({ response: fullResponse });
        }

        // Streaming SSE response (for text mode)
        const encoder = new TextEncoder();
        let assistantMessage = '';

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = streaming.streamCompletion(
                        systemPrompt,
                        session.turns.slice(0, -1),
                        message,
                        false, // no tools
                        lang,
                    );

                    for await (const token of generator) {
                        assistantMessage += token;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                    }

                    // Store assistant response in session
                    session.turns.push({ role: 'assistant', content: assistantMessage });

                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error) {
                    const fallback = lang === 'tr'
                        ? 'Bir teknik sorun yaşıyoruz. Lütfen daha sonra tekrar deneyin.'
                        : 'We are experiencing a technical issue. Please try again later.';

                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: fallback })}\n\n`));
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('[SupportChat] Error:', error);
        return NextResponse.json(
            { error: 'Bir hata oluştu' },
            { status: 500 },
        );
    }
}
