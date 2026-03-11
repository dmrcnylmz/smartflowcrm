/**
 * Google Gemini TTS Provider — Gemini 2.5 Flash TTS
 *
 * Google'ın en üst segment ses sentezi. Chirp3-HD'den daha doğal ve ifade edici.
 * generativelanguage.googleapis.com API'sini kullanır.
 *
 * Auth: GOOGLE_AI_API_KEY env var
 * Voices: Kore, Leda, Charon, Aoede, Fenrir, Orus, Puck, Zephyr vb.
 * Output: PCM 24kHz 16-bit mono → WAV dönüştürme
 * Pricing: ~$10-20/1M audio token (token bazlı)
 */

// =============================================
// Configuration
// =============================================

const GEMINI_TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

function getGeminiApiKey(): string | null {
    return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || null;
}

// =============================================
// PCM → WAV Conversion
// =============================================

/**
 * PCM 24kHz 16-bit mono verisine WAV header ekler.
 * Browser Audio API'nin doğrudan çalabilmesi için gerekli.
 */
function pcmToWav(pcmBuffer: Buffer): Buffer {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const headerSize = 44;

    const wav = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);

    // fmt sub-chunk
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);         // Sub-chunk size
    wav.writeUInt16LE(1, 20);          // PCM format
    wav.writeUInt16LE(numChannels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);
    pcmBuffer.copy(wav, headerSize);

    return wav;
}

// =============================================
// Synthesize Function
// =============================================

/**
 * Gemini TTS ile ses sentezi yapar.
 * Returns a Response with audio/wav body, or null on failure.
 */
export async function synthesizeGeminiTTS(
    text: string,
    _lang: 'tr' | 'en',
    voiceName: string = 'Kore',
): Promise<Response | null> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        console.warn('[TTS:Gemini] No API key found (GOOGLE_AI_API_KEY or GEMINI_API_KEY)');
        return null;
    }

    try {
        const response = await fetch(`${GEMINI_TTS_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text }],
                }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName },
                        },
                    },
                },
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            console.error(`[TTS:Gemini] API error ${response.status}:`, err);
            return null;
        }

        const data = await response.json();

        // Extract audio data from response
        const candidates = data.candidates;
        if (!candidates || candidates.length === 0) {
            console.error('[TTS:Gemini] No candidates in response');
            return null;
        }

        const parts = candidates[0]?.content?.parts;
        if (!parts || parts.length === 0) {
            console.error('[TTS:Gemini] No parts in response');
            return null;
        }

        // Find the audio part (inlineData with audio mime type)
        const audioPart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) =>
            p.inlineData?.mimeType?.startsWith('audio/')
        );

        if (!audioPart?.inlineData?.data) {
            console.error('[TTS:Gemini] No audio data in response');
            return null;
        }

        // Decode base64 PCM data
        const pcmBuffer = Buffer.from(audioPart.inlineData.data, 'base64');

        // Convert PCM to WAV for browser playback
        const wavBuffer = pcmToWav(pcmBuffer);

        return new Response(wavBuffer, {
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': String(wavBuffer.length),
            },
        });
    } catch (err) {
        console.error('[TTS:Gemini] Request failed:', err);
        return null;
    }
}
