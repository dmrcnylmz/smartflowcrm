/**
 * Deepgram STT API — Enterprise-Grade Speech-to-Text
 *
 * POST /api/voice/stt
 *
 * Accepts audio blob from browser microphone → sends to Deepgram Nova-2 → returns transcript.
 * This replaces browser Web Speech API for Enterprise reliability.
 *
 * Why Deepgram over Browser Speech API?
 * - Consistent results across all browsers & devices
 * - Works in noisy environments (call center grade)
 * - Turkish language accuracy is significantly better
 * - No dependency on Chrome/Google's servers
 * - GDPR/data sovereignty compliance
 *
 * Model: nova-2 (best price/performance for Turkish)
 * Latency: ~300-500ms for typical utterances
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/utils/error-handler';
import { metricsLogger } from '@/lib/billing/metrics-logger';
import { sessionRegistry } from '@/lib/voice/session-registry';
import { deepgramCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const DEEPGRAM_STT_URL = 'https://api.deepgram.com/v1/listen';

// =============================================
// Deepgram STT Configuration
// =============================================

interface DeepgramConfig {
    model: string;
    language: string;
    smart_format: boolean;
    punctuate: boolean;
    utterances: boolean;
    detect_language: boolean;
    diarize: boolean;
}

const DEFAULT_CONFIG: DeepgramConfig = {
    model: 'nova-2',         // Best price/performance
    language: 'tr',           // Turkish primary
    smart_format: true,       // Intelligent formatting
    punctuate: true,          // Add punctuation
    utterances: true,         // Split into utterances
    detect_language: false,   // We know the language
    diarize: false,           // Single speaker (phone call)
};

// =============================================
// POST: Transcribe Audio
// =============================================

export async function POST(request: NextRequest) {
    // Require tenant authentication
    const tenantId = request.headers.get('x-user-tenant');
    if (!tenantId) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!DEEPGRAM_API_KEY) {
        return NextResponse.json(
            { error: 'Deepgram API key not configured', fallback: 'browser' },
            { status: 503 },
        );
    }

    // Fast-fail if circuit breaker is open
    if (deepgramCircuitBreaker.isOpen()) {
        return NextResponse.json(
            {
                error: 'Deepgram STT circuit breaker is open',
                fallback: 'browser',
                stats: deepgramCircuitBreaker.getStats(),
            },
            { status: 503 },
        );
    }

    try {
        const contentType = request.headers.get('content-type') || '';

        let audioBuffer: ArrayBuffer;
        let language = 'tr';
        let mimeType = 'audio/webm';

        if (contentType.includes('multipart/form-data')) {
            // FormData with audio file + metadata
            const formData = await request.formData();
            const audioFile = formData.get('audio') as File | null;
            language = (formData.get('language') as string) || 'tr';

            if (!audioFile) {
                return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
            }

            audioBuffer = await audioFile.arrayBuffer();
            mimeType = audioFile.type || 'audio/webm';
        } else if (contentType.includes('audio/')) {
            // Raw audio stream
            audioBuffer = await request.arrayBuffer();
            mimeType = contentType;
            language = request.headers.get('x-language') || 'tr';
        } else {
            return NextResponse.json(
                { error: 'Expected multipart/form-data or audio/* content type' },
                { status: 400 },
            );
        }

        if (audioBuffer.byteLength === 0) {
            return NextResponse.json({ error: 'Empty audio data' }, { status: 400 });
        }

        // Build Deepgram query params
        const params = new URLSearchParams({
            model: DEFAULT_CONFIG.model,
            language,
            smart_format: String(DEFAULT_CONFIG.smart_format),
            punctuate: String(DEFAULT_CONFIG.punctuate),
            utterances: String(DEFAULT_CONFIG.utterances),
            detect_language: String(DEFAULT_CONFIG.detect_language),
            diarize: String(DEFAULT_CONFIG.diarize),
        });

        const startMs = performance.now();

        // Send to Deepgram (wrapped with circuit breaker)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try {
            data = await deepgramCircuitBreaker.execute(async () => {
                const response = await fetch(`${DEEPGRAM_STT_URL}?${params.toString()}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                        'Content-Type': mimeType,
                    },
                    body: audioBuffer,
                    signal: AbortSignal.timeout(15000), // 15s timeout
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    throw new Error(`Deepgram STT error ${response.status}: ${errorText}`);
                }

                return response.json();
            });
        } catch (err) {
            if (err instanceof CircuitOpenError) {
                return NextResponse.json(
                    { error: 'Deepgram STT circuit breaker is open', fallback: 'browser', stats: deepgramCircuitBreaker.getStats() },
                    { status: 503 },
                );
            }
            console.error(`[STT:Deepgram] Request failed:`, err);
            return NextResponse.json(
                {
                    error: `Deepgram STT error: ${err instanceof Error ? err.message : 'unknown'}`,
                    fallback: 'browser',
                },
                { status: 502 },
            );
        }

        const latencyMs = Math.round(performance.now() - startMs);

        // ---- Fire-and-forget: Log STT metric ----
        const sttSessionId = request.headers.get('x-session-id') || '';
        const sttTenantId = sttSessionId
            ? (sessionRegistry.getTenant(sttSessionId) || 'default')
            : 'default';

        if (sttTenantId !== 'default') {
            metricsLogger.logSttMetric(sttTenantId, latencyMs, 'deepgram', sttSessionId);
        }

        // Extract transcript from Deepgram response
        const channel = data.results?.channels?.[0];
        const alternatives = channel?.alternatives || [];
        const bestAlt = alternatives[0];

        if (!bestAlt || !bestAlt.transcript) {
            return NextResponse.json({
                success: true,
                transcript: '',
                confidence: 0,
                words: [],
                latencyMs,
                provider: 'deepgram-nova-2',
                isEmpty: true,
            });
        }

        // Build response with word-level detail
        const words = (bestAlt.words || []).map((w: { word: string; start: number; end: number; confidence: number }) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
        }));

        // Extract utterances if available
        const utterances = (data.results?.utterances || []).map((u: { transcript: string; confidence: number; start: number; end: number }) => ({
            text: u.transcript,
            confidence: u.confidence,
            start: u.start,
            end: u.end,
        }));

        return NextResponse.json({
            success: true,
            transcript: bestAlt.transcript,
            confidence: bestAlt.confidence || 0,
            words,
            utterances,
            language: data.results?.channels?.[0]?.detected_language || language,
            latencyMs,
            provider: 'deepgram-nova-2',
            isEmpty: false,
        });

    } catch (error) {
        return handleApiError(error, 'VoiceSTT');
    }
}

// =============================================
// GET: STT Provider Status
// =============================================

export async function GET() {
    return NextResponse.json({
        provider: 'deepgram',
        model: DEFAULT_CONFIG.model,
        configured: !!DEEPGRAM_API_KEY,
        languages: ['tr', 'en'],
        features: {
            smart_format: true,
            punctuation: true,
            utterances: true,
            word_timestamps: true,
        },
        usage: {
            endpoint: 'POST /api/voice/stt',
            content_types: ['multipart/form-data', 'audio/webm', 'audio/wav', 'audio/mp3'],
            max_duration: '60s recommended',
        },
    });
}
