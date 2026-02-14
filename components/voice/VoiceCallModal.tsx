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
} from 'lucide-react';

interface VoiceCallModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    onCallEnd?: (summary: SessionSummary) => void;
}

type CallState = 'idle' | 'connecting' | 'connected' | 'ending' | 'error';
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
        serverUnavailable: 'Personaplex sunucusu erişilemez durumda',
        connectionError: 'Bağlantı hatası',
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
        serverUnavailable: 'Personaplex server is unreachable',
        connectionError: 'Connection error',
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
    const [session, setSession] = useState<VoiceSession | null>(null);
    const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0);
    const [audioData, setAudioData] = useState<Float32Array | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const [language, setLanguage] = useState<Language>('tr');
    const [persona, setPersona] = useState('default');

    const labels = LABELS[language];

    const clientRef = useRef<PersonaplexClient | null>(null);
    const visualizerRef = useRef<AudioVisualizer | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

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

    const startCall = useCallback(async () => {
        setCallState('connecting');
        setError(null);
        setTranscript([]);
        setCallDuration(0);

        try {
            // Check server availability first (use public health endpoint)
            const statusRes = await fetch('/api/voice/health');
            const status = await statusRes.json();

            // Accept both 'healthy' and 'ok' status, including mock/demo mode
            const isAvailable = status.status === 'healthy' || status.status === 'ok' || status.personaplex === true;
            if (!isAvailable) {
                throw new Error(labels.serverUnavailable);
            }

            // Map persona based on language
            const effectivePersona = language === 'en' && !persona.endsWith('_en')
                ? `${persona}_en`
                : persona;

            // Initialize client
            const serverUrl = process.env.NEXT_PUBLIC_PERSONAPLEX_URL || 'http://localhost:8998';
            const client = new PersonaplexClient({ serverUrl });

            client.onSessionStarted = (session) => {
                setSession(session);
                setCallState('connected');
            };

            client.onSessionEnded = async (summary) => {
                setCallState('idle');

                // Save to Firestore
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
                    // If this is an interim user result (ends with ...), 
                    // replace the last interim entry instead of adding
                    if (turn.speaker === 'user' && turn.text.endsWith('...')) {
                        const lastIdx = prev.length - 1;
                        if (lastIdx >= 0 && prev[lastIdx].speaker === 'user' && prev[lastIdx].text.endsWith('...')) {
                            const updated = [...prev];
                            updated[lastIdx] = turn;
                            return updated;
                        }
                    }
                    // If this is a final user result, remove the last interim
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

            // Connect and start session
            await client.connect();
            client.startSession(effectivePersona);

            // Start audio capture
            await client.startAudioCapture();

            // Initialize visualizer
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const visualizer = new AudioVisualizer();
            visualizer.onVisualizerData = (data) => {
                setVolume(data.volume);
                setAudioData(data.waveform);
            };
            visualizer.start(stream);

            clientRef.current = client;
            visualizerRef.current = visualizer;

        } catch (err) {
            console.error('Failed to start call:', err);
            setError(err instanceof Error ? err.message : labels.connectionError);
            setCallState('error');
        }
    }, [customerId, customerName, customerPhone, persona, language, labels, onCallEnd, onOpenChange]);

    const endCall = useCallback(() => {
        setCallState('ending');

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
        setCallState('idle');
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
        // In real implementation, would mute audio capture
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
                                        🇹🇷 TR
                                    </button>
                                    <button
                                        onClick={() => setLanguage('en')}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${language === 'en'
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        🇬🇧 EN
                                    </button>
                                </div>
                            )}
                            {callState === 'connected' && (
                                <div className="flex items-center gap-1">
                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">{language === 'tr' ? '🇹🇷' : '🇬🇧'}</span>
                                </div>
                            )}

                            {callState === 'connected' && (
                                <div className="text-2xl font-mono font-bold text-green-500">
                                    {formatDuration(callDuration)}
                                </div>
                            )}
                        </div>
                    </div>

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

                    {/* Audio Visualization */}
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
                                    transcript.map((turn, index) => (
                                        <div
                                            key={index}
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
