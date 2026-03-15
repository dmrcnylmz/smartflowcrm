/**
 * Master Health Check Endpoint
 *
 * GET /api/health
 *
 * Production-ready health check that verifies:
 * - Firebase Firestore connectivity
 * - OpenAI API availability
 * - Twilio configuration
 * - RunPod Personaplex (GPU inference)
 * - Pipeline provider configuration (STT, LLM, TTS)
 * - System memory/uptime
 */

import { NextResponse } from 'next/server';
import { warnMissingOptionalKeys, getFeatureStatus } from '@/lib/env';
import { cacheHeaders } from '@/lib/utils/cache-headers';
import {
    gpuCircuitBreaker,
    openaiCircuitBreaker,
    groqCircuitBreaker,
    cartesiaCircuitBreaker,
    deepgramCircuitBreaker,
    murfCircuitBreaker,
    kokoroCircuitBreaker,
} from '@/lib/voice/circuit-breaker';
import { getServiceHealth } from '@/lib/monitoring/upstream-monitor';

export const dynamic = 'force-dynamic';

// Log missing optional keys on first health check
let _envWarned = false;

interface ServiceCheck {
    name: string;
    status: 'ok' | 'degraded' | 'down' | 'configured' | 'missing';
    latency_ms?: number;
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
            return { name, status: 'ok', latency_ms: latency };
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

async function checkFirestore(): Promise<ServiceCheck> {
    const start = Date.now();
    try {
        const { initAdmin } = await import('@/lib/auth/firebase-admin');
        const { getFirestore } = await import('firebase-admin/firestore');
        initAdmin();
        const db = getFirestore();
        // Read-only check — avoids permission-denied on strict Firestore rules
        await db.listCollections();
        return { name: 'firestore', status: 'ok', latency_ms: Date.now() - start };
    } catch (err) {
        return {
            name: 'firestore',
            status: 'down',
            latency_ms: Date.now() - start,
            details: { error: err instanceof Error ? err.message : 'Unknown' },
        };
    }
}

export async function GET() {
    const startTime = Date.now();

    // Log missing optional keys once
    if (!_envWarned) {
        _envWarned = true;
        warnMissingOptionalKeys();
    }

    const personaplexUrl = process.env.PERSONAPLEX_URL || 'http://localhost:8998';

    // Check all services in parallel
    const [firestore, personaplex] = await Promise.all([
        checkFirestore(),
        checkService('personaplex', `${personaplexUrl}/health`, 3000),
    ]);

    // Configuration checks (no network call needed)
    const configChecks: ServiceCheck[] = [
        {
            name: 'openai',
            status: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        },
        {
            name: 'twilio',
            status: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'missing',
        },
        {
            name: 'deepgram',
            status: process.env.DEEPGRAM_API_KEY ? 'configured' : 'missing',
        },
        {
            name: 'cartesia',
            status: process.env.CARTESIA_API_KEY ? 'configured' : 'missing',
        },
        {
            name: 'resend',
            status: process.env.RESEND_API_KEY ? 'configured' : 'missing',
        },
    ];

    const connectivityServices = [firestore, personaplex];
    const allConnected = connectivityServices.every(s => s.status === 'ok');
    const anyDown = connectivityServices.some(s => s.status === 'down');
    const firestoreOk = firestore.status === 'ok';

    // Overall status: firestore is critical, personaplex is optional
    let overallStatus: string;
    if (firestoreOk && allConnected) {
        overallStatus = 'healthy';
    } else if (firestoreOk) {
        overallStatus = 'degraded';
    } else {
        overallStatus = 'unhealthy';
    }

    // Circuit breaker states — shows which providers are currently tripped
    const circuitBreakers = {
        gpu: gpuCircuitBreaker.getState(),
        openai: openaiCircuitBreaker.getState(),
        groq: groqCircuitBreaker.getState(),
        cartesia: cartesiaCircuitBreaker.getState(),
        deepgram: deepgramCircuitBreaker.getState(),
        murf: murfCircuitBreaker.getState(),
        kokoro: kokoroCircuitBreaker.getState(),
    };

    // Upstream service health (last 5 minutes)
    const upstreamHealth = getServiceHealth(5 * 60 * 1000);

    const response = {
        status: overallStatus,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        region: process.env.VERCEL_REGION || 'local',
        timestamp: new Date().toISOString(),
        uptime_s: process.uptime ? Math.floor(process.uptime()) : null,
        total_latency_ms: Date.now() - startTime,
        services: Object.fromEntries(
            connectivityServices.map(s => [s.name, { status: s.status, latency_ms: s.latency_ms }])
        ),
        config: Object.fromEntries(
            configChecks.map(s => [s.name, s.status])
        ),
        features: Object.fromEntries(
            getFeatureStatus().map(f => [f.name, { ready: f.ready, detail: f.detail }])
        ),
        circuitBreakers,
        upstreamServices: upstreamHealth.length > 0
            ? Object.fromEntries(upstreamHealth.map(s => [s.service, {
                successRate: s.successRate,
                avgLatencyMs: s.avgLatencyMs,
                p95LatencyMs: s.p95LatencyMs,
                totalCalls: s.totalCalls,
                errors: s.errorCount,
            }]))
            : undefined,
    };

    return NextResponse.json(response, {
        status: overallStatus === 'unhealthy' ? 503 : 200,
        headers: cacheHeaders('NO_CACHE'),
    });
}
