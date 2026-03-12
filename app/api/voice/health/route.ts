// Voice Health Check API
// GPU-optional: reports healthy if any LLM provider is available

import { NextRequest, NextResponse } from 'next/server';
import { metrics, METRICS } from '@/lib/voice/logging';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { gpuCircuitBreaker, openaiCircuitBreaker, groqCircuitBreaker, geminiCircuitBreaker, cartesiaCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { inferCache, ttsCache } from '@/lib/voice/response-cache';
import { isGroqConfigured } from '@/lib/ai/groq-client';
import { isGeminiConfigured } from '@/lib/ai/gemini-client';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';
const ENABLE_MOCK = process.env.PERSONAPLEX_MOCK_MODE === 'true' || !PERSONAPLEX_API_KEY;

function getCapabilities() {
    return {
        gpu: !gpuCircuitBreaker.isOpen() && !!PERSONAPLEX_API_KEY,
        openai: !!OPENAI_API_KEY && !openaiCircuitBreaker.isOpen(),
        groq: isGroqConfigured() && !groqCircuitBreaker.isOpen(),
        gemini: isGeminiConfigured() && !geminiCircuitBreaker.isOpen(),
    };
}

function hasAnyLLM(caps: ReturnType<typeof getCapabilities>): boolean {
    return caps.openai || caps.groq || caps.gemini;
}

export async function GET(request: NextRequest) {
    const startTime = performance.now();
    const useMock = request.nextUrl.searchParams.get('mock') === 'true';
    const caps = getCapabilities();

    // Mock mode or no GPU key → still healthy if LLM available
    if (useMock || ENABLE_MOCK) {
        const mockHealth = gpuManager.getMockHealth();
        const mode = hasAnyLLM(caps) ? 'text-only' : 'mock';
        return NextResponse.json({
            status: 'healthy',
            personaplex: false,
            model_loaded: false,
            gpu: mockHealth.gpu_name,
            active_sessions: 0,
            max_sessions: 4,
            latency_ms: mockHealth.latency_ms,
            mode,
            capabilities: caps,
            message: mode === 'text-only'
                ? 'LLM aktif — GPU olmadan metin tabanlı AI çalışıyor'
                : 'Demo mode - GPU sunucu bağlantısı gerekmiyor',
        });
    }

    try {
        const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
        const health = await gpuManager.checkHealth(forceRefresh);
        const latency = performance.now() - startTime;

        metrics.observe(METRICS.API_LATENCY, latency, { endpoint: 'health' });
        metrics.set(METRICS.SESSIONS_ACTIVE, health.active_sessions || 0);

        if (health.status !== 'healthy') {
            // GPU down — but still healthy if LLM is available
            const anyLLM = hasAnyLLM(caps);
            return NextResponse.json({
                status: anyLLM ? 'healthy' : 'degraded',
                personaplex: false,
                model_loaded: false,
                gpu: null,
                gpu_status: health.status,
                active_sessions: 0,
                max_sessions: 0,
                latency_ms: Math.round(latency),
                mode: anyLLM ? 'text-only' : 'degraded',
                cached: health.cached,
                capabilities: caps,
                message: anyLLM
                    ? 'GPU kapalı — LLM ile metin tabanlı AI aktif'
                    : health.status === 'sleeping'
                        ? 'GPU uyku modunda — ilk çağrıda otomatik uyanır'
                        : 'GPU erişilemiyor',
            });
        }

        return NextResponse.json({
            status: 'healthy',
            personaplex: true,
            model_loaded: health.model_loaded,
            gpu: health.gpu_name,
            gpu_memory_gb: health.gpu_memory_gb,
            active_sessions: health.active_sessions,
            max_sessions: health.max_sessions,
            uptime_seconds: health.uptime_seconds,
            latency_ms: Math.round(latency),
            mode: 'live',
            cached: health.cached,
            capabilities: caps,
            system: {
                gpu: gpuManager.getStatus().metrics,
                circuitBreakers: {
                    gpu: gpuCircuitBreaker.getState(),
                    openai: openaiCircuitBreaker.getState(),
                    groq: groqCircuitBreaker.getState(),
                    gemini: geminiCircuitBreaker.getState(),
                    cartesia: cartesiaCircuitBreaker.getState(),
                },
                cache: {
                    infer: inferCache.getStats(),
                    tts: ttsCache.getStats(),
                },
            },
        });

    } catch {
        const latency = performance.now() - startTime;
        metrics.increment(METRICS.API_ERRORS, 1, { endpoint: 'health' });
        metrics.observe(METRICS.API_LATENCY, latency, { endpoint: 'health' });

        // GPU unreachable — still report healthy if LLM available
        const anyLLM = hasAnyLLM(caps);
        const mockHealth = gpuManager.getMockHealth();
        return NextResponse.json({
            status: anyLLM ? 'healthy' : 'degraded',
            personaplex: false,
            model_loaded: false,
            gpu: mockHealth.gpu_name,
            active_sessions: 0,
            max_sessions: 0,
            latency_ms: Math.round(latency),
            mode: anyLLM ? 'text-only' : 'mock',
            capabilities: caps,
            message: anyLLM
                ? 'GPU erişilemiyor — LLM ile metin tabanlı AI aktif'
                : 'Demo mode aktif',
        });
    }
}
