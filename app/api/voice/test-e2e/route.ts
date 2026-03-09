/**
 * Voice AI End-to-End Test Endpoint
 *
 * GET /api/voice/test-e2e — Tests all pipeline components
 */

import { NextResponse } from 'next/server';
import { generateWithFallback, getLLMProviderStatus } from '@/lib/ai/llm-fallback-chain';
import { detectIntentFast } from '@/lib/ai/intent-fast';
import { openaiCircuitBreaker, groqCircuitBreaker, geminiCircuitBreaker, gpuCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { inferCache } from '@/lib/voice/response-cache';
import { handleApiError } from '@/lib/utils/error-handler';
import { getAppUrl } from '@/lib/utils/get-app-url';

export const dynamic = 'force-dynamic';

interface TestResult {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    durationMs: number;
    details?: string;
}

export async function GET() {
    // Block in production — test endpoint leaks internal state
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const results: TestResult[] = [];
    const totalStart = performance.now();

    // Test 1: Health endpoint
    const t1 = performance.now();
    try {
        const healthRes = await fetch(new URL('/api/voice/health', getAppUrl()));
        const health = await healthRes.json();
        results.push({
            name: 'Health Endpoint',
            status: health.status === 'healthy' ? 'pass' : 'fail',
            durationMs: Math.round(performance.now() - t1),
            details: `mode=${health.mode}, status=${health.status}`,
        });
    } catch (err) {
        results.push({
            name: 'Health Endpoint',
            status: 'fail',
            durationMs: Math.round(performance.now() - t1),
            details: err instanceof Error ? err.message : 'Unknown error',
        });
    }

    // Test 2: Intent Detection
    const t2 = performance.now();
    try {
        const testCases = [
            { input: 'Merhaba', expected: 'greeting' },
            { input: 'Randevu almak istiyorum', expected: 'appointment' },
            { input: 'Şikayetim var', expected: 'complaint' },
            { input: 'Fiyat nedir?', expected: 'pricing' },
        ];

        let passed = 0;
        for (const tc of testCases) {
            const result = detectIntentFast(tc.input);
            if (result.intent === tc.expected) passed++;
        }

        results.push({
            name: 'Intent Detection',
            status: passed === testCases.length ? 'pass' : 'fail',
            durationMs: Math.round(performance.now() - t2),
            details: `${passed}/${testCases.length} intents correctly detected`,
        });
    } catch (err) {
        results.push({
            name: 'Intent Detection',
            status: 'fail',
            durationMs: Math.round(performance.now() - t2),
            details: err instanceof Error ? err.message : 'Unknown error',
        });
    }

    // Test 3: LLM Fallback Chain
    const t3 = performance.now();
    try {
        const result = await generateWithFallback(
            [
                { role: 'system', content: 'Sen bir test asistanısın. Kısa yanıt ver.' },
                { role: 'user', content: 'Merhaba, bu bir test mesajıdır.' },
            ],
            { maxTokens: 50, temperature: 0, language: 'tr' },
        );

        const isGraceful = result.source === 'graceful-fallback';
        results.push({
            name: 'LLM Fallback Chain',
            status: isGraceful ? 'fail' : 'pass',
            durationMs: Math.round(performance.now() - t3),
            details: `source=${result.source}, response_length=${result.text.length}`,
        });
    } catch (err) {
        results.push({
            name: 'LLM Fallback Chain',
            status: 'fail',
            durationMs: Math.round(performance.now() - t3),
            details: err instanceof Error ? err.message : 'Unknown error',
        });
    }

    // Test 4: Response Cache
    const t4 = performance.now();
    try {
        const stats = inferCache.getStats();
        results.push({
            name: 'Response Cache',
            status: 'pass',
            durationMs: Math.round(performance.now() - t4),
            details: `size=${stats.size}, hits=${stats.hits}, misses=${stats.misses}`,
        });
    } catch (err) {
        results.push({
            name: 'Response Cache',
            status: 'fail',
            durationMs: Math.round(performance.now() - t4),
            details: err instanceof Error ? err.message : 'Unknown error',
        });
    }

    // Test 5: Circuit Breaker Status
    const t5 = performance.now();
    const providers = getLLMProviderStatus();
    const circuitBreakers = {
        openai: openaiCircuitBreaker.getState(),
        groq: groqCircuitBreaker.getState(),
        gemini: geminiCircuitBreaker.getState(),
        gpu: gpuCircuitBreaker.getState(),
    };

    results.push({
        name: 'Circuit Breakers',
        status: 'pass',
        durationMs: Math.round(performance.now() - t5),
        details: Object.entries(circuitBreakers).map(([k, v]) => `${k}=${v}`).join(', '),
    });

    // Summary
    const totalDuration = Math.round(performance.now() - totalStart);
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const skipped = results.filter(r => r.status === 'skip').length;

    return NextResponse.json({
        summary: {
            total: results.length,
            passed,
            failed,
            skipped,
            durationMs: totalDuration,
            allPassed: failed === 0,
        },
        providers,
        circuitBreakers,
        results,
    });
}
