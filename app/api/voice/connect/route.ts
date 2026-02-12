// Voice WebSocket Proxy Info Endpoint
// Provides connection details for the frontend

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, getRateLimitHeaders } from '@/lib/voice/rate-limit';
import { voiceLogger, metrics, METRICS } from '@/lib/voice/logging';

const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';

// Convert HTTP URL to WebSocket URL
function getWebSocketUrl(httpUrl: string): string {
    return httpUrl
        .replace('https://', 'wss://')
        .replace('http://', 'ws://');
}

export async function GET(request: NextRequest) {
    // Rate limiting
    const rateLimit = checkRateLimit(request, RATE_LIMITS.session);
    if (!rateLimit.allowed) {
        metrics.increment(METRICS.RATE_LIMIT_EXCEEDED, 1, { endpoint: 'ws-info' });
        return rateLimitExceeded(rateLimit.resetTime);
    }

    metrics.increment(METRICS.API_REQUESTS, 1, { endpoint: 'ws-info' });

    // Return WebSocket connection info
    // The actual WebSocket connection is made directly to the GPU server
    // through Cloudflare Tunnel (in production)
    const wsUrl = getWebSocketUrl(PERSONAPLEX_URL);

    return NextResponse.json({
        websocket_url: `${wsUrl}/ws`,
        requires_api_key: !!PERSONAPLEX_API_KEY,
        // Don't send the actual API key to the frontend
        // Frontend should use this endpoint to get connection info
        // and make authenticated requests through the backend proxy
        connection_instructions: {
            step1: 'Connect to WebSocket URL',
            step2: 'Send initial config JSON with persona',
            step3: 'Send audio chunks as binary data',
            step4: 'Receive audio responses as binary',
            step5: 'Send {"action":"end"} to close session',
        },
        audio_format: {
            sample_rate: 24000,
            channels: 1,
            encoding: 'pcm_s16le',
            chunk_size_ms: 20, // 20ms chunks recommended
        },
    }, {
        headers: getRateLimitHeaders(
            rateLimit.remaining,
            rateLimit.resetTime,
            RATE_LIMITS.session.maxRequests
        ),
    });
}

// POST: Create authenticated session token
export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimit = checkRateLimit(request, RATE_LIMITS.session);
    if (!rateLimit.allowed) {
        metrics.increment(METRICS.RATE_LIMIT_EXCEEDED, 1, { endpoint: 'ws-token' });
        return rateLimitExceeded(rateLimit.resetTime);
    }

    try {
        const body = await request.json();
        const { persona = 'default' } = body;

        voiceLogger.info('session_token_request', {
            metadata: { persona },
        });

        metrics.increment(METRICS.API_REQUESTS, 1, { endpoint: 'ws-token' });

        // In production, this would create a short-lived token
        // that the frontend uses to authenticate the WebSocket connection
        const sessionToken = {
            persona,
            api_key: PERSONAPLEX_API_KEY, // In production: use signed JWT instead
            expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes
            websocket_url: `${getWebSocketUrl(PERSONAPLEX_URL)}/ws`,
        };

        metrics.increment(METRICS.SESSIONS_CREATED, 1, { persona });

        return NextResponse.json({
            token: Buffer.from(JSON.stringify(sessionToken)).toString('base64'),
            expires_in: 300,
            websocket_url: sessionToken.websocket_url,
        }, {
            headers: getRateLimitHeaders(
                rateLimit.remaining,
                rateLimit.resetTime,
                RATE_LIMITS.session.maxRequests
            ),
        });

    } catch (error) {
        voiceLogger.error('session_token_error', error instanceof Error ? error : String(error));
        metrics.increment(METRICS.API_ERRORS, 1, { endpoint: 'ws-token' });

        return NextResponse.json(
            { error: 'Failed to create session token' },
            { status: 500 }
        );
    }
}
