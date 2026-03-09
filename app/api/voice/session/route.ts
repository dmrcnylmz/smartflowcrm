// Voice Session API - Manages Personaplex sessions
// With Context Injection support for n8n webhooks
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded } from '@/lib/voice/rate-limit';
import { voiceLogger, metrics, METRICS, withTiming } from '@/lib/voice/logging';

// Environment configuration
const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';
const PERSONAPLEX_CONTEXT_URL = process.env.PERSONAPLEX_CONTEXT_URL || 'http://localhost:8999';
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

// Helper to fetch context from sidecar
async function fetchContext(sessionId: string): Promise<Record<string, unknown> | null> {
    try {
        const response = await fetch(`${PERSONAPLEX_CONTEXT_URL}/context/${sessionId}`, {
            headers: getHeaders(),
            signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
            return await response.json();
        }
    } catch {
        // Context API unavailable — non-blocking
    }
    return null;
}

// GET: Get Personaplex status, list personas, or query context
export async function GET(request: NextRequest) {
    // Require tenant authentication
    const tenantId = request.headers.get('x-user-tenant');
    if (!tenantId) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limiting
    const rateLimitResult = checkRateLimit(request, RATE_LIMITS.general);
    if (!rateLimitResult.allowed) {
        return rateLimitExceeded(rateLimitResult.resetTime);
    }

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

        // Query context for a session
        if (action === 'context') {
            const sessionId = searchParams.get('session_id');
            if (!sessionId) {
                return NextResponse.json({ error: 'session_id required' }, { status: 400 });
            }
            const context = await fetchContext(sessionId);
            return NextResponse.json(context || { session_id: sessionId, context_count: 0, contexts: [], merged: {} });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch {
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
    // Require tenant authentication
    const tenantId = request.headers.get('x-user-tenant');
    if (!tenantId) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limiting
    const rateLimitResult = checkRateLimit(request, RATE_LIMITS.session);
    if (!rateLimitResult.allowed) {
        return rateLimitExceeded(rateLimitResult.resetTime);
    }

    try {
        const body = await request.json();
        const action = body.action || 'save';

        // Proxy text inference to Personaplex (with context enrichment)
        if (action === 'infer') {
            // Fetch any injected context for this session
            const sessionId = body.session_id;
            let injectedContext = null;
            if (sessionId) {
                injectedContext = await fetchContext(sessionId);
            }

            const response = await fetch(`${PERSONAPLEX_URL}/infer`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    text: typeof body.text === 'string' ? body.text.slice(0, 2000) : '',
                    persona: body.persona || 'default',
                    language: body.language || 'tr',
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                throw new Error('Inference failed');
            }

            const inferResult = await response.json();

            // Merge injected context into the response
            const contextData = injectedContext as Record<string, unknown> | null;
            const contextCount = Number(contextData?.context_count ?? 0);
            return NextResponse.json({
                ...inferResult,
                context: contextData?.merged || null,
                context_available: contextCount > 0,
            });
        }

        // Save session to Firestore (using admin SDK — server-side)
        const {
            sessionId,
            customerId,
            customerPhone,
            customerName,
            transcript,
            duration,
            persona,
            metrics: sessionMetrics,
        } = body;

        // Use admin SDK (server-side) instead of client SDK
        const { addCallLog } = await import('@/lib/firebase/admin-db');

        // Detect primary intent from transcript for call log classification
        const transcriptText = transcript?.map((t: { speaker: string; text: string }) =>
            `${t.speaker}: ${t.text}`
        ).join('\n') || '';
        const lowerTranscript = transcriptText.toLowerCase();

        let detectedIntent = 'unknown';
        if (/randevu|appointment|tarih.*saat|schedule|book/.test(lowerTranscript)) {
            detectedIntent = 'appointment';
        } else if (/şikayet|sorun|problem|complaint|issue/.test(lowerTranscript)) {
            detectedIntent = 'complaint';
        } else if (/bilgi|fiyat|nasıl|nedir|info|price|how|what/.test(lowerTranscript)) {
            detectedIntent = 'info_request';
        } else if (/iptal|değişiklik|vazgeç|cancel|change/.test(lowerTranscript)) {
            detectedIntent = 'cancellation';
        }

        // Create call log entry under the tenant's calls collection
        const callLog = await addCallLog(tenantId, {
            customerId: customerId || '',
            customerPhone: customerPhone || '',
            customerName: customerName || 'Bilinmeyen',
            direction: 'inbound',
            status: 'answered',
            duration: Math.round(duration || 0),
            durationSec: Math.round(duration || 0),
            timestamp: new Date(),
            intent: detectedIntent,
            transcript: transcriptText,
            summary: `Sesli AI görüşme (${persona || 'default'} persona)`,
            notes: '',
            voiceSessionId: sessionId,
            aiPersona: persona,
            voiceMetrics: sessionMetrics,
        });

        // Fire-and-forget: Create auto-feedback from session metrics
        // Sentiment data and RAG quality tracked for quality monitoring
        if (callLog.id) {
            try {
                const { createAutoFeedback } = await import('@/lib/voice/feedback');
                // Use average sentiment from metrics if available, default to neutral (0.1)
                const avgSentiment = typeof sessionMetrics?.averageSentiment === 'number'
                    ? sessionMetrics.averageSentiment
                    : 0.1;
                createAutoFeedback(
                    tenantId,
                    callLog.id,
                    avgSentiment,
                    sessionMetrics?.ragChunkIds,
                    sessionMetrics?.ragScores,
                ).catch(() => {}); // Silent
            } catch {
                // Auto-feedback setup failed — non-blocking
            }
        }

        // Fire-and-forget: Auto-create draft appointment if conversation includes appointment intent
        let appointmentId: string | null = null;
        if (transcript && Array.isArray(transcript)) {
            const fullTranscript = transcript.map((t: { speaker: string; text: string }) =>
                `${t.speaker}: ${t.text}`
            ).join('\n').toLowerCase();

            const hasAppointmentIntent = /randevu|appointment|tarih.*saat|schedule|book.*meeting|görüşme.*ayarla/.test(fullTranscript);
            if (hasAppointmentIntent) {
                try {
                    const { createAppointment } = await import('@/lib/firebase/admin-db');
                    const { Timestamp } = await import('firebase-admin/firestore');

                    // Extract date/time hints from conversation (best-effort)
                    const dateMatch = fullTranscript.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
                    const timeMatch = fullTranscript.match(/(\d{1,2})[:.:](\d{2})/);

                    let appointmentDate = new Date();
                    appointmentDate.setDate(appointmentDate.getDate() + 1); // Default: tomorrow
                    appointmentDate.setHours(10, 0, 0, 0);

                    if (dateMatch) {
                        const day = parseInt(dateMatch[1], 10);
                        const month = parseInt(dateMatch[2], 10) - 1;
                        const year = dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3], 10) : parseInt(dateMatch[3], 10);
                        appointmentDate = new Date(year, month, day, 10, 0, 0);
                    }
                    if (timeMatch) {
                        appointmentDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
                    }

                    const appointmentRef = await createAppointment(tenantId, {
                        customerId: customerId || '',
                        customerName: customerName || 'Bilinmeyen',
                        customerPhone: customerPhone || '',
                        dateTime: Timestamp.fromDate(appointmentDate),
                        durationMin: 30,
                        status: dateMatch ? 'scheduled' : 'pending_confirmation',
                        notes: `Sesli görüşmeden otomatik oluşturuldu (Oturum: ${sessionId})`,
                        source: 'voice_call',
                        callLogId: callLog.id,
                    });
                    appointmentId = appointmentRef.id;
                } catch {
                    // Appointment creation failed — non-blocking
                }
            }
        }

        return NextResponse.json({
            success: true,
            callLogId: callLog.id,
            ...(appointmentId ? { appointmentId } : {}),
        });

    } catch {
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

