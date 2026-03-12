'use client';

/**
 * VoiceTestInline — Inline voice test component for Agent Test Panel
 *
 * Lighter version of VoiceCallModal that renders inline (no dialog).
 * Uses PersonaplexClient for real voice calls or text-only fallback.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    Mic, MicOff, Phone, PhoneOff, Bot, User, Loader2,
    AlertCircle, Volume2, Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AudioWaveform } from '@/components/voice/AudioWaveform';
import { PersonaplexClient, type TranscriptTurn, type SessionSummary } from '@/lib/voice/personaplex-client';
import { AudioVisualizer } from '@/lib/voice/audio-stream';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { AgentVoiceConfig } from '@/lib/agents/types';

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
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onspeechend: (() => void) | null;
}
interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInstance;
}

// =============================================
// Types
// =============================================

interface VoiceTestInlineProps {
    agentId?: string;
    agentName: string;
    voiceConfig?: AgentVoiceConfig;
    systemPrompt?: string;
}

type CallState = 'idle' | 'connecting' | 'connected' | 'ending' | 'error';

// =============================================
// Component
// =============================================

export function VoiceTestInline({
    agentId,
    agentName,
    voiceConfig,
    systemPrompt,
}: VoiceTestInlineProps) {
    const authFetch = useAuthFetch();
    const [callState, setCallState] = useState<CallState>('idle');
    const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [audioData, setAudioData] = useState<number[]>([]);
    const [volume, setVolume] = useState(0);

    const clientRef = useRef<PersonaplexClient | null>(null);
    const visualizerRef = useRef<AudioVisualizer | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isSpeakingRef = useRef(false);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

    const language = voiceConfig?.language || 'tr';

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (durationRef.current) clearInterval(durationRef.current);
            visualizerRef.current?.stop();
            recognitionRef.current?.abort();
            clientRef.current?.disconnect();
        };
    }, []);

    // Format duration
    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // ── Text-only fallback (browser STT → LLM → browser TTS) ──
    const startTextOnlyMode = useCallback(async () => {
        setCallState('connected');
        setCallDuration(0);
        durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);

        // Start browser STT
        const SpeechRecognition = (
            (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
        );

        if (!SpeechRecognition) {
            setError('Tarayıcınız ses tanımayı desteklemiyor. Chrome kullanmanızı öneririz.');
            setCallState('error');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = language === 'en' ? 'en-US' : 'tr-TR';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        recognition.onresult = async (event: SpeechRecognitionEvent) => {
            let finalText = '';
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) finalText += result[0].transcript + ' ';
            }
            finalText = finalText.trim();
            if (!finalText || isSpeakingRef.current) return;

            isSpeakingRef.current = true;
            setTranscript(prev => [...prev, { speaker: 'user', text: finalText }]);

            try {
                const res = await authFetch('/api/voice/pipeline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tenantId: 'default',
                        sessionId: `voice_test_${Date.now()}`,
                        action: 'text',
                        text: finalText,
                        ...(systemPrompt ? { systemPrompt } : {}),
                    }),
                });
                const data = await res.json();
                if (data.success && data.response) {
                    setTranscript(prev => [...prev, { speaker: 'assistant', text: data.response }]);
                    // TTS
                    const utterance = new SpeechSynthesisUtterance(data.response);
                    utterance.lang = language === 'en' ? 'en-US' : 'tr-TR';
                    utterance.rate = 1.0;
                    utterance.onend = () => { isSpeakingRef.current = false; };
                    window.speechSynthesis.speak(utterance);
                } else {
                    isSpeakingRef.current = false;
                }
            } catch {
                isSpeakingRef.current = false;
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error !== 'no-speech') {
                console.error('STT error:', event.error);
            }
        };

        recognition.onend = () => {
            // Auto restart if still connected
            if (callState === 'connected') {
                try { recognition.start(); } catch { /* ignore */ }
            }
        };

        try {
            recognition.start();
        } catch {
            setError('Mikrofon erişimi sağlanamadı');
            setCallState('error');
        }
    }, [authFetch, systemPrompt, language, callState]);

    // ── Start Call ──
    const startCall = useCallback(async () => {
        setCallState('connecting');
        setError(null);
        setTranscript([]);
        setCallDuration(0);

        try {
            // Check voice service health
            const statusRes = await authFetch('/api/voice/health');
            const status = await statusRes.json();
            const isAvailable = status.status === 'healthy' || status.status === 'ok';

            if (!isAvailable) {
                throw new Error('AI ses servisi şu anda erişilemez durumda');
            }

            const mode = status.mode === 'live' ? 'gpu' : 'text-only';

            if (mode !== 'gpu') {
                await startTextOnlyMode();
                return;
            }

            // GPU mode — full Personaplex
            const persona = voiceConfig?.voiceCatalogId || 'ct-leyla';
            const effectivePersona = language === 'en' && !persona.endsWith('_en')
                ? `${persona}_en` : persona;

            const serverUrl = process.env.NEXT_PUBLIC_PERSONAPLEX_URL || 'http://localhost:8998';
            const client = new PersonaplexClient({ serverUrl });

            client.onSessionStarted = () => {
                setCallState('connected');
                setCallDuration(0);
                durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
            };

            client.onSessionEnded = () => {
                setCallState('idle');
                if (durationRef.current) clearInterval(durationRef.current);
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
            console.error('Voice test start error:', err);
            setError(err instanceof Error ? err.message : 'Bağlantı hatası');
            setCallState('error');
        }
    }, [authFetch, voiceConfig, language, startTextOnlyMode]);

    // ── End Call ──
    const endCall = useCallback(() => {
        setCallState('ending');
        isSpeakingRef.current = false;

        if (durationRef.current) {
            clearInterval(durationRef.current);
            durationRef.current = null;
        }

        recognitionRef.current?.abort();
        recognitionRef.current = null;

        window.speechSynthesis.cancel();

        visualizerRef.current?.stop();
        visualizerRef.current = null;

        clientRef.current?.endSession();
        clientRef.current?.disconnect();
        clientRef.current = null;

        setCallState('idle');
    }, []);

    // ── Toggle Mute ──
    const toggleMute = () => {
        setIsMuted(!isMuted);
        if (recognitionRef.current) {
            if (!isMuted) {
                recognitionRef.current.abort();
            } else {
                try { recognitionRef.current.start(); } catch { /* ignore */ }
            }
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Call Status Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                        callState === 'connected' ? 'bg-emerald-400 animate-pulse'
                            : callState === 'connecting' ? 'bg-amber-400 animate-pulse'
                            : callState === 'error' ? 'bg-red-400'
                            : 'bg-white/20'
                    }`} />
                    <span className="text-xs text-white/50">
                        {callState === 'idle' && 'Hazır — Çağrıyı başlatın'}
                        {callState === 'connecting' && 'Bağlanıyor...'}
                        {callState === 'connected' && `Aktif Görüşme — ${formatDuration(callDuration)}`}
                        {callState === 'ending' && 'Sonlandırılıyor...'}
                        {callState === 'error' && 'Hata'}
                    </span>
                </div>
                {callState === 'connected' && (
                    <div className="flex items-center gap-2 text-xs text-white/30">
                        <Clock className="h-3 w-3" />
                        {formatDuration(callDuration)}
                    </div>
                )}
            </div>

            {/* Main Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {callState === 'idle' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
                        <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                            <Phone className="h-7 w-7 text-emerald-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white/80 mb-1">Sesli Test Çağrısı</h3>
                        <p className="text-xs text-white/30 max-w-xs mb-6 leading-relaxed">
                            Mikrofon izni vererek <span className="text-white/60">{agentName}</span> ile gerçek bir sesli görüşme başlatın.
                            Asistanınızın sesli yanıtlarını test edin.
                        </p>
                        <button
                            onClick={startCall}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all"
                        >
                            <Phone className="h-4 w-4" />
                            Çağrıyı Başlat
                        </button>
                    </div>
                )}

                {callState === 'connecting' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
                        <Loader2 className="h-10 w-10 text-inception-red animate-spin mb-4" />
                        <p className="text-sm text-white/50">Ses servisi bağlanıyor...</p>
                        <p className="text-xs text-white/20 mt-1">Mikrofon izni isteniyor</p>
                    </div>
                )}

                {callState === 'connected' && (
                    <>
                        {/* Audio Waveform */}
                        <div className="px-4 py-3 border-b border-white/[0.04]">
                            <div className="flex items-center gap-2 mb-2">
                                <Volume2 className="h-3 w-3 text-white/30" />
                                <span className="text-[10px] text-white/30 uppercase tracking-widest">Ses Sinyali</span>
                            </div>
                            <AudioWaveform
                                audioData={audioData}
                                volume={volume}
                                isActive={!isMuted}
                                color="#dc2626"
                                height={40}
                            />
                        </div>

                        {/* Transcript */}
                        <div className="flex-1 overflow-y-auto p-4 min-h-[150px]">
                            <div className="space-y-3">
                                {transcript.length === 0 && (
                                    <p className="text-xs text-white/20 text-center py-4">
                                        Konuşmaya başlayın...
                                    </p>
                                )}
                                {transcript.map((turn, i) => (
                                    <div key={i} className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                                            turn.speaker === 'user'
                                                ? 'bg-violet-600/80 text-white'
                                                : 'bg-white/10 text-white/80'
                                        }`}>
                                            <div className="flex items-center gap-1 mb-0.5">
                                                {turn.speaker === 'user' ? <User className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5 text-violet-400" />}
                                                <span className="text-[9px] text-white/30">{turn.speaker === 'user' ? 'Siz' : agentName}</span>
                                            </div>
                                            <p className="whitespace-pre-wrap text-xs">{turn.text}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={transcriptEndRef} />
                            </div>
                        </div>

                        {/* Call Controls */}
                        <div className="border-t border-white/[0.06] p-4 flex items-center justify-center gap-4">
                            <button
                                onClick={toggleMute}
                                className={`h-11 w-11 rounded-full flex items-center justify-center transition-all ${
                                    isMuted
                                        ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                                        : 'bg-white/[0.06] border border-white/[0.10] text-white/60 hover:bg-white/[0.10]'
                                }`}
                            >
                                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                            </button>
                            <button
                                onClick={endCall}
                                className="h-11 px-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center gap-2 text-sm font-medium transition-all shadow-lg shadow-red-500/20"
                            >
                                <PhoneOff className="h-4 w-4" />
                                Bitir
                            </button>
                        </div>
                    </>
                )}

                {callState === 'error' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
                        <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                            <AlertCircle className="h-7 w-7 text-red-400" />
                        </div>
                        <p className="text-sm text-red-300 mb-2">{error || 'Bağlantı hatası'}</p>
                        <p className="text-xs text-white/20 mb-4">Lütfen tekrar deneyin veya mikrofon izni verin.</p>
                        <button
                            onClick={() => { setCallState('idle'); setError(null); }}
                            className="text-xs text-inception-red hover:text-inception-red-light flex items-center gap-1"
                        >
                            Tekrar Dene
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
