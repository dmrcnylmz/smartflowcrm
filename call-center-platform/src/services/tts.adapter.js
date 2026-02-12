/**
 * TTS Adapter — Phase 7 Real-Time Voice Streaming
 * 
 * Text-to-Speech adapter with provider abstraction.
 * - Local engine: returns browser TTS payload (client-side synthesis)
 * - ElevenLabs engine: real streaming TTS when ELEVENLABS_API_KEY is set
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'tts' });

// ─── Local TTS Engine (Browser-side synthesis) ───────────

class LocalTtsEngine {
    /**
     * Generate a TTS payload for client-side synthesis.
     * Returns a JSON instruction for the browser's SpeechSynthesis API.
     */
    async synthesize(text, voice = 'default') {
        const timer = logger.startTimer('tts_local_synthesize');

        // Generate client-side TTS instruction
        const payload = {
            type: 'browser_tts',
            text,
            voice,
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0
        };

        const elapsed = timer.end();
        metrics.observe('tts_latency_ms', elapsed);
        metrics.inc('tts_synthesize_total', { provider: 'local' });

        return payload;
    }
}

// ─── ElevenLabs TTS Engine ───────────────────────────────

class ElevenLabsTtsEngine {
    constructor(apiKey) {
        this._apiKey = apiKey;
        this._defaultVoice = 'pNInz6obpgDQGcFmaJgB'; // Adam voice
        logger.info('ElevenLabs TTS engine initialized');
    }

    async synthesize(text, voice) {
        const timer = logger.startTimer('tts_elevenlabs_synthesize');
        const voiceId = voice || this._defaultVoice;

        try {
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
                {
                    method: 'POST',
                    headers: {
                        'xi-api-key': this._apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg'
                    },
                    body: JSON.stringify({
                        text,
                        model_id: 'eleven_turbo_v2',
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75,
                            speed: 1.0
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`ElevenLabs error: ${response.status}`);
            }

            const audioBuffer = await response.arrayBuffer();
            const elapsed = timer.end();
            metrics.observe('tts_latency_ms', elapsed);
            metrics.inc('tts_synthesize_total', { provider: 'elevenlabs' });

            return {
                type: 'audio',
                format: 'mp3',
                data: Buffer.from(audioBuffer).toString('base64'),
                durationEstimate: Math.ceil(text.split(' ').length / 3) // ~3 words/sec
            };
        } catch (e) {
            logger.error('ElevenLabs synthesis failed', { error: e.message });
            // Fallback to browser TTS
            const fallback = new LocalTtsEngine();
            return fallback.synthesize(text, voice);
        }
    }
}

// ─── Unified TTS Adapter ─────────────────────────────────

class TtsAdapter {
    constructor() {
        this._engine = process.env.ELEVENLABS_API_KEY
            ? new ElevenLabsTtsEngine(process.env.ELEVENLABS_API_KEY)
            : new LocalTtsEngine();

        this._provider = process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'local';
        logger.info('TTS adapter initialized', { provider: this._provider });
    }

    get provider() { return this._provider; }

    /**
     * Synthesize text to speech.
     * @param {string} text - Text to speak
     * @param {string} voice - Voice ID (provider-specific)
     * @returns {Promise<{type: string, ...}>} Audio payload or browser TTS instruction
     */
    async synthesize(text, voice) {
        return this._engine.synthesize(text, voice);
    }
}

module.exports = new TtsAdapter();
