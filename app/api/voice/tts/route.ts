// ElevenLabs TTS API Proxy
// Browser → Next.js API → ElevenLabs → Audio stream back to browser
// This enables ElevenLabs audio playback in the browser without exposing API keys

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/utils/error-handler';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

// Default voice: Turkish Female — can be overridden per request
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah

export async function POST(request: NextRequest) {
    if (!ELEVENLABS_API_KEY) {
        return NextResponse.json(
            { error: 'ElevenLabs API key not configured' },
            { status: 500 },
        );
    }

    try {
        const body = await request.json();
        const {
            text,
            voice_id = DEFAULT_VOICE_ID,
            model_id = 'eleven_flash_v2_5',
        } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // ElevenLabs TTS request initiated

        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify({
                    text,
                    model_id,
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                }),
            },
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[TTS] ElevenLabs error: ${response.status} ${errorText}`);
            return NextResponse.json(
                { error: `ElevenLabs TTS error: ${response.status}` },
                { status: response.status },
            );
        }

        if (!response.body) {
            return NextResponse.json(
                { error: 'No audio stream from ElevenLabs' },
                { status: 502 },
            );
        }

        // Stream the audio back with correct headers
        return new NextResponse(response.body as unknown as BodyInit, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        return handleApiError(error, 'VoiceTTS');
    }
}
