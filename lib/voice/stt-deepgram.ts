/**
 * Deepgram Nova-3 Streaming STT Provider
 *
 * Turkish-optimized, ultra-low latency speech-to-text.
 * Emits partial transcripts immediately — NEVER waits for sentence completion.
 *
 * Key config:
 * - interim_results = true (partial words as they arrive)
 * - endpointing = 250ms (aggressive silence detection)
 * - model = nova-3 (best Turkish accuracy)
 */

import { EventEmitter } from 'events';

// --- Types ---

export interface STTConfig {
    apiKey: string;
    language?: string;
    sampleRate?: number;
    encoding?: string;
    endpointing?: number;
    model?: string;
}

export interface TranscriptEvent {
    text: string;
    isFinal: boolean;
    confidence: number;
    words: Array<{ word: string; start: number; end: number; confidence: number }>;
    speechFinal: boolean;
}

// --- Default Config ---

const DEFAULT_CONFIG: Partial<STTConfig> = {
    language: 'tr',
    sampleRate: 16000,
    encoding: 'linear16',
    endpointing: 250,
    model: 'nova-3',
};

// WebSocket.OPEN constant — works across browser and Node.js ws package
const WS_OPEN = 1;

// --- Deepgram Streaming STT ---

export class DeepgramSTT extends EventEmitter {
    private ws: WebSocket | null = null;
    private config: Required<STTConfig>;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;
    private isClosing = false;
    private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

    constructor(config: STTConfig) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config } as Required<STTConfig>;
    }

    /**
     * Connect to Deepgram's live transcription WebSocket.
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const params = new URLSearchParams({
                model: this.config.model,
                language: this.config.language,
                encoding: this.config.encoding,
                sample_rate: this.config.sampleRate.toString(),
                channels: '1',
                interim_results: 'true',
                endpointing: this.config.endpointing.toString(),
                punctuate: 'false',
                smart_format: 'false',
                utterance_end_ms: '1000',
            });

            const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

            try {
                // Use native WebSocket or ws package
                const WS = typeof globalThis.WebSocket !== 'undefined'
                    ? globalThis.WebSocket
                    : require('ws');

                this.ws = new WS(url, {
                    headers: { Authorization: `Token ${this.config.apiKey}` },
                });

                this.ws!.onopen = () => {
                    this.reconnectAttempts = 0;
                    this.startKeepAlive();
                    this.emit('connected');
                    resolve();
                };

                this.ws!.onmessage = (event: MessageEvent | { data: string }) => {
                    try {
                        const data = typeof event.data === 'string'
                            ? JSON.parse(event.data)
                            : JSON.parse(event.data.toString());

                        this.handleMessage(data);
                    } catch {
                        // Ignore non-JSON messages
                    }
                };

                this.ws!.onerror = (err: Event | Error) => {
                    const error = err instanceof Error ? err : new Error('WebSocket error');
                    this.emit('error', error);
                    if (this.reconnectAttempts === 0) reject(error);
                };

                this.ws!.onclose = () => {
                    this.stopKeepAlive();
                    this.emit('disconnected');

                    if (!this.isClosing && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
                        setTimeout(() => this.connect().catch(() => { }), delay);
                    }
                };
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Handle incoming Deepgram messages.
     */
    private handleMessage(data: Record<string, unknown>): void {
        if (data.type === 'Results') {
            const channel = (data.channel as Record<string, unknown>)?.alternatives as Array<Record<string, unknown>>;
            if (!channel || channel.length === 0) return;

            const alt = channel[0];
            const transcript = (alt.transcript as string || '').trim();

            if (!transcript) return;

            const event: TranscriptEvent = {
                text: transcript,
                isFinal: data.is_final as boolean || false,
                confidence: alt.confidence as number || 0,
                words: (alt.words as TranscriptEvent['words']) || [],
                speechFinal: data.speech_final as boolean || false,
            };

            if (event.isFinal) {
                this.emit('final', event);
            } else {
                this.emit('partial', event);
            }
        } else if (data.type === 'UtteranceEnd') {
            this.emit('utteranceEnd');
        }
    }

    /**
     * Send raw audio data to Deepgram.
     * Accepts PCM Int16 audio at configured sample rate.
     */
    sendAudio(chunk: Buffer | ArrayBuffer): void {
        if (!this.ws || this.ws.readyState !== WS_OPEN) return; // OPEN = 1
        this.ws.send(chunk);
    }

    /**
     * Keep WebSocket alive during silent periods.
     */
    private startKeepAlive(): void {
        this.keepAliveInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WS_OPEN) {
                this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
            }
        }, 8000);
    }

    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    /**
     * Gracefully close the connection.
     */
    async close(): Promise<void> {
        this.isClosing = true;
        this.stopKeepAlive();

        if (this.ws && this.ws.readyState === WS_OPEN) {
            // Send close signal per Deepgram protocol
            this.ws.send(JSON.stringify({ type: 'CloseStream' }));
            this.ws.close();
        }

        this.ws = null;
        this.removeAllListeners();
    }

    /**
     * Check if connected and ready to receive audio.
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WS_OPEN;
    }
}
