// Audio Stream Utilities for Voice AI
// Handles microphone capture, audio playback, and visualization

export interface AudioConfig {
    sampleRate: number;
    channelCount: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
}

export interface AudioVisualizerData {
    waveform: Float32Array;
    volume: number;
    frequency: Float32Array;
}

const DEFAULT_CONFIG: AudioConfig = {
    sampleRate: 24000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
};

/**
 * Check for microphone permission
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
    try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        return result.state;
    } catch {
        // Fallback for browsers that don't support permissions API
        return 'prompt';
    }
}

/**
 * Request microphone access
 */
export async function requestMicrophoneAccess(config: AudioConfig = DEFAULT_CONFIG): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: config.channelCount,
            sampleRate: config.sampleRate,
            echoCancellation: config.echoCancellation,
            noiseSuppression: config.noiseSuppression,
        }
    });
}

/**
 * Audio Visualizer class for real-time waveform display
 */
export class AudioVisualizer {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private animationId: number | null = null;

    public onVisualizerData?: (data: AudioVisualizerData) => void;

    constructor() { }

    /**
     * Start visualizing audio from a media stream
     */
    start(stream: MediaStream): void {
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;

        this.source = this.audioContext.createMediaStreamSource(stream);
        this.source.connect(this.analyser);

        this.animate();
    }

    private animate = (): void => {
        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const waveform = new Float32Array(bufferLength);
        const frequency = new Float32Array(bufferLength);

        this.analyser.getFloatTimeDomainData(waveform);
        this.analyser.getFloatFrequencyData(frequency);

        // Calculate volume (RMS)
        let sum = 0;
        for (let i = 0; i < waveform.length; i++) {
            sum += waveform[i] * waveform[i];
        }
        const volume = Math.sqrt(sum / waveform.length);

        this.onVisualizerData?.({
            waveform,
            volume,
            frequency,
        });

        this.animationId = requestAnimationFrame(this.animate);
    };

    /**
     * Stop visualization
     */
    stop(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
    }
}

/**
 * Audio Player for AI response playback
 */
export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private queue: AudioBuffer[] = [];
    private isPlaying: boolean = false;

    public onPlaybackStart?: () => void;
    public onPlaybackEnd?: () => void;

    constructor() { }

    /**
     * Initialize audio context
     */
    init(): void {
        if (!this.audioContext) {
            this.audioContext = new AudioContext({ sampleRate: 24000 });
        }
    }

    /**
     * Add audio data to playback queue
     */
    async addToQueue(audioData: ArrayBuffer): Promise<void> {
        if (!this.audioContext) {
            this.init();
        }

        try {
            const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0));
            this.queue.push(audioBuffer);

            if (!this.isPlaying) {
                this.playNext();
            }
        } catch (error) {
            console.error('[AudioPlayer] Failed to decode audio:', error);
        }
    }

    /**
     * Play audio from Int16 PCM data
     */
    playPCM(int16Data: Int16Array): void {
        if (!this.audioContext) {
            this.init();
        }

        // Convert Int16 to Float32
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768;
        }

        const audioBuffer = this.audioContext!.createBuffer(1, float32Data.length, 24000);
        audioBuffer.copyToChannel(float32Data, 0);

        this.queue.push(audioBuffer);

        if (!this.isPlaying) {
            this.playNext();
        }
    }

    private playNext(): void {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            this.onPlaybackEnd?.();
            return;
        }

        if (!this.isPlaying) {
            this.isPlaying = true;
            this.onPlaybackStart?.();
        }

        const buffer = this.queue.shift()!;
        const source = this.audioContext!.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext!.destination);

        source.onended = () => {
            this.playNext();
        };

        source.start();
    }

    /**
     * Clear queue and stop playback
     */
    stop(): void {
        this.queue = [];
        this.isPlaying = false;
    }

    /**
     * Cleanup
     */
    dispose(): void {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

/**
 * Convert Float32Array to Int16Array for transmission
 */
export function float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return int16Array;
}

/**
 * Convert Int16Array to Float32Array for playback
 */
export function int16ToFloat32(int16Array: Int16Array): Float32Array {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
    }
    return float32Array;
}
