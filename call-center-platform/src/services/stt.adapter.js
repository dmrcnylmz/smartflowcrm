/**
 * STT Adapter — Phase 7 Real-Time Voice Streaming
 * 
 * Speech-to-Text adapter with provider abstraction.
 * - Local engine: keyword extraction from audio metadata (demo mode)
 * - Deepgram engine: real streaming STT when DEEPGRAM_API_KEY is set
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'stt' });

class LocalSttEngine {
    constructor() {
        this._buffer = '';
        this._wordBank = [
            'hello', 'hi', 'I need help', 'billing issue', 'my account',
            'cancel', 'refund', 'speak to someone', 'appointment',
            'pricing', 'upgrade', 'downgrade', 'complaint', 'thank you',
            'not working', 'broken', 'when will', 'how do I', 'transfer me',
            'I want to cancel', 'charge on my account', 'delivery status'
        ];
        this._sentenceTemplates = [
            'Hi, I need help with {topic}.',
            'I have a question about my {topic}.',
            'Can you help me with {topic}?',
            'I want to {action} my {topic}.',
            'There is a problem with my {topic}.',
            'I would like to speak to someone about {topic}.'
        ];
        this._topics = ['account', 'billing', 'subscription', 'order', 'delivery', 'service', 'product'];
        this._actions = ['check', 'update', 'cancel', 'change', 'review'];
    }

    createStream(onPartial, onFinal) {
        let chunkCount = 0;
        let pendingSentence = '';

        return {
            feed: (audioChunk) => {
                chunkCount++;
                const timer = logger.startTimer('stt_local_chunk');

                // Simulate progressive transcription based on audio chunks
                if (chunkCount % 3 === 0) {
                    const word = this._wordBank[chunkCount % this._wordBank.length];
                    pendingSentence += (pendingSentence ? ' ' : '') + word;
                    onPartial(pendingSentence);
                }

                if (chunkCount % 8 === 0 && pendingSentence) {
                    const finalText = pendingSentence;
                    pendingSentence = '';
                    onFinal(finalText);
                    timer.end();
                    metrics.observe('stt_latency_ms', timer.end());
                    return finalText;
                }

                timer.end();
                return null;
            },
            flush: () => {
                if (pendingSentence) {
                    const finalText = pendingSentence;
                    pendingSentence = '';
                    onFinal(finalText);
                    return finalText;
                }
                return null;
            },
            generateDemoSentence: () => {
                const template = this._sentenceTemplates[Math.floor(Math.random() * this._sentenceTemplates.length)];
                const topic = this._topics[Math.floor(Math.random() * this._topics.length)];
                const action = this._actions[Math.floor(Math.random() * this._actions.length)];
                return template.replace('{topic}', topic).replace('{action}', action);
            }
        };
    }
}

class DeepgramSttEngine {
    constructor(apiKey) {
        this._apiKey = apiKey;
        logger.info('Deepgram STT engine initialized');
    }

    createStream(onPartial, onFinal) {
        // Real Deepgram streaming would use their WebSocket API
        // This is the integration point for @deepgram/sdk
        let ws = null;

        const connect = async () => {
            try {
                const WebSocket = require('ws');
                ws = new WebSocket('wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1', {
                    headers: { 'Authorization': `Token ${this._apiKey}` }
                });

                ws.on('message', (data) => {
                    try {
                        const result = JSON.parse(data.toString());
                        if (result.channel?.alternatives?.[0]) {
                            const transcript = result.channel.alternatives[0].transcript;
                            if (transcript) {
                                if (result.is_final) {
                                    onFinal(transcript);
                                    metrics.observe('stt_latency_ms', result.duration * 1000);
                                } else {
                                    onPartial(transcript);
                                }
                            }
                        }
                    } catch (e) {
                        logger.error('Deepgram parse error', { error: e.message });
                    }
                });

                ws.on('error', (err) => {
                    logger.error('Deepgram WS error', { error: err.message });
                });
            } catch (e) {
                logger.error('Deepgram connection failed', { error: e.message });
            }
        };

        connect();

        return {
            feed: (audioChunk) => {
                if (ws && ws.readyState === 1) {
                    ws.send(Buffer.from(audioChunk, 'base64'));
                }
                return null;
            },
            flush: () => {
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'CloseStream' }));
                }
                return null;
            },
            close: () => {
                if (ws) ws.close();
            }
        };
    }
}

class SttAdapter {
    constructor() {
        this._engine = process.env.DEEPGRAM_API_KEY
            ? new DeepgramSttEngine(process.env.DEEPGRAM_API_KEY)
            : new LocalSttEngine();

        this._provider = process.env.DEEPGRAM_API_KEY ? 'deepgram' : 'local';
        logger.info('STT adapter initialized', { provider: this._provider });
    }

    get provider() { return this._provider; }

    createStream(onPartial, onFinal) {
        metrics.inc('stt_streams_created', { provider: this._provider });
        return this._engine.createStream(onPartial, onFinal);
    }
}

module.exports = new SttAdapter();
