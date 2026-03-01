// Personaplex HTTP Client v2
// Uses Web Speech API + HTTP /infer endpoint for full voice AI loop
// Browser STT → Personaplex Intent/Response → Browser TTS

import { logger } from '@/lib/utils/logger';

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
        const response = await fetch('/api/voice/health', {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 'healthy' || data.personaplex === true;
    } catch {
        return false;
    }
}

/**
 * Get Personaplex server status
 */
export async function getPersonaplexStatus(serverUrl: string = DEFAULT_SERVER_URL): Promise<PersonaplexStatus | null> {
    try {
        const response = await fetch('/api/voice/health');
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

// ============================================
// Speech Recognition (STT) Helper
// ============================================

interface SpeechRecognitionResult {
    transcript: string;
    confidence: number;
    isFinal: boolean;
}

/** Minimal Web Speech API types — covers browser + webkit prefix */
interface SpeechRecognitionInstance {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}

interface SpeechRecognitionResultEvent {
    resultIndex: number;
    results: {
        length: number;
        [index: number]: {
            isFinal: boolean;
            length: number;
            [index: number]: { transcript: string; confidence: number };
        };
    };
}

interface SpeechRecognitionErrorEvent {
    error: string;
    message?: string;
}

/** Window with vendor-prefixed Speech Recognition API */
interface WindowWithSpeech extends Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

function createSpeechRecognition(): SpeechRecognitionInstance | null {
    const w = window as WindowWithSpeech;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
        console.warn('[Personaplex] Speech Recognition API not available');
        return null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'tr-TR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    return recognition;
}

// ============================================
// Text-to-Speech (TTS) Helper — ElevenLabs via API proxy
// ============================================

// ElevenLabs voice configuration
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - professional female
const TTS_API_URL = '/api/voice/tts';

async function speak(text: string, onEnd?: () => void): Promise<void> {
    try {
        // Try ElevenLabs first via server-side proxy
        logger.debug('[TTS] Requesting ElevenLabs audio...');
        const response = await fetch(TTS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice_id: ELEVENLABS_VOICE_ID,
            }),
        });

        if (!response.ok) {
            throw new Error(`TTS API error: ${response.status}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            logger.debug('[TTS] ElevenLabs playback complete');
            onEnd?.();
        };

        audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            console.error('[TTS] Audio playback error, falling back to browser TTS');
            speakBrowserFallback(text, onEnd);
        };

        await audio.play();
        logger.debug('[TTS] ElevenLabs playing audio');

    } catch (error) {
        console.warn('[TTS] ElevenLabs failed, using browser fallback:', error);
        speakBrowserFallback(text, onEnd);
    }
}

function speakBrowserFallback(text: string, onEnd?: () => void): void {
    if (!window.speechSynthesis) {
        console.warn('[TTS] Speech Synthesis not available');
        onEnd?.();
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const turkishVoice = voices.find(v => v.lang.startsWith('tr'));
    if (turkishVoice) {
        utterance.voice = turkishVoice;
    }

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
}

/**
 * Personaplex Voice Client
 * Full voice AI loop: Browser STT → GPU Intent/Response → Browser TTS
 */
export class PersonaplexClient {
    private config: PersonaplexConfig;
    private session: VoiceSession | null = null;
    private recognition: SpeechRecognitionInstance | null = null;
    private isListening: boolean = false;
    private isSpeaking: boolean = false;
    private inferUrl: string;
    private transcript: TranscriptTurn[] = [];
    private startTime: Date | null = null;
    private turnLatencies: number[] = [];

    // Keep these for compatibility
    private ws: WebSocket | null = null;
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
        // Use the /infer endpoint via our API proxy
        this.inferUrl = '/api/voice/infer';
    }

    /**
     * Connect to Personaplex server
     */
    async connect(): Promise<void> {
        try {
            // Verify server is reachable
            const healthRes = await fetch('/api/voice/health', {
                signal: AbortSignal.timeout(5000),
            });
            const healthData = await healthRes.json();

            if (healthData.status !== 'healthy' && !healthData.personaplex) {
                throw new Error('Personaplex sunucusu erişilemez');
            }

            logger.debug('[Personaplex] Server healthy, connecting...');

            // Create session
            this.startTime = new Date();
            this.session = {
                sessionId: `voice-${Date.now()}`,
                persona: 'default',
                createdAt: this.startTime,
            };

            this.onConnectionChange?.(true);
            this.onSessionStarted?.(this.session);

            logger.debug('[Personaplex] Connected via HTTP/Speech API mode');

        } catch (error) {
            console.error('[Personaplex] Connection error:', error);
            throw new Error('Bağlantı hatası: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * Start a voice session with optional persona
     */
    startSession(persona: string = 'default'): void {
        // Session already created in connect()
        if (this.session) {
            this.session.persona = persona;
        }
    }

    /**
     * Start capturing audio via Web Speech API
     */
    async startAudioCapture(): Promise<void> {
        try {
            // Check if mediaDevices is available (requires HTTPS or localhost)
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('[Personaplex] getUserMedia not available - requires HTTPS or localhost. Continuing without audio capture.');
                // Still set up speech recognition if available (it may work without explicit getUserMedia)
                this.setupSpeechRecognition();
                return;
            }

            // Request microphone permission (needed for Speech Recognition)
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            // Set up audio context for visualization
            this.audioContext = new AudioContext();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.audioProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

            this.audioProcessor.onaudioprocess = (event) => {
                // Just for visualization, no actual audio sending
                const inputData = event.inputBuffer.getChannelData(0);
                // onAudioReceived is used for visualization in the modal
            };

            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext.destination);

            // Set up Speech Recognition
            this.setupSpeechRecognition();

            logger.debug('[Personaplex] Audio capture started');

        } catch (error) {
            console.error('[Personaplex] Failed to start audio capture:', error);
            this.onError?.(error instanceof Error ? error : new Error('Ses yakalama başarısız'));
        }
    }

    /**
     * Set up Web Speech API recognition
     */
    private setupSpeechRecognition(): void {
        this.recognition = createSpeechRecognition();

        if (this.recognition) {
            let interimTranscript = '';
            let finalTranscriptTimeout: ReturnType<typeof setTimeout> | null = null;

            this.recognition.onresult = (event: SpeechRecognitionResultEvent) => {
                let finalText = '';
                let interimText = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalText += result[0].transcript;
                    } else {
                        interimText += result[0].transcript;
                    }
                }

                if (interimText && !finalText) {
                    // Don't show interim text while AI is speaking (echo prevention)
                    if (this.isSpeaking) return;

                    interimTranscript = interimText;
                    // Show interim text as user is speaking
                    this.onTranscriptUpdate?.({
                        speaker: 'user',
                        text: `${interimText}...`,
                        timestamp: new Date().toISOString(),
                    });
                }

                if (finalText) {
                    // Don't process user input while AI is speaking (echo prevention)
                    if (this.isSpeaking) {
                        logger.debug('[Personaplex] Ignoring echo during AI speech:', finalText.trim());
                        return;
                    }

                    // Clear any pending timeout
                    if (finalTranscriptTimeout) {
                        clearTimeout(finalTranscriptTimeout);
                    }

                    interimTranscript = '';

                    // Add to transcript
                    const userTurn: TranscriptTurn = {
                        speaker: 'user',
                        text: finalText.trim(),
                        timestamp: new Date().toISOString(),
                    };
                    this.transcript.push(userTurn);
                    this.onTranscriptUpdate?.(userTurn);

                    // Send to Personaplex for processing
                    this.processUserInput(finalText.trim());
                }
            };

            this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.error('[Personaplex] Speech recognition error:', event.error);
                }
            };

            this.recognition.onend = () => {
                // Auto-restart if still listening AND AI is not speaking
                if (this.isListening && this.recognition && !this.isSpeaking) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        // Ignore - might already be running
                    }
                }
            };

            this.recognition.start();
            this.isListening = true;
            logger.debug('[Personaplex] Speech recognition started (tr-TR)');
        } else {
            console.warn('[Personaplex] Speech Recognition not available, using fallback');
        }
    }

    /**
     * Process user text input through Personaplex /infer
     */
    private async processUserInput(text: string): Promise<void> {
        if (this.isSpeaking) return; // Don't process while AI is speaking

        const startMs = performance.now();

        try {
            logger.debug(`[Personaplex] Processing: "${text}"`);

            // Call Personaplex /infer via our API proxy
            const response = await fetch(this.inferUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    persona: this.session?.persona || 'default',
                    language: 'tr',
                    session_id: this.session?.sessionId || `browser-${Date.now()}`,
                }),
            });

            if (!response.ok) {
                throw new Error(`Inference failed: ${response.status}`);
            }

            const result = await response.json();
            const latencyMs = performance.now() - startMs;
            this.turnLatencies.push(latencyMs);

            logger.debug(`[Personaplex] Response: intent=${result.intent}, confidence=${result.confidence}, latency=${latencyMs.toFixed(0)}ms`);

            // Add AI response to transcript
            const aiTurn: TranscriptTurn = {
                speaker: 'assistant',
                text: result.response_text,
                timestamp: new Date().toISOString(),
            };
            this.transcript.push(aiTurn);
            this.onTranscriptUpdate?.(aiTurn);

            // Speak the response using TTS
            this.isSpeaking = true;

            // Pause recognition while speaking to avoid echo
            if (this.recognition && this.isListening) {
                try { this.recognition.stop(); } catch { }
            }

            speak(result.response_text, () => {
                this.isSpeaking = false;
                // Resume recognition after speaking — add delay to avoid echo tail
                if (this.isListening && this.recognition) {
                    setTimeout(() => {
                        if (this.isListening && this.recognition && !this.isSpeaking) {
                            try { this.recognition.start(); } catch { }
                            logger.debug('[Personaplex] Recognition resumed after TTS');
                        }
                    }, 500); // 500ms buffer to let mic settle
                }
            });

        } catch (error) {
            console.error('[Personaplex] Inference error:', error);

            // Show error as AI message
            const errorTurn: TranscriptTurn = {
                speaker: 'assistant',
                text: 'Üzgünüm, bir hata oluştu. Tekrar deneyin.',
                timestamp: new Date().toISOString(),
            };
            this.transcript.push(errorTurn);
            this.onTranscriptUpdate?.(errorTurn);
        }
    }

    /**
     * End the current voice session
     */
    endSession(): void {
        this.stopAudioCapture();

        const duration = this.startTime
            ? (Date.now() - this.startTime.getTime()) / 1000
            : 0;

        const avgLatency = this.turnLatencies.length > 0
            ? this.turnLatencies.reduce((a, b) => a + b, 0) / this.turnLatencies.length
            : 0;

        const summary: SessionSummary = {
            session_id: this.session?.sessionId || 'unknown',
            duration_seconds: duration,
            persona: this.session?.persona || 'default',
            transcript: this.transcript,
            metrics: {
                turn_count: this.transcript.length,
                avg_latency_ms: avgLatency,
            },
        };

        this.onSessionEnded?.(summary);
    }

    /**
     * Stop audio capture
     */
    stopAudioCapture(): void {
        this.isListening = false;

        if (this.recognition) {
            try { this.recognition.stop(); } catch { }
            this.recognition = null;
        }

        // Cancel any ongoing TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

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

        logger.debug('[Personaplex] Audio capture stopped');
    }

    /**
     * Send transcript update (manual text input)
     */
    sendTranscriptUpdate(text: string, speaker: 'user' | 'assistant' = 'user'): void {
        if (speaker === 'user') {
            this.processUserInput(text);
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect(): void {
        this.stopAudioCapture();
        this.session = null;
        this.transcript = [];
        this.turnLatencies = [];
        this.startTime = null;
    }

    /**
     * Check if currently connected
     */
    isConnected(): boolean {
        return this.session !== null;
    }

    /**
     * Get current session
     */
    getSession(): VoiceSession | null {
        return this.session;
    }
}
