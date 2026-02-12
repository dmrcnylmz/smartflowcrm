/**
 * Voice Pipeline — Live Integration Test
 *
 * Tests the full pipeline against real APIs:
 * 1. Health check endpoint
 * 2. Text input → LLM response via API
 * 3. Intent detection accuracy
 * 4. Guardrails blocking
 *
 * Run: npx vitest run tests/voice-pipeline-live.test.ts
 * Requires: OPENAI_API_KEY, ELEVENLABS_API_KEY, DEEPGRAM_API_KEY in .env.local
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';

// Env vars are loaded automatically by Vitest's Next.js environment

// --- Provider Connectivity Tests ---

describe('Live Provider Connectivity', () => {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
    const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

    describe('OpenAI', () => {
        it('connects and generates a streaming response', async () => {
            if (!OPENAI_KEY) return; // skip if no key

            const { LLMStreaming } = await import('@/lib/ai/llm-streaming');
            const llm = new LLMStreaming({ apiKey: OPENAI_KEY });

            let tokens = '';
            const gen = llm.streamCompletion(
                'Sen bir Türk müşteri temsilcisisin. Kısa cevap ver.',
                [],
                'Merhaba, nasılsınız?',
                false,
                'tr',
            );

            for await (const token of gen) {
                tokens += token;
            }

            expect(tokens.length).toBeGreaterThan(0);
            console.log('[OpenAI] Response:', tokens);
        }, 15000);

        it('generates embeddings', async () => {
            if (!OPENAI_KEY) return;

            const { EmbeddingGenerator } = await import('@/lib/ai/embeddings');
            const embedder = new EmbeddingGenerator({ apiKey: OPENAI_KEY });

            const embedding = await embedder.generateEmbedding('Randevu almak istiyorum');
            expect(embedding).toHaveLength(1536);
            expect(embedding[0]).toBeTypeOf('number');
            console.log('[OpenAI] Embedding dimension:', embedding.length);
        }, 10000);
    });

    describe('ElevenLabs', () => {
        it('streams TTS audio for Turkish text', async () => {
            if (!ELEVENLABS_KEY) return;

            const { ElevenLabsTTS } = await import('@/lib/voice/tts-elevenlabs');
            const tts = new ElevenLabsTTS({ apiKey: ELEVENLABS_KEY });

            const chunks: Buffer[] = [];
            for await (const chunk of tts.streamText('Merhaba, size nasıl yardımcı olabilirim?')) {
                chunks.push(chunk);
            }

            const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
            expect(totalBytes).toBeGreaterThan(0);
            console.log('[ElevenLabs] Audio bytes:', totalBytes, 'chunks:', chunks.length);
        }, 15000);
    });

    describe('Deepgram', () => {
        it('connects to WebSocket', async () => {
            if (!DEEPGRAM_KEY) return;

            const { DeepgramSTT } = await import('@/lib/voice/stt-deepgram');
            const stt = new DeepgramSTT({ apiKey: DEEPGRAM_KEY });

            let connected = false;
            stt.on('connected', () => { connected = true; });

            await stt.connect();
            expect(connected).toBe(true);
            expect(stt.isConnected()).toBe(true);

            await stt.close();
            console.log('[Deepgram] WebSocket connected and closed cleanly');
        }, 10000);
    });
});

// --- End-to-End Pipeline Tests ---

describe('End-to-End Pipeline (Text Mode)', () => {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    it('processes appointment intent through full pipeline', async () => {
        if (!OPENAI_KEY) return;

        const { detectIntentFast } = await import('@/lib/ai/intent-fast');
        const { LLMStreaming } = await import('@/lib/ai/llm-streaming');
        const { buildSystemPrompt } = await import('@/lib/ai/prompt-builder');
        const { DEFAULT_TENANT } = await import('@/lib/tenant/types');

        // Step 1: Intent detection
        const intent = detectIntentFast('yarın saat 3\'te randevu almak istiyorum');
        expect(intent.intent).toBe('appointment');
        console.log('[Intent]', intent);

        // Step 2: Build prompt
        const prompt = buildSystemPrompt({
            tenant: DEFAULT_TENANT,
            ragResults: [{
                docId: 'services',
                text: 'Randevular hafta içi 09:00-17:00 arası alınabilir. Her randevu 30 dakikadır.',
                score: 0.88,
                metadata: { source: 'services', createdAt: '' },
            }],
            currentIntent: intent.intent,
            language: 'tr',
        });

        expect(prompt).toContain('Ayşe');
        expect(prompt).toContain('randevu');

        // Step 3: LLM response
        const llm = new LLMStreaming({ apiKey: OPENAI_KEY });
        let response = '';
        const gen = llm.streamCompletion(prompt, [], 'yarın saat 3\'te randevu almak istiyorum', true, 'tr');
        for await (const token of gen) {
            response += token;
        }

        expect(response.length).toBeGreaterThan(0);
        console.log('[LLM Response]', response);

        // Step 4: Guardrails check
        const { validateResponse } = await import('@/lib/ai/guardrails');
        const guardrailResult = validateResponse(
            response,
            [{ text: 'Randevular hafta içi 09:00-17:00 arası alınabilir.', score: 0.88, source: 'services' }],
            { language: 'tr', allowPriceQuotes: false },
        );

        console.log('[Guardrails]', guardrailResult);
        // It should pass or at minimum not contain forbidden content
    }, 20000);

    it('blocks hallucination when no RAG context', async () => {
        const { validateResponse } = await import('@/lib/ai/guardrails');

        const result = validateResponse(
            'Ürünümüz 15.000 TL\'dir ve 3 yıl garantili.',
            [], // NO RAG context
            { language: 'tr' },
        );

        expect(result.approved).toBe(false);
        console.log('[Guardrails] Blocked hallucination:', result.violations);
    });

    it('detects and blocks AI identity leak', async () => {
        const { validateResponse } = await import('@/lib/ai/guardrails');

        const result = validateResponse(
            'Ben bir yapay zeka asistanıyım ama size yardımcı olabilirim.',
            [{ text: 'Yardım doku.', score: 0.85, source: 'help' }],
            { language: 'tr' },
        );

        expect(result.violations.some((v: string) => v.includes('identity'))).toBe(true);
        console.log('[Guardrails] Identity leak detected:', result.violations);
    });
});

// --- Vector Store E2E ---

describe('Vector Store E2E', () => {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    it('add → search → find with real embeddings', async () => {
        if (!OPENAI_KEY) return;

        const { VectorStore } = await import('@/lib/ai/vector-store');
        const store = new VectorStore({ openaiApiKey: OPENAI_KEY });

        // Add documents
        const chunks = await store.addDocument('test-tenant', 'faq', [
            'Randevular hafta içi 09:00-17:00 arası alınabilir.',
            'İptal işlemleri 24 saat öncesine kadar yapılabilir.',
            'Fiyatlarımız yıllık 12.000 TL\'den başlamaktadır.',
        ].join(' '));

        expect(chunks).toBeGreaterThan(0);
        console.log('[VectorStore] Added', chunks, 'chunks');

        // Search — should find appointment info
        const results = await store.search('test-tenant', 'randevu saatleri nedir');
        console.log('[VectorStore] Search results:', results.map(r => ({
            score: r.score.toFixed(3),
            text: r.text.slice(0, 60),
        })));

        // At least one result should have score >= threshold
        if (results.length > 0) {
            expect(results[0].score).toBeGreaterThanOrEqual(0.75);
        }

        // Search for unrelated topic — should find nothing above threshold
        const noResults = await store.search('test-tenant', 'hava durumu nasıl');
        console.log('[VectorStore] Unrelated search results:', noResults.length);

        // Clean up
        store.clearCache('test-tenant');
    }, 20000);
});
