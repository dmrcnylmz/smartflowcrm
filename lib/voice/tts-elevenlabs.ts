/**
 * ElevenLabs Flash v2.5 Streaming TTS Provider
 *
 * Ultra-low latency text-to-speech via WebSocket streaming.
 * First audio chunk target: <80ms from first text input.
 *
 * Key design:
 * - Accepts LLM token stream directly
 * - Flushes on sentence boundaries (. ? ! ,) for immediate audio
 * - Per-tenant voice selection
 */

// --- Types ---

export interface TTSConfig {
    apiKey: string;
    voiceId?: string;
    modelId?: string;
    outputFormat?: string;
    sampleRate?: number;
    optimizeLatency?: number;
}

export interface TTSStreamOptions {
    voiceId?: string;
    language?: string;
}

// --- Constants ---

const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - professional female
const DEFAULT_MODEL = 'eleven_flash_v2_5';
const DEFAULT_FORMAT = 'pcm_16000'; // 16kHz PCM for phone quality

// Sentence boundary chars — flush TTS buffer on these
const FLUSH_CHARS = new Set(['.', '?', '!', ':', ';']);
const SOFT_FLUSH_CHARS = new Set([',', '—', '–']);
const MIN_FLUSH_LENGTH = 8; // Don't flush on very short fragments

// --- ElevenLabs Streaming TTS ---

export class ElevenLabsTTS {
    private config: Required<TTSConfig>;

    constructor(config: TTSConfig) {
        this.config = {
            apiKey: config.apiKey,
            voiceId: config.voiceId || DEFAULT_VOICE_ID,
            modelId: config.modelId || DEFAULT_MODEL,
            outputFormat: config.outputFormat || DEFAULT_FORMAT,
            sampleRate: config.sampleRate || 16000,
            optimizeLatency: config.optimizeLatency || 4, // max optimization
        };
    }

    /**
     * Stream text to speech via HTTP streaming API.
     * Returns async generator yielding PCM audio chunks.
     *
     * Use this for complete text or when WebSocket is not needed.
     */
    async *streamText(text: string, options?: TTSStreamOptions): AsyncGenerator<Buffer> {
        const voiceId = options?.voiceId || this.config.voiceId;

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'xi-api-key': this.config.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'audio/pcm',
            },
            body: JSON.stringify({
                text,
                model_id: this.config.modelId,
                output_format: this.config.outputFormat,
                optimize_streaming_latency: this.config.optimizeLatency,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                },
            }),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => 'Unknown error');
            throw new Error(`ElevenLabs TTS error ${response.status}: ${err}`);
        }

        if (!response.body) {
            throw new Error('No response body from ElevenLabs');
        }

        // Stream audio chunks from response
        const reader = response.body.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.length > 0) {
                    yield Buffer.from(value);
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Stream LLM tokens directly to TTS.
     * Buffers tokens and flushes on sentence boundaries.
     * Yields audio chunks as they become available.
     *
     * This is the PRIMARY method for the voice pipeline.
     */
    async *streamTokens(
        tokens: AsyncIterable<string>,
        options?: TTSStreamOptions
    ): AsyncGenerator<Buffer> {
        let buffer = '';

        for await (const token of tokens) {
            buffer += token;

            // Check for sentence boundary to flush
            const lastChar = buffer.trim().slice(-1);
            const shouldFlush = FLUSH_CHARS.has(lastChar) && buffer.trim().length >= MIN_FLUSH_LENGTH;
            const shouldSoftFlush = SOFT_FLUSH_CHARS.has(lastChar) && buffer.trim().length >= MIN_FLUSH_LENGTH * 2;

            if (shouldFlush || shouldSoftFlush) {
                const textToSpeak = buffer.trim();
                buffer = '';

                if (textToSpeak.length > 0) {
                    yield* this.streamText(textToSpeak, options);
                }
            }
        }

        // Flush remaining buffer
        const remaining = buffer.trim();
        if (remaining.length > 0) {
            yield* this.streamText(remaining, options);
        }
    }

    /**
     * Simple single-shot TTS — for pre-cached phrases.
     * Returns complete audio buffer.
     */
    async synthesize(text: string, options?: TTSStreamOptions): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of this.streamText(text, options)) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }

    /**
     * Pre-cache common phrases for instant playback.
     * Returns Map of phrase → audio buffer.
     */
    async preCachePhrases(phrases: string[], options?: TTSStreamOptions): Promise<Map<string, Buffer>> {
        const cache = new Map<string, Buffer>();

        await Promise.all(
            phrases.map(async (phrase) => {
                try {
                    const audio = await this.synthesize(phrase, options);
                    cache.set(phrase, audio);
                } catch (err) {
                    console.error(`Failed to cache phrase "${phrase}":`, err);
                }
            })
        );

        return cache;
    }
}

// --- Common pre-cached Turkish phrases ---

export const TURKISH_FILLER_PHRASES = [
    'Bir saniye bakıyorum.',
    'Hemen kontrol ediyorum.',
    'Anlıyorum, size yardımcı olayım.',
    'Tabii, hemen bakıyorum.',
    'Bu konuda sizi bilgilendireyim.',
    'Sizi yetkili birime bağlıyorum.',
];

export const ENGLISH_FILLER_PHRASES = [
    'One moment please.',
    'Let me check that for you.',
    'I understand, let me help you with that.',
    'Sure, let me look into that.',
];
