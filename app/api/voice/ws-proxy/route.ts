// Voice WebSocket Proxy via HTTP Streaming
// Since RunPod proxy doesn't support WebSocket from browser,
// we use a server-side proxy: Browser <-> Next.js API (HTTP) <-> RunPod (WebSocket)

import { NextRequest, NextResponse } from 'next/server';

const PERSONAPLEX_URL = process.env.PERSONAPLEX_URL || 'http://localhost:8998';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';

// POST: Send audio/commands to the voice session via HTTP
export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') || '';
        const sessionId = request.headers.get('x-session-id') || '';

        if (contentType.includes('application/json')) {
            // JSON command (start_session, end_session, etc.)
            const body = await request.json();

            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            };
            if (PERSONAPLEX_API_KEY) {
                headers['X-API-Key'] = PERSONAPLEX_API_KEY;
            }
            if (sessionId) {
                headers['X-Session-Id'] = sessionId;
            }

            const response = await fetch(`${PERSONAPLEX_URL}/api/voice/command`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            const data = await response.json();
            return NextResponse.json(data);

        } else {
            // Binary audio data
            const audioBuffer = await request.arrayBuffer();

            const headers: HeadersInit = {
                'Content-Type': 'application/octet-stream',
            };
            if (PERSONAPLEX_API_KEY) {
                headers['X-API-Key'] = PERSONAPLEX_API_KEY;
            }
            if (sessionId) {
                headers['X-Session-Id'] = sessionId;
            }

            const response = await fetch(`${PERSONAPLEX_URL}/api/voice/audio`, {
                method: 'POST',
                headers,
                body: audioBuffer,
            });

            if (response.headers.get('content-type')?.includes('application/octet-stream')) {
                const responseAudio = await response.arrayBuffer();
                return new NextResponse(responseAudio, {
                    headers: { 'Content-Type': 'application/octet-stream' },
                });
            }

            const data = await response.json();
            return NextResponse.json(data);
        }
    } catch (error) {
        console.error('[WS Proxy] Error:', error);
        return NextResponse.json(
            { error: 'Voice proxy error', details: String(error) },
            { status: 500 }
        );
    }
}
