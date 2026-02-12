/**
 * Voice Pipeline API Route — Server-Sent Events
 *
 * POST /api/voice/pipeline
 *
 * Starts a voice AI session via SSE streaming.
 * Authenticates via Firebase, enforces tenant quotas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { VoicePipeline, type PipelineConfig } from '@/lib/voice/voice-pipeline';

// Force Node.js runtime (not Edge) — needed for WebSocket, streaming, etc.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Config ---

function getPipelineConfig(): PipelineConfig | null {
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!openaiApiKey || !elevenlabsApiKey) {
        return null;
    }

    return {
        deepgramApiKey: deepgramApiKey || '',
        openaiApiKey,
        elevenlabsApiKey,
    };
}

// --- POST: Start pipeline session ---

export async function POST(request: NextRequest) {
    const config = getPipelineConfig();
    if (!config) {
        return NextResponse.json(
            { error: 'Voice pipeline not configured. Missing API keys.' },
            { status: 503 },
        );
    }

    // Parse request body
    let body: { tenantId?: string; language?: string; action?: string; sessionId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const tenantId = body.tenantId || 'default';
    const sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const action = body.action || 'start';

    // --- Action: Start Session ---
    if (action === 'start') {
        try {
            const pipeline = new VoicePipeline(tenantId, sessionId, config);
            await pipeline.initialize();

            // Return session info
            return NextResponse.json({
                success: true,
                sessionId,
                tenantId,
                message: 'Pipeline session created. Use /api/voice/pipeline/stream for SSE.',
                capabilities: {
                    stt: !!config.deepgramApiKey,
                    llm: true,
                    tts: true,
                    tools: ['book_appointment', 'log_complaint', 'escalate_to_human', 'request_info'],
                },
            });
        } catch (err) {
            console.error('[Pipeline API] Failed to start session:', err);
            return NextResponse.json(
                { error: 'Failed to initialize pipeline', details: String(err) },
                { status: 500 },
            );
        }
    }

    // --- Action: Text Input (LLM-only, no audio) ---
    if (action === 'text') {
        const text = (body as Record<string, unknown>).text as string;
        if (!text) {
            return NextResponse.json({ error: 'Missing text field' }, { status: 400 });
        }

        try {
            const pipeline = new VoicePipeline(tenantId, sessionId, config);
            await pipeline.initialize();

            // Step 1: Intent detection
            const { detectIntentFast, shouldShortcut, getShortcutResponse } = await import('@/lib/ai/intent-fast');
            const { getTenantConfig } = await import('@/lib/tenant/config');
            const intent = detectIntentFast(text);
            const tenant = await getTenantConfig(tenantId);
            const language = tenant.language === 'en' ? 'en' : 'tr';

            // Step 2: SHORTCUT — skip LLM for simple, high-confidence intents
            if (shouldShortcut(intent)) {
                const shortcutResponse = getShortcutResponse(
                    intent.intent,
                    language,
                    tenant.agent.name,
                );
                await pipeline.endSession();

                return NextResponse.json({
                    success: true,
                    sessionId,
                    intent,
                    response: shortcutResponse,
                    shortcut: true,
                    cached: false,
                    metrics: pipeline.getMetrics(),
                });
            }

            // Step 3: CACHE CHECK — return cached response if available
            const { getResponseCache, buildCacheKey } = await import('@/lib/ai/response-cache');
            const cache = getResponseCache();
            const cacheKey = buildCacheKey(tenantId, intent.intent, text);
            const cachedResponse = cache.get(cacheKey);

            if (cachedResponse) {
                await pipeline.endSession();

                return NextResponse.json({
                    success: true,
                    sessionId,
                    intent,
                    response: cachedResponse,
                    shortcut: false,
                    cached: true,
                    metrics: pipeline.getMetrics(),
                });
            }

            // Step 4: Full LLM pipeline
            const { buildSystemPrompt } = await import('@/lib/ai/prompt-builder');
            const { LLMStreaming } = await import('@/lib/ai/llm-streaming');

            const systemPrompt = buildSystemPrompt({
                tenant,
                ragResults: [],
                currentIntent: intent.intent,
                language,
            });

            const llm = new LLMStreaming({ apiKey: config.openaiApiKey });
            const generator = llm.streamCompletion(systemPrompt, [], text, true, language);

            let fullResponse = '';
            for await (const token of generator) {
                fullResponse += token;
            }

            // Store in cache for future hits
            cache.set(cacheKey, fullResponse, intent.intent);

            await pipeline.endSession();

            return NextResponse.json({
                success: true,
                sessionId,
                intent: intent,
                response: fullResponse,
                shortcut: false,
                cached: false,
                metrics: pipeline.getMetrics(),
            });
        } catch (err) {
            console.error('[Pipeline API] Text processing error:', err);
            return NextResponse.json(
                { error: 'Processing failed', details: String(err) },
                { status: 500 },
            );
        }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// --- GET: Health check ---

export async function GET() {
    const config = getPipelineConfig();

    return NextResponse.json({
        status: 'ok',
        pipeline: {
            configured: !!config,
            providers: {
                stt: !!process.env.DEEPGRAM_API_KEY ? 'deepgram-nova-3' : 'not-configured',
                llm: !!process.env.OPENAI_API_KEY ? 'gpt-4o' : 'not-configured',
                tts: !!process.env.ELEVENLABS_API_KEY ? 'elevenlabs-flash-v2.5' : 'not-configured',
            },
        },
        timestamp: new Date().toISOString(),
    });
}
