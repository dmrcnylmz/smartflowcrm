'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AudioWaveform, VolumeMeter } from './AudioWaveform';
import { PersonaplexClient, type VoiceSession, type TranscriptTurn, type SessionSummary } from '@/lib/voice/personaplex-client';
import { AudioVisualizer } from '@/lib/voice/audio-stream';
import {
    Mic,
    MicOff,
    Phone,
    PhoneOff,
    User,
    Bot,
    Loader2,
    AlertCircle,
    Volume2,
    Globe,
    MessageSquare,
} from 'lucide-react';

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}
interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}
interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInstance;
}

interface VoiceCallModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    onCallEnd?: (summary: SessionSummary) => void;
}

type CallState = 'idle' | 'connecting' | 'connected' | 'ending' | 'error';
type CallMode = 'gpu' | 'text-only' | 'mock';
type Language = 'tr' | 'en';

const LABELS = {
    tr: {
        title: 'Sesli AI Görüşme',
        ready: 'Hazır',
        connecting: 'Bağlanıyor...',
        active: 'Aktif',
        error: 'Hata',
        audioSignal: 'Ses Sinyali',
        conversation: 'Konuşma',
        startSpeaking: 'Konuşmaya başlayın...',
        waitForCall: 'Görüşme başladığında konuşma burada görünecek',
        instructions: 'Sesli AI görüşmesi başlatmak için yeşil butona tıklayın.',
        micRequired: 'Mikrofon izni gereklidir.',
        serverUnavailable: 'Hiçbir AI servisi erişilemez durumda',
        connectionError: 'Bağlantı hatası',
        textMode: 'Metin Modu',
        textModeInfo: 'AI ses tanıma + LLM ile çalışıyor',
        listening: 'Dinleniyor...',
        thinking: 'Düşünüyor...',
    },
    en: {
        title: 'Voice AI Call',
        ready: 'Ready',
        connecting: 'Connecting...',
        active: 'Active',
        error: 'Error',
        audioSignal: 'Audio Signal',
        conversation: 'Conversation',
        startSpeaking: 'Start speaking...',
        waitForCall: 'Transcript will appear here when the call starts',
        instructions: 'Click the green button to start a Voice AI call.',
        micRequired: 'Microphone permission is required.',
        serverUnavailable: 'No AI service is reachable',
        connectionError: 'Connection error',
        textMode: 'Text Mode',
        textModeInfo: 'Using AI speech recognition + LLM',
        listening: 'Listening...',
        thinking: 'Thinking...',
    }
};

export function VoiceCallModal({
    open,
    onOpenChange,
    customerId,
    customerName,
    customerPhone,
    onCallEnd,
}: VoiceCallModalProps) {
    const [callState, setCallState] = useState<CallState>('idle');
    const [callMode, setCallMode] = useState<CallMode>('gpu');
    const [session, setSession] = useState<VoiceSession | null>(null);
    const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0);
    const [audioData, setAudioData] = useState<Float32Array | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const [language, setLanguage] = useState<Language>('tr');
    const [persona, setPersona] = useState('default');
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);

    const labels = LABELS[language];

    const clientRef = useRef<PersonaplexClient | null>(null);
    const visualizerRef = useRef<AudioVisualizer | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const sessionIdRef = useRef<string>(`session-${Date.now()}`);
    const isSpeakingRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // --- Deepgram STT refs ---
    const [sttMode, setSttMode] = useState<'browser' | 'deepgram'>('browser');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const silenceStartRef = useRef<number>(0);
    const speechDetectedRef = useRef(false);
    const speechStartTimeRef = useRef<number>(0);
    // Ref-based function pointers to avoid circular useCallback deps
    const startListeningRef = useRef<(() => void) | null>(null);
    const stopListeningRef = useRef<(() => void) | null>(null);

    // Scroll to bottom when transcript updates
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    // Timer for call duration
    useEffect(() => {
        if (callState === 'connected') {
            timerRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [callState]);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // --- TTS: Server API (ElevenLabs/OpenAI) → Browser speechSynthesis (last resort) ---
    // Greeting/Body Strategy:
    //   greeting=true  → ElevenLabs premium (marka algısı)
    //   greeting=false → OpenAI TTS (ucuz + güvenilir)
    const speakText = useCallback(async (text: string, onEnd?: () => void, isGreeting = false) => {
        isSpeakingRef.current = true;

        // 1. Pause ALL STT to prevent echo (browser Speech API + Deepgram)
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { /* already stopped */ }
        }
        stopListeningRef.current?.();
        setIsListening(false);

        let resumeCalled = false;
        const resumeListening = () => {
            if (resumeCalled) return; // Prevent double-resume
            resumeCalled = true;
            clearTimeout(safetyTimer);
            isSpeakingRef.current = false;
            // 500ms settling delay before restarting mic
            setTimeout(() => {
                // Restart browser Speech API (if active in browser mode)
                if (recognitionRef.current && !isSpeakingRef.current) {
                    try {
                        recognitionRef.current.start();
                        setIsListening(true);
                    } catch { /* already started */ }
                }
                // Restart Deepgram recording (if active in deepgram mode)
                startListeningRef.current?.();
                onEnd?.();
            }, 500);
        };

        // Safety timeout: if TTS never finishes (event lost), force resume after 10s
        const safetyTimer = setTimeout(() => {
            if (isSpeakingRef.current) {
                console.warn('[TTS] Safety timeout — forcing resume after 10s');
                resumeListening();
            }
        }, 10000);

        // Try server-side TTS (ElevenLabs or OpenAI based on greeting flag)
        // Use AbortController with 5s timeout to prevent hanging on slow TTS
        const ttsController = new AbortController();
        const ttsTimeout = setTimeout(() => ttsController.abort(), 5000);

        try {
            const ttsRes = await fetch('/api/voice/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    language,
                    greeting: isGreeting, // Premium voice for greeting, budget for body
                }),
                signal: ttsController.signal,
            });

            clearTimeout(ttsTimeout);

            if (ttsRes.ok && ttsRes.headers.get('content-type')?.includes('audio')) {
                const audioBlob = await ttsRes.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                audioRef.current = audio;

                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    audioRef.current = null;
                    resumeListening();
                };
                audio.onerror = () => {
                    URL.revokeObjectURL(audioUrl);
                    audioRef.current = null;
                    resumeListening();
                };

                await audio.play();
                return;
            }
        } catch {
            clearTimeout(ttsTimeout);
            // Server TTS failed or timed out — fall through to browser TTS
        }

        // Last resort: Browser speechSynthesis (only if API completely fails)
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = language === 'tr' ? 'tr-TR' : 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Explicitly find correct language voice
            const voices = window.speechSynthesis.getVoices();
            if (language === 'tr') {
                const turkishVoice = voices.find(v => v.lang === 'tr-TR')
                    || voices.find(v => v.lang.startsWith('tr'));
                if (turkishVoice) utterance.voice = turkishVoice;
            } else {
                const englishVoice = voices.find(v => v.lang === 'en-US')
                    || voices.find(v => v.lang.startsWith('en'));
                if (englishVoice) utterance.voice = englishVoice;
            }

            utterance.onend = resumeListening;
            utterance.onerror = resumeListening;
            window.speechSynthesis.speak(utterance);
        } else {
            resumeListening();
        }
    }, [language]);

    // Text-only mode: Deepgram STT (primary) or Browser SpeechRecognition (fallback) → LLM → TTS
    const startTextOnlyMode = useCallback(async () => {

        // --- Determine STT mode ---
        // Browser Speech API is more reliable for simulation (native Chrome, no API dependency)
        // Deepgram is used only as fallback when browser Speech API is unavailable
        const hasBrowserSTT = !!(
            (window as unknown as Record<string, unknown>).SpeechRecognition
            || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        );

        let useDeepgram = false;
        if (!hasBrowserSTT) {
            // Browser Speech API not available — try Deepgram as fallback
            try {
                const sttStatus = await fetch('/api/voice/stt');
                if (sttStatus.ok) {
                    const status = await sttStatus.json();
                    useDeepgram = status.configured === true;
                }
            } catch {
                useDeepgram = false;
            }
        }

        // Common greeting
        const greeting = language === 'tr'
            ? 'Merhaba! Ben Callception AI asistanıyım. Size nasıl yardımcı olabilirim?'
            : 'Hello! I am the Callception AI assistant. How can I help you?';

        if (useDeepgram) {
            // ================================================================
            // DEEPGRAM STT MODE (Enterprise-Grade)
            // Flow: MediaRecorder → VAD → Deepgram Nova-2 → LLM → TTS
            // ================================================================
            setSttMode('deepgram');

            // Get microphone access
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (micErr) {
                console.error('[STT:Deepgram] Microphone access denied:', micErr);
                throw new Error(language === 'tr'
                    ? 'Mikrofon erişimi reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin.'
                    : 'Microphone access denied. Please grant microphone permission in browser settings.');
            }
            mediaStreamRef.current = stream;

            // Create AudioContext for Voice Activity Detection (VAD)
            const ctx = new AudioContext();
            // CRITICAL: Chrome suspends AudioContext even from user gestures in async contexts
            // Without resume(), analyser returns all zeros → VAD never detects speech
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            analyserRef.current = analyser;

            // --- VAD Configuration ---
            const SPEECH_THRESHOLD = 8;      // RMS level to detect speech (lowered for laptop mics)
            const SILENCE_DURATION = 1500;   // 1.5s silence = end of utterance
            const MIN_SPEECH_MS = 300;       // Minimum speech to process (filter noise)

            // --- Process recorded utterance (stop → transcribe → LLM → TTS → restart) ---
            const processUtterance = async () => {
                // Stop VAD monitoring
                if (vadIntervalRef.current) {
                    clearInterval(vadIntervalRef.current);
                    vadIntervalRef.current = null;
                }
                // Stop MediaRecorder
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    mediaRecorderRef.current.stop();
                }

                setIsListening(false);
                speechDetectedRef.current = false;
                silenceStartRef.current = 0;

                // Wait for final MediaRecorder data chunks
                await new Promise(resolve => setTimeout(resolve, 250));

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];

                // Skip too-small recordings (noise/silence)
                if (audioBlob.size < 1000) {
                    startDeepgramRecording();
                    return;
                }

                setIsThinking(true);

                try {
                    // Send to Deepgram STT
                    const formData = new FormData();
                    formData.append('audio', audioBlob, 'recording.webm');
                    formData.append('language', language);

                    const sttResponse = await fetch('/api/voice/stt', {
                        method: 'POST',
                        body: formData,
                    });

                    const sttData = await sttResponse.json();

                    if (!sttData.success || sttData.isEmpty || !sttData.transcript) {
                        // No speech detected by Deepgram — restart listening
                        setIsThinking(false);
                        startDeepgramRecording();
                        return;
                    }

                    const userText = sttData.transcript;

                    // Show user transcript
                    setTranscript(prev => [...prev, {
                        speaker: 'user',
                        text: userText,
                        timestamp: new Date().toISOString(),
                    }]);

                    // Send to LLM
                    const response = await fetch('/api/voice/infer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: userText,
                            persona,
                            language,
                            session_id: sessionIdRef.current,
                        }),
                    });

                    const data = await response.json();
                    const aiText = data.response_text || (language === 'tr' ? 'Yanıt alınamadı.' : 'No response received.');

                    setTranscript(prev => [...prev, {
                        speaker: 'assistant',
                        text: aiText,
                        timestamp: new Date().toISOString(),
                    }]);

                    setIsThinking(false);

                    // Speak body response (budget voice → OpenAI TTS)
                    // Deepgram recording restarts via speakText's resumeListening → startListeningRef
                    await speakText(aiText, undefined, false);

                } catch (err) {
                    console.error('[STT:Deepgram] Processing error:', err);
                    setTranscript(prev => [...prev, {
                        speaker: 'assistant',
                        text: language === 'tr' ? 'Bir hata oluştu. Tekrar deneyin.' : 'An error occurred. Please try again.',
                        timestamp: new Date().toISOString(),
                    }]);
                    setIsThinking(false);
                    startDeepgramRecording();
                }
            };

            // --- Start recording with VAD monitoring ---
            const startDeepgramRecording = () => {
                if (!mediaStreamRef.current || isSpeakingRef.current) return;

                // Check if stream tracks are still alive
                const tracks = mediaStreamRef.current.getAudioTracks();
                if (tracks.length === 0 || tracks[0].readyState === 'ended') {
                    console.error('[STT:Deepgram] Microphone stream ended unexpectedly');
                    return;
                }

                setIsListening(true);
                speechDetectedRef.current = false;
                silenceStartRef.current = 0;
                speechStartTimeRef.current = 0;
                audioChunksRef.current = [];

                // Start MediaRecorder
                try {
                    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                        ? 'audio/webm;codecs=opus'
                        : 'audio/webm';
                    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
                    mediaRecorderRef.current = recorder;

                    recorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunksRef.current.push(event.data);
                        }
                    };

                    recorder.start(100); // Collect chunks every 100ms
                } catch (err) {
                    console.error('[STT:Deepgram] MediaRecorder error:', err);
                    return;
                }

                // Start VAD monitoring loop
                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                vadIntervalRef.current = setInterval(() => {
                    if (!analyserRef.current || isSpeakingRef.current) return;

                    analyserRef.current.getByteFrequencyData(dataArray);
                    const rms = Math.sqrt(
                        dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length,
                    );

                    if (rms > SPEECH_THRESHOLD) {
                        // Speech detected
                        if (!speechDetectedRef.current) {
                            speechStartTimeRef.current = Date.now();
                        }
                        speechDetectedRef.current = true;
                        silenceStartRef.current = 0;
                    } else if (speechDetectedRef.current) {
                        // Silence after speech
                        if (silenceStartRef.current === 0) {
                            silenceStartRef.current = Date.now();
                        } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
                            // Check minimum speech duration (filter noise)
                            const speechDuration = silenceStartRef.current - speechStartTimeRef.current;
                            if (speechDuration > MIN_SPEECH_MS) {
                                processUtterance();
                            } else {
                                // Too short — noise, reset
                                speechDetectedRef.current = false;
                                silenceStartRef.current = 0;
                            }
                        }
                    }
                }, 50); // Check every 50ms
            };

            // Store function pointers for speakText integration
            startListeningRef.current = startDeepgramRecording;
            stopListeningRef.current = () => {
                if (vadIntervalRef.current) {
                    clearInterval(vadIntervalRef.current);
                    vadIntervalRef.current = null;
                }
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    try { mediaRecorderRef.current.stop(); } catch { /* ok */ }
                }
                audioChunksRef.current = [];
                speechDetectedRef.current = false;
                silenceStartRef.current = 0;
                setIsListening(false);
            };

            setCallState('connected');

            setTranscript([{ speaker: 'assistant', text: greeting, timestamp: new Date().toISOString() }]);

            // Speak greeting with PREMIUM voice, then start Deepgram recording
            await speakText(greeting, () => {
                // Deepgram recording starts via startListeningRef in speakText's resumeListening
            }, true); // greeting=true → ElevenLabs premium voice

        } else {
            // ================================================================
            // BROWSER SPEECH API FALLBACK
            // Flow: Web Speech API → LLM → TTS
            // ================================================================
            setSttMode('browser');

            // Explicitly request microphone to ensure permission is granted
            // Chrome requires getUserMedia before SpeechRecognition works properly
            try {
                const browserStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,  // Normalize mic volume automatically
                        channelCount: 1,
                    },
                });
                mediaStreamRef.current = browserStream;
            } catch (micErr) {
                console.error('[STT:Browser] Microphone access denied:', micErr);
                throw new Error(language === 'tr'
                    ? 'Mikrofon erişimi reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin.'
                    : 'Microphone access denied. Please grant microphone permission in browser settings.');
            }

            const SpeechRecognitionAPI = (
                (window as unknown as Record<string, SpeechRecognitionConstructor | undefined>).SpeechRecognition
                || (window as unknown as Record<string, SpeechRecognitionConstructor | undefined>).webkitSpeechRecognition
            );

            if (!SpeechRecognitionAPI) {
                throw new Error('Tarayıcınız ses tanımayı desteklemiyor. Chrome kullanmanızı öneririz.');
            }

            const recognition = new SpeechRecognitionAPI();
            recognition.lang = language === 'tr' ? 'tr-TR' : 'en-US';
            recognition.continuous = true;
            recognition.interimResults = true;

            // Track recognition state to prevent race conditions on restart
            let isRecognitionActive = false;
            // Track if currently processing a turn (prevents double-processing)
            let isProcessingTurn = false;

            // Safe start helper — prevents "already started" errors
            const safeStartRecognition = () => {
                if (!recognitionRef.current || isSpeakingRef.current || isRecognitionActive || isProcessingTurn) return;
                try {
                    recognitionRef.current.start();
                    isRecognitionActive = true;
                    setIsListening(true);
                } catch {
                    // Already started or other error — ignore
                }
            };

            // Safe stop helper
            const safeStopRecognition = () => {
                if (!recognitionRef.current) return;
                try {
                    recognitionRef.current.stop();
                } catch {
                    // Already stopped
                }
                isRecognitionActive = false;
            };

            recognitionRef.current = recognition;

            recognition.onresult = async (event: SpeechRecognitionEvent) => {
                // ECHO PREVENTION: Ignore all results while AI is speaking
                if (isSpeakingRef.current || isProcessingTurn) return;

                const lastResult = event.results[event.results.length - 1];
                const text = lastResult[0].transcript.trim();

                if (!text) return; // Skip empty results

                if (!lastResult.isFinal) {
                    // Interim result — show as typing indicator (deduplicated)
                    setTranscript(prev => {
                        const last = prev[prev.length - 1];
                        if (last && last.speaker === 'user' && last.text.endsWith('...')) {
                            return [...prev.slice(0, -1), { speaker: 'user', text: text + '...', timestamp: new Date().toISOString() }];
                        }
                        return [...prev, { speaker: 'user', text: text + '...', timestamp: new Date().toISOString() }];
                    });
                    return;
                }

                // --- FINAL RESULT: Process the user's utterance ---
                // Skip very short results (likely noise/false positives)
                if (text.length < 2) return;

                isProcessingTurn = true;

                // Replace interim indicator with final text
                setTranscript(prev => {
                    const filtered = prev.filter(t => !(t.speaker === 'user' && t.text.endsWith('...')));
                    return [...filtered, { speaker: 'user', text, timestamp: new Date().toISOString() }];
                });

                setIsListening(false);
                setIsThinking(true);

                // Stop recognition during LLM processing to prevent echo
                safeStopRecognition();

                try {
                    const response = await fetch('/api/voice/infer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text,
                            persona,
                            language,
                            session_id: sessionIdRef.current,
                        }),
                    });

                    const data = await response.json();
                    const aiText = data.response_text || (language === 'tr' ? 'Yanıt alınamadı.' : 'No response received.');

                    setTranscript(prev => [...prev, {
                        speaker: 'assistant',
                        text: aiText,
                        timestamp: new Date().toISOString(),
                    }]);

                    setIsThinking(false);
                    isProcessingTurn = false;

                    // Speak response — recognition restarts via speakText's resumeListening
                    await speakText(aiText, undefined, false);
                } catch {
                    setTranscript(prev => [...prev, {
                        speaker: 'assistant',
                        text: language === 'tr' ? 'Bir hata oluştu. Tekrar deneyin.' : 'An error occurred. Please try again.',
                        timestamp: new Date().toISOString(),
                    }]);
                    setIsThinking(false);
                    isProcessingTurn = false;

                    // Restart recognition after error
                    setTimeout(() => safeStartRecognition(), 300);
                }
            };

            recognition.onerror = (event) => {
                const errEvent = event as SpeechRecognitionErrorEvent;
                isRecognitionActive = false;

                if (errEvent.error === 'no-speech') {
                    // Chrome stops after ~3-4s silence — this is normal, onend will restart
                    return;
                }
                if (errEvent.error === 'aborted') {
                    // We aborted it intentionally — ignore
                    return;
                }
                if (errEvent.error === 'network') {
                    // Network issue with Google's STT servers — retry silently
                    console.warn('[STT:Browser] Network error — will retry on next onend');
                    return;
                }
                // Genuine error — show to user
                setError(`Ses tanıma hatası: ${errEvent.error}`);
            };

            recognition.onend = () => {
                isRecognitionActive = false;
                // Auto-restart: Chrome kills recognition after ~3-4s silence
                // This is the standard fix used across the ecosystem
                if (recognitionRef.current && !isSpeakingRef.current && !isProcessingTurn) {
                    // Small delay to prevent rapid restart loops
                    setTimeout(() => safeStartRecognition(), 100);
                }
            };

            setCallState('connected');

            setTranscript([{ speaker: 'assistant', text: greeting, timestamp: new Date().toISOString() }]);

            // Speak greeting with PREMIUM voice, then start browser recognition
            await speakText(greeting, () => {
                // Explicitly start recognition after greeting
                safeStartRecognition();
            }, true); // greeting=true → ElevenLabs premium voice
        }
    }, [language, persona, speakText]);

    const startCall = useCallback(async () => {
        setCallState('connecting');
        setError(null);
        setTranscript([]);
        setCallDuration(0);
        sessionIdRef.current = `session-${Date.now()}`;

        try {
            // Check server availability first
            const statusRes = await fetch('/api/voice/health');
            const status = await statusRes.json();

            const isAvailable = status.status === 'healthy' || status.status === 'ok';

            if (!isAvailable) {
                throw new Error(labels.serverUnavailable);
            }

            // Determine mode based on capabilities
            const mode: CallMode = status.mode === 'live' ? 'gpu'
                : status.mode === 'text-only' ? 'text-only'
                : status.mode === 'mock' ? 'mock'
                : 'text-only';

            setCallMode(mode);

            if (mode !== 'gpu') {
                // Text-only mode: browser STT → LLM → browser TTS
                await startTextOnlyMode();
                return;
            }

            // GPU mode: full Personaplex integration
            const effectivePersona = language === 'en' && !persona.endsWith('_en')
                ? `${persona}_en`
                : persona;

            const serverUrl = process.env.NEXT_PUBLIC_PERSONAPLEX_URL || 'http://localhost:8998';
            const client = new PersonaplexClient({ serverUrl });

            client.onSessionStarted = (session) => {
                setSession(session);
                setCallState('connected');
            };

            client.onSessionEnded = async (summary) => {
                setCallState('idle');

                try {
                    await fetch('/api/voice/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: summary.session_id,
                            customerId,
                            customerPhone,
                            customerName,
                            transcript: summary.transcript,
                            duration: summary.duration_seconds,
                            persona: summary.persona,
                            metrics: summary.metrics,
                        }),
                    });
                } catch (err) {
                    console.error('Failed to save session:', err);
                }

                onCallEnd?.(summary);
                onOpenChange(false);
            };

            client.onTranscriptUpdate = (turn) => {
                setTranscript(prev => {
                    if (turn.speaker === 'user' && turn.text.endsWith('...')) {
                        const lastIdx = prev.length - 1;
                        if (lastIdx >= 0 && prev[lastIdx].speaker === 'user' && prev[lastIdx].text.endsWith('...')) {
                            const updated = [...prev];
                            updated[lastIdx] = turn;
                            return updated;
                        }
                    }
                    if (turn.speaker === 'user' && !turn.text.endsWith('...')) {
                        const lastIdx = prev.length - 1;
                        if (lastIdx >= 0 && prev[lastIdx].speaker === 'user' && prev[lastIdx].text.endsWith('...')) {
                            const updated = [...prev];
                            updated[lastIdx] = turn;
                            return updated;
                        }
                    }
                    return [...prev, turn];
                });
            };

            client.onError = (err) => {
                setError(err.message);
                setCallState('error');
            };

            await client.connect();
            client.startSession(effectivePersona);
            await client.startAudioCapture();

            if (navigator.mediaDevices?.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const visualizer = new AudioVisualizer();
                visualizer.onVisualizerData = (data) => {
                    setVolume(data.volume);
                    setAudioData(data.waveform);
                };
                visualizer.start(stream);
                visualizerRef.current = visualizer;
            }

            clientRef.current = client;

        } catch (err) {
            console.error('Failed to start call:', err);
            setError(err instanceof Error ? err.message : labels.connectionError);
            setCallState('error');
        }
    }, [customerId, customerName, customerPhone, persona, language, labels, onCallEnd, onOpenChange, startTextOnlyMode]);

    const endCall = useCallback(() => {
        setCallState('ending');
        isSpeakingRef.current = false;

        // Stop browser Speech Recognition (browser STT mode)
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }

        // Stop Deepgram STT resources
        stopListeningRef.current?.();
        if (vadIntervalRef.current) {
            clearInterval(vadIntervalRef.current);
            vadIntervalRef.current = null;
        }
        if (mediaRecorderRef.current) {
            try { if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop(); } catch { /* ok */ }
            mediaRecorderRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { /* ok */ });
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        startListeningRef.current = null;
        stopListeningRef.current = null;
        audioChunksRef.current = [];

        // Stop TTS audio playback
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        // Stop browser speech synthesis (last resort TTS)
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }

        if (visualizerRef.current) {
            visualizerRef.current.stop();
            visualizerRef.current = null;
        }

        if (clientRef.current) {
            clientRef.current.endSession();
            clientRef.current.disconnect();
            clientRef.current = null;
        }

        setSession(null);
        setIsListening(false);
        setIsThinking(false);
        setCallState('idle');
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isSpeakingRef.current = false;
            if (clientRef.current) {
                clientRef.current.disconnect();
            }
            if (visualizerRef.current) {
                visualizerRef.current.stop();
            }
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (audioRef.current) {
                audioRef.current.pause();
            }
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            // Cleanup Deepgram STT resources
            if (vadIntervalRef.current) {
                clearInterval(vadIntervalRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try { mediaRecorderRef.current.stop(); } catch { /* ok */ }
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => { /* ok */ });
            }
        };
    }, []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-green-500" />
                        {labels.title}
                        {customerName && (
                            <Badge variant="secondary">{customerName}</Badge>
                        )}
                        {callState === 'connected' && callMode === 'text-only' && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                {labels.textMode}
                            </Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Status and Duration */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {callState === 'idle' && (
                                <Badge variant="secondary">{labels.ready}</Badge>
                            )}
                            {callState === 'connecting' && (
                                <Badge variant="secondary" className="animate-pulse">
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    {labels.connecting}
                                </Badge>
                            )}
                            {callState === 'connected' && (
                                <Badge className="bg-green-500">
                                    <span className="animate-pulse mr-1">●</span>
                                    {labels.active}
                                </Badge>
                            )}
                            {callState === 'connected' && isListening && (
                                <Badge variant="outline" className="text-blue-600 border-blue-300 animate-pulse">
                                    <Mic className="h-3 w-3 mr-1" />
                                    {labels.listening}
                                </Badge>
                            )}
                            {callState === 'connected' && isThinking && (
                                <Badge variant="outline" className="text-purple-600 border-purple-300 animate-pulse">
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    {labels.thinking}
                                </Badge>
                            )}
                            {callState === 'error' && (
                                <Badge variant="destructive">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {labels.error}
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Language Selector */}
                            {callState === 'idle' && (
                                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                                    <button
                                        onClick={() => setLanguage('tr')}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${language === 'tr'
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        TR
                                    </button>
                                    <button
                                        onClick={() => setLanguage('en')}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${language === 'en'
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        EN
                                    </button>
                                </div>
                            )}
                            {callState === 'connected' && (
                                <div className="flex items-center gap-1">
                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">{language.toUpperCase()}</span>
                                </div>
                            )}

                            {callState === 'connected' && (
                                <div className="text-2xl font-mono font-bold text-green-500">
                                    {formatDuration(callDuration)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Text Mode Info */}
                    {callState === 'connected' && callMode === 'text-only' && (
                        <div className={`rounded-lg border px-4 py-2 ${sttMode === 'deepgram'
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-amber-200 bg-amber-50'
                            }`}>
                            <p className={`text-sm ${sttMode === 'deepgram' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {sttMode === 'deepgram'
                                    ? (language === 'tr' ? '🎯 Deepgram Nova-2 + LLM + TTS' : '🎯 Deepgram Nova-2 + LLM + TTS')
                                    : labels.textModeInfo
                                }
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <Card className="border-destructive bg-destructive/10">
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2 text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>{error}</span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Audio Visualization (only in GPU mode) */}
                    {callMode === 'gpu' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{labels.audioSignal}</span>
                                {callState === 'connected' && (
                                    <div className="flex items-center gap-2">
                                        <Volume2 className="h-4 w-4 text-muted-foreground" />
                                        <VolumeMeter volume={volume} />
                                    </div>
                                )}
                            </div>
                            <AudioWaveform
                                audioData={audioData}
                                volume={volume}
                                isActive={callState === 'connected'}
                                color={isMuted ? '#ef4444' : '#22c55e'}
                            />
                        </div>
                    )}

                    {/* Transcript */}
                    <div className="space-y-2">
                        <span className="text-sm text-muted-foreground">{labels.conversation}</span>
                        <Card className="h-48 overflow-y-auto">
                            <CardContent className="pt-4 space-y-3">
                                {transcript.length === 0 ? (
                                    <p className="text-muted-foreground text-center py-8">
                                        {callState === 'connected'
                                            ? labels.startSpeaking
                                            : labels.waitForCall}
                                    </p>
                                ) : (
                                    transcript.map((turn) => (
                                        <div
                                            key={turn.timestamp}
                                            className={`flex gap-2 ${turn.speaker === 'assistant' ? 'flex-row-reverse' : ''
                                                }`}
                                        >
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${turn.speaker === 'assistant' ? 'bg-blue-500' : 'bg-gray-500'
                                                }`}>
                                                {turn.speaker === 'assistant' ? (
                                                    <Bot className="h-4 w-4 text-white" />
                                                ) : (
                                                    <User className="h-4 w-4 text-white" />
                                                )}
                                            </div>
                                            <div className={`max-w-[80%] rounded-lg px-3 py-2 ${turn.speaker === 'assistant'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-muted'
                                                }`}>
                                                <p className="text-sm">{turn.text}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={transcriptEndRef} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Call Controls */}
                    <div className="flex items-center justify-center gap-4">
                        {callState === 'idle' || callState === 'error' ? (
                            <Button
                                size="lg"
                                className="bg-green-500 hover:bg-green-600 rounded-full w-16 h-16"
                                onClick={startCall}
                            >
                                <Phone className="h-6 w-6" />
                            </Button>
                        ) : callState === 'connecting' ? (
                            <Button
                                size="lg"
                                variant="secondary"
                                disabled
                                className="rounded-full w-16 h-16"
                            >
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="lg"
                                    variant={isMuted ? 'destructive' : 'secondary'}
                                    className="rounded-full w-14 h-14"
                                    onClick={toggleMute}
                                >
                                    {isMuted ? (
                                        <MicOff className="h-5 w-5" />
                                    ) : (
                                        <Mic className="h-5 w-5" />
                                    )}
                                </Button>
                                <Button
                                    size="lg"
                                    variant="destructive"
                                    className="rounded-full w-16 h-16"
                                    onClick={endCall}
                                >
                                    <PhoneOff className="h-6 w-6" />
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Instructions */}
                    {callState === 'idle' && (
                        <p className="text-center text-sm text-muted-foreground">
                            {labels.instructions}
                            <br />
                            {labels.micRequired}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
