// Personaplex TypeScript Client
// Connects to the Personaplex voice AI server

export interface PersonaplexConfig {
    serverUrl: string;
    voicePrompt?: string;
    rolePrompt?: string;
}

export interface VoiceSession {
    sessionId: string;
    persona: string;
    createdAt: Date;
}

export interface SessionSummary {
    session_id: string;
    duration_seconds: number;
    persona: string;
    transcript: TranscriptTurn[];
    metrics: {
        turn_count: number;
        avg_latency_ms: number;
    };
}

export interface TranscriptTurn {
    speaker: 'user' | 'assistant';
    text: string;
    timestamp: string;
}

export interface PersonaplexStatus {
    status: string;
    model_loaded: boolean;
    cuda_available: boolean;
    active_sessions: number;
    config: {
        model: string;
        device: string;
        cpu_offload: boolean;
    };
}

export interface PersonaInfo {
    id: string;
    name: string;
    style: string;
}

const DEFAULT_SERVER_URL = 'http://localhost:8998';

/**
 * Check if Personaplex server is available
 */
export async function isPersonaplexAvailable(serverUrl: string = DEFAULT_SERVER_URL): Promise<boolean> {
    try {
        const response = await fetch(`${serverUrl}/status`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Get Personaplex server status
 */
export async function getPersonaplexStatus(serverUrl: string = DEFAULT_SERVER_URL): Promise<PersonaplexStatus | null> {
    try {
        const response = await fetch(`${serverUrl}/status`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Get available personas
 */
export async function getPersonas(serverUrl: string = DEFAULT_SERVER_URL): Promise<PersonaInfo[]> {
    try {
        const response = await fetch(`${serverUrl}/personas`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.personas || [];
    } catch {
        return [];
    }
}

/**
 * Personaplex Voice Client
 * Manages WebSocket connection and audio streaming
 */
export class PersonaplexClient {
    private ws: WebSocket | null = null;
    private config: PersonaplexConfig;
    private session: VoiceSession | null = null;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioProcessor: ScriptProcessorNode | null = null;

    // Event handlers
    public onSessionStarted?: (session: VoiceSession) => void;
    public onSessionEnded?: (summary: SessionSummary) => void;
    public onTranscriptUpdate?: (turn: TranscriptTurn) => void;
    public onAudioReceived?: (audio: ArrayBuffer) => void;
    public onError?: (error: Error) => void;
    public onConnectionChange?: (connected: boolean) => void;

    constructor(config: PersonaplexConfig) {
        this.config = config;
    }

    /**
     * Connect to Personaplex server
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const wsUrl = this.config.serverUrl.replace(/^http/, 'ws') + '/ws';

            try {
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('[Personaplex] Connected to server');
                    this.onConnectionChange?.(true);
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    if (typeof event.data === 'string') {
                        this.handleTextMessage(JSON.parse(event.data));
                    } else if (event.data instanceof Blob) {
                        event.data.arrayBuffer().then(buffer => {
                            this.onAudioReceived?.(buffer);
                        });
                    }
                };

                this.ws.onerror = (event) => {
                    console.error('[Personaplex] WebSocket error:', event);
                    this.onError?.(new Error('WebSocket connection error'));
                    reject(new Error('WebSocket connection error'));
                };

                this.ws.onclose = () => {
                    console.log('[Personaplex] Disconnected from server');
                    this.onConnectionChange?.(false);
                    this.cleanup();
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    private handleTextMessage(data: Record<string, unknown>) {
        switch (data.type) {
            case 'session_started':
                this.session = {
                    sessionId: data.session_id as string,
                    persona: data.persona as string,
                    createdAt: new Date(),
                };
                this.onSessionStarted?.(this.session);
                break;

            case 'session_ended':
                this.onSessionEnded?.(data.summary as SessionSummary);
                this.session = null;
                break;

            case 'transcript_update':
                this.onTranscriptUpdate?.(data.turn as TranscriptTurn);
                break;
        }
    }

    /**
     * Start a voice session with optional persona
     */
    startSession(persona: string = 'default'): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.onError?.(new Error('Not connected to server'));
            return;
        }

        this.ws.send(JSON.stringify({
            action: 'start_session',
            persona,
        }));
    }

    /**
     * End the current voice session
     */
    endSession(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            action: 'end_session',
        }));

        this.stopAudioCapture();
    }

    /**
     * Start capturing audio from microphone
     */
    async startAudioCapture(): Promise<void> {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            this.audioContext = new AudioContext({ sampleRate: 24000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Use ScriptProcessor for audio chunks (deprecated but widely supported)
            // In production, use AudioWorklet for better performance
            this.audioProcessor = this.audioContext.createScriptProcessor(480, 1, 1);

            this.audioProcessor.onaudioprocess = (event) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                const inputData = event.inputBuffer.getChannelData(0);
                const audioData = new Float32Array(inputData);

                // Convert to Int16 for transmission
                const int16Data = new Int16Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    int16Data[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
                }

                this.ws.send(int16Data.buffer);
            };

            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext.destination);

            console.log('[Personaplex] Audio capture started');

        } catch (error) {
            console.error('[Personaplex] Failed to start audio capture:', error);
            this.onError?.(error instanceof Error ? error : new Error('Audio capture failed'));
        }
    }

    /**
     * Stop audio capture
     */
    stopAudioCapture(): void {
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        console.log('[Personaplex] Audio capture stopped');
    }

    /**
     * Send transcript update
     */
    sendTranscriptUpdate(text: string, speaker: 'user' | 'assistant' = 'user'): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            action: 'transcript_update',
            text,
            speaker,
        }));
    }

    /**
     * Disconnect and cleanup
     */
    disconnect(): void {
        this.stopAudioCapture();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.session = null;
    }

    private cleanup(): void {
        this.stopAudioCapture();
        this.ws = null;
        this.session = null;
    }

    /**
     * Check if currently connected
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get current session
     */
    getSession(): VoiceSession | null {
        return this.session;
    }
}
