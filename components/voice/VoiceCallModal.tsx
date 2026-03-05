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
        textModeInfo: 'GPU kapalı — Tarayıcı ses tanıma + LLM ile çalışıyor',
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
        textModeInfo: 'GPU offline — Using browser speech recognition + LLM',
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

    // Text-only mode: use browser SpeechRecognition → /api/voice/infer → SpeechSynthesis
    const startTextOnlyMode = useCallback(async () => {
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

        recognitionRef.current = recognition;

        recognition.onresult = async (event: SpeechRecognitionEvent) => {
            const lastResult = event.results[event.results.length - 1];
            const text = lastResult[0].transcript;

            if (!lastResult.isFinal) {
                // Interim result — show as typing
                setTranscript(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.speaker === 'user' && last.text.endsWith('...')) {
                        return [...prev.slice(0, -1), { speaker: 'user', text: text + '...', timestamp: new Date().toISOString() }];
                    }
                    return [...prev, { speaker: 'user', text: text + '...', timestamp: new Date().toISOString() }];
                });
                return;
            }

            // Final result — send to LLM
            setTranscript(prev => {
                const filtered = prev.filter(t => !(t.speaker === 'user' && t.text.endsWith('...')));
                return [...filtered, { speaker: 'user', text, timestamp: new Date().toISOString() }];
            });

            setIsListening(false);
            setIsThinking(true);

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
                const aiText = data.response_text || 'Yanıt alınamadı.';

                setTranscript(prev => [...prev, {
                    speaker: 'assistant',
                    text: aiText,
                    timestamp: new Date().toISOString(),
                }]);

                // Speak the response using browser TTS
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(aiText);
                    utterance.lang = language === 'tr' ? 'tr-TR' : 'en-US';
                    utterance.rate = 1.0;
                    window.speechSynthesis.speak(utterance);
                }
            } catch {
                setTranscript(prev => [...prev, {
                    speaker: 'assistant',
                    text: language === 'tr' ? 'Bir hata oluştu. Tekrar deneyin.' : 'An error occurred. Please try again.',
                    timestamp: new Date().toISOString(),
                }]);
            } finally {
                setIsThinking(false);
                setIsListening(true);
            }
        };

        recognition.onerror = (event) => {
            const errEvent = event as SpeechRecognitionErrorEvent;
            if (errEvent.error !== 'no-speech' && errEvent.error !== 'aborted') {
                setError(`Ses tanıma hatası: ${errEvent.error}`);
            }
        };

        recognition.onend = () => {
            // Restart recognition if call is still active
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.start();
                } catch {
                    // Already started or stopped
                }
            }
        };

        recognition.start();
        setIsListening(true);
        setCallState('connected');

        // Add greeting
        const greeting = language === 'tr'
            ? 'Merhaba! Ben Callception AI asistanıyım. Size nasıl yardımcı olabilirim?'
            : 'Hello! I am the Callception AI assistant. How can I help you?';

        setTranscript([{ speaker: 'assistant', text: greeting, timestamp: new Date().toISOString() }]);

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(greeting);
            utterance.lang = language === 'tr' ? 'tr-TR' : 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    }, [language, persona, callState]);

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

        // Stop speech recognition (text-only mode)
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }

        // Stop speech synthesis
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
            if (clientRef.current) {
                clientRef.current.disconnect();
            }
            if (visualizerRef.current) {
                visualizerRef.current.stop();
            }
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
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
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
                            <p className="text-sm text-amber-700">{labels.textModeInfo}</p>
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
