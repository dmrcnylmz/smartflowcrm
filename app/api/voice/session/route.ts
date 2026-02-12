// Voice Session API - Manages Personaplex sessions
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, getRateLimitHeaders } from '@/lib/voice/rate-limit';
import { voiceLogger, metrics, METRICS, withTiming } from '@/lib/voice/logging';

// Environment configuration
const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';

// Helper to add API key header
function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (PERSONAPLEX_API_KEY) {
        headers['X-API-Key'] = PERSONAPLEX_API_KEY;
    }
    return headers;
}

// GET: Get Personaplex status or list personas
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'status';

    try {
        if (action === 'status') {
            // Use /health endpoint (production standard)
            const response = await fetch(`${PERSONAPLEX_URL}/health`, {
                headers: getHeaders(),
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                return NextResponse.json(
                    {
                        available: false,
                        error: 'Personaplex server not responding',
                    },
                    { status: 503 }
                );
            }

            const data = await response.json();
            return NextResponse.json({
                available: data.status === 'healthy',
                model_loaded: data.model_loaded,
                active_sessions: data.active_sessions,
                max_sessions: data.max_sessions,
                gpu_name: data.gpu_name,
            });
        }

        if (action === 'personas') {
            const response = await fetch(`${PERSONAPLEX_URL}/personas`, {
                headers: getHeaders(),
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                return NextResponse.json({ personas: [] });
            }

            const data = await response.json();
            return NextResponse.json(data);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('[Voice Session API] Error:', error);
        return NextResponse.json(
            {
                available: false,
                error: 'Failed to connect to Personaplex server',
            },
            { status: 503 }
        );
    }
}

// POST: Save session to Firestore OR proxy inference request
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const action = body.action || 'save';

        // Proxy text inference to Personaplex
        if (action === 'infer') {
            const response = await fetch(`${PERSONAPLEX_URL}/infer`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    text: body.text,
                    persona: body.persona || 'default',
                    language: body.language || 'tr',
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                throw new Error('Inference failed');
            }

            return NextResponse.json(await response.json());
        }

        // Save session to Firestore
        const {
            sessionId,
            customerId,
            customerPhone,
            customerName,
            transcript,
            duration,
            persona,
            metrics,
        } = body;

        // Import Firestore functions
        const { addCallLog } = await import('@/lib/firebase/db');
        const { Timestamp } = await import('firebase/firestore');

        // Create call log entry
        const callLog = await addCallLog({
            customerId: customerId || '',
            customerPhone: customerPhone || '',
            customerName: customerName || 'Bilinmeyen',
            direction: 'inbound',
            status: 'answered',
            duration: Math.round(duration || 0),
            durationSec: Math.round(duration || 0),
            timestamp: Timestamp.now(),
            intent: 'unknown',
            transcript: transcript?.map((t: { speaker: string; text: string }) =>
                `${t.speaker}: ${t.text}`
            ).join('\n') || '',
            summary: `Personaplex sesli görüşme (${persona || 'default'} persona)`,
            notes: '',
            voiceSessionId: sessionId,
            aiPersona: persona,
            voiceMetrics: metrics,
        });

        return NextResponse.json({
            success: true,
            callLogId: callLog.id,
        });

    } catch (error) {
        console.error('[Voice Session API] POST Error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

