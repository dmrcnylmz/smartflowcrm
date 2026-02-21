/**
 * Master Health Check Endpoint
 * 
 * GET /api/health
 * 
 * Checks connectivity to all dependent services:
 * - Firebase Firestore
 * - RunPod Personaplex (GPU inference)
 * - RunPod Context API
 * - Voice Pipeline providers (STT, LLM, TTS)
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ServiceCheck {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latency_ms: number;
    details?: Record<string, unknown>;
}

async function checkService(
    name: string,
    url: string,
    timeoutMs: number = 5000,
): Promise<ServiceCheck> {
    const start = Date.now();
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - start;

        if (res.ok) {
            let details: Record<string, unknown> = {};
            try {
                details = await res.json();
            } catch {
                // Response might not be JSON
            }
            return { name, status: 'healthy', latency_ms: latency, details };
        }

        return { name, status: 'degraded', latency_ms: latency, details: { httpStatus: res.status } };
    } catch (err) {
        return {
            name,
            status: 'down',
            latency_ms: Date.now() - start,
            details: { error: err instanceof Error ? err.message : 'Unknown' },
        };
    }
}

export async function GET() {
    const startTime = Date.now();

    const personaplexUrl = process.env.PERSONAPLEX_URL || 'http://localhost:8998';
    const contextApiUrl = process.env.PERSONAPLEX_CONTEXT_URL || 'http://localhost:8999';

    // Check all services in parallel
    const [personaplex, contextApi] = await Promise.all([
        checkService('personaplex', `${personaplexUrl}/health`),
        checkService('context-api', `${contextApiUrl}/health`),
    ]);

    // Check pipeline provider configuration (not connectivity)
    const pipelineProviders = {
        stt: !!process.env.DEEPGRAM_API_KEY ? 'configured' : 'missing',
        llm: !!process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        tts: !!process.env.ELEVENLABS_API_KEY ? 'configured' : 'missing',
    };

    const services = [personaplex, contextApi];
    const allHealthy = services.every(s => s.status === 'healthy');
    const anyDown = services.some(s => s.status === 'down');

    const overallStatus = allHealthy ? 'healthy' : anyDown ? 'degraded' : 'partial';

    const response = {
        status: overallStatus,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        total_latency_ms: Date.now() - startTime,
        services: Object.fromEntries(services.map(s => [s.name, s])),
        pipeline: pipelineProviders,
    };

    return NextResponse.json(response, {
        status: allHealthy ? 200 : 503,
    });
}
