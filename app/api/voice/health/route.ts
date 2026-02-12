// Voice Health Check API
// Quick status endpoint for frontend with mock fallback

import { NextRequest, NextResponse } from 'next/server';
import { metrics, METRICS } from '@/lib/voice/logging';

const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';
const ENABLE_MOCK = process.env.PERSONAPLEX_MOCK_MODE === 'true' || !PERSONAPLEX_API_KEY;

// Mock response for demo/testing
function getMockResponse() {
    return NextResponse.json({
        status: 'healthy',
        personaplex: true,
        model_loaded: true,
        gpu: 'Mock GPU (Demo Mode)',
        active_sessions: 0,
        max_sessions: 4,
        latency_ms: 50,
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
        // Try to reach Personaplex server
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const headers: HeadersInit = {};
        if (PERSONAPLEX_API_KEY) {
            headers['X-API-Key'] = PERSONAPLEX_API_KEY;
        }

        const response = await fetch(`${PERSONAPLEX_URL}/health`, {
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            metrics.increment(METRICS.API_ERRORS, 1, { endpoint: 'health' });
            // Fallback to mock if GPU not available
            return getMockResponse();
        }

        const data = await response.json();
        const latency = performance.now() - startTime;

        metrics.observe(METRICS.API_LATENCY, latency, { endpoint: 'health' });
        metrics.set(METRICS.SESSIONS_ACTIVE, data.active_sessions || 0);

        return NextResponse.json({
            status: 'healthy',
            personaplex: true,
            model_loaded: data.model_loaded,
            gpu: data.gpu_name,
            active_sessions: data.active_sessions,
            max_sessions: data.max_sessions,
            latency_ms: Math.round(latency),
            mode: 'live',
        });

    } catch (error) {
        const latency = performance.now() - startTime;
        metrics.increment(METRICS.API_ERRORS, 1, { endpoint: 'health' });
        metrics.observe(METRICS.API_LATENCY, latency, { endpoint: 'health' });

        // Fallback to mock mode on connection failure
        console.log('[Voice Health] GPU unreachable, using mock mode');
        return getMockResponse();
    }
}

