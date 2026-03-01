// Voice Health Check API
// With GPU Manager integration for cached health checks and sleep/wake detection

import { NextRequest, NextResponse } from 'next/server';
import { metrics, METRICS } from '@/lib/voice/logging';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { gpuCircuitBreaker, openaiCircuitBreaker, ttsCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { inferCache, ttsCache } from '@/lib/voice/response-cache';

const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';
const ENABLE_MOCK = process.env.PERSONAPLEX_MOCK_MODE === 'true' || !PERSONAPLEX_API_KEY;

// Mock response for demo/testing
function getMockResponse() {
    const mockHealth = gpuManager.getMockHealth();
    return NextResponse.json({
        status: 'healthy',
        personaplex: true,
        model_loaded: true,
        gpu: mockHealth.gpu_name,
        active_sessions: 0,
        max_sessions: 4,
        latency_ms: mockHealth.latency_ms,
        mode: 'mock',
        message: 'Demo mode - GPU sunucu bağlantısı gerekmiyor',
    });
}

export async function GET(request: NextRequest) {
    // Check for explicit mock mode
    const useMock = request.nextUrl.searchParams.get('mock') === 'true';
    if (useMock || ENABLE_MOCK) {
        return getMockResponse();
    }

    const startTime = performance.now();

    try {
        // Use GPU Manager's cached health check (avoids hammering GPU)
        const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
        const health = await gpuManager.checkHealth(forceRefresh);

        const latency = performance.now() - startTime;

        metrics.observe(METRICS.API_LATENCY, latency, { endpoint: 'health' });
        metrics.set(METRICS.SESSIONS_ACTIVE, health.active_sessions || 0);

        // If GPU is sleeping/unhealthy, fall back to mock
        if (health.status !== 'healthy') {
            // GPU not healthy; returning degraded status
            return NextResponse.json({
                status: 'degraded',
                personaplex: false,
                model_loaded: false,
                gpu: null,
                gpu_status: health.status,
                active_sessions: 0,
                max_sessions: 0,
                latency_ms: Math.round(latency),
                mode: 'degraded',
                cached: health.cached,
                message: health.status === 'sleeping'
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
            // Include system-wide stats
            system: {
                gpu: gpuManager.getStatus().metrics,
                circuitBreakers: {
                    gpu: gpuCircuitBreaker.getState(),
                    openai: openaiCircuitBreaker.getState(),
                    tts: ttsCircuitBreaker.getState(),
                },
                cache: {
                    infer: inferCache.getStats(),
                    tts: ttsCache.getStats(),
                },
            },
        });

    } catch (error) {
        const latency = performance.now() - startTime;
        metrics.increment(METRICS.API_ERRORS, 1, { endpoint: 'health' });
        metrics.observe(METRICS.API_LATENCY, latency, { endpoint: 'health' });

        // Fallback to mock mode on connection failure
        // GPU unreachable; falling back to mock mode
        return getMockResponse();
    }
}
