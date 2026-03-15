'use client';

/**
 * SupportChatWidget — Landing Page Live Support Chat
 *
 * Full-featured chat widget with text and voice modes.
 * Text mode uses SSE streaming for real-time AI responses.
 * Voice mode uses Web Speech API (STT) + Cartesia TTS.
 *
 * Only rendered on the /landing page (see ClientLayout).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare,
    X,
    Send,
    Mic,
    MicOff,
    Bot,
    User,
    Volume2,
    Keyboard,
    Square,
} from 'lucide-react';
import { AudioWaveform } from '@/components/voice/AudioWaveform';
import { getCookieConsent } from '@/components/layout/CookieConsent';

// ─── Web Speech API Types (not available in all TS dom libs) ────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

type WidgetState = 'closed' | 'open';
type ChatMode = 'text' | 'voice';
type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 500;

// ─── Speech Recognition Helper ──────────────────────────────────────────────

function getSpeechRecognition(): SpeechRecognitionLike | null {
    if (typeof window === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return null;
    return new SpeechRecognitionAPI() as SpeechRecognitionLike;
}

function hasSpeechSupport(): boolean {
    if (typeof window === 'undefined') return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SupportChatWidget() {
    const t = useTranslations('supportChat');

    // --- State ---
    const [widgetState, setWidgetState] = useState<WidgetState>('closed');
    const [mode, setMode] = useState<ChatMode>('text');
    const [messages, setMessages] = useState<ChatMessage[]>(() => [{
        id: 'welcome',
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
    }]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [voiceState, setVoiceState] = useState<VoiceState>('idle');
    const [voiceVolume, setVoiceVolume] = useState(0);
    const [hasCookieBanner, setHasCookieBanner] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);

    // --- Refs ---
    const sessionIdRef = useRef<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // --- Set welcome message with translation ---
    useEffect(() => {
        setMessages(prev => prev.map(m =>
            m.id === 'welcome' ? { ...m, content: t('welcomeMessage') } : m
        ));
    }, [t]);

    // --- Init ---
    useEffect(() => {
        sessionIdRef.current = crypto.randomUUID();
        setSpeechSupported(hasSpeechSupport());

        // Check if cookie banner is visible
        const consent = getCookieConsent();
        setHasCookieBanner(!consent);

        // Listen for consent changes
        const handleConsent = () => setHasCookieBanner(false);
        window.addEventListener('cookie-consent-change', handleConsent);
        return () => window.removeEventListener('cookie-consent-change', handleConsent);
    }, []);

    // --- Auto-scroll ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // --- Focus input when opening text mode ---
    useEffect(() => {
        if (widgetState === 'open' && mode === 'text') {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [widgetState, mode]);

    // --- Cleanup on unmount ---
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            recognitionRef.current?.abort();
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (volumeIntervalRef.current) {
                clearInterval(volumeIntervalRef.current);
            }
        };
    }, []);

    // ─── Text Chat ──────────────────────────────────────────────────────────

    const sendTextMessage = useCallback(async (text: string) => {
        if (!text.trim() || isStreaming) return;

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsStreaming(true);

        // Create placeholder for assistant
        const assistantId = crypto.randomUUID();
        setMessages(prev => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
        ]);

        try {
            abortRef.current = new AbortController();

            const res = await fetch('/api/chat/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionIdRef.current,
                    message: text.trim(),
                    language: 'tr',
                }),
                signal: abortRef.current.signal,
            });

            if (!res.ok) {
                const errorText = res.status === 429
                    ? t('rateLimitError')
                    : t('genericError');
                setMessages(prev =>
                    prev.map(m => (m.id === assistantId ? { ...m, content: errorText } : m)),
                );
                setIsStreaming(false);
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
                setIsStreaming(false);
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const { token } = JSON.parse(data);
                        if (token) {
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId ? { ...m, content: m.content + token } : m,
                                ),
                            );
                        }
                    } catch {
                        // Skip malformed chunks
                    }
                }
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: t('connectionError') }
                        : m,
                ),
            );
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [isStreaming, t]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage(input);
        }
    };

    // ─── Voice Chat ─────────────────────────────────────────────────────────

    const stopAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        if (volumeIntervalRef.current) {
            clearInterval(volumeIntervalRef.current);
            volumeIntervalRef.current = null;
        }
        setVoiceVolume(0);
    }, []);

    const speakResponse = useCallback(async (text: string) => {
        setVoiceState('speaking');

        try {
            const res = await fetch('/api/chat/support/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.slice(0, 500), language: 'tr' }),
            });

            if (!res.ok) {
                setVoiceState('idle');
                return;
            }

            const audioBlob = await res.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            // Simple volume simulation for waveform
            volumeIntervalRef.current = setInterval(() => {
                setVoiceVolume(Math.random() * 0.5 + 0.3);
            }, 100);

            audio.onended = () => {
                stopAudio();
                URL.revokeObjectURL(audioUrl);
                setVoiceState('idle');
            };

            audio.onerror = () => {
                stopAudio();
                URL.revokeObjectURL(audioUrl);
                setVoiceState('idle');
            };

            await audio.play();
        } catch {
            stopAudio();
            setVoiceState('idle');
        }
    }, [stopAudio]);

    const sendVoiceMessage = useCallback(async (transcript: string) => {
        if (!transcript.trim()) {
            setVoiceState('idle');
            return;
        }

        setVoiceState('processing');

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: transcript.trim(),
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            const res = await fetch('/api/chat/support', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: sessionIdRef.current,
                    message: transcript.trim(),
                    language: 'tr',
                }),
            });

            if (!res.ok) {
                setVoiceState('idle');
                const errMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: t('genericError'),
                    timestamp: Date.now(),
                };
                setMessages(prev => [...prev, errMsg]);
                return;
            }

            const data = await res.json();
            const responseText = data.response || '';

            const assistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMessage]);

            // TTS
            if (responseText) {
                await speakResponse(responseText);
            } else {
                setVoiceState('idle');
            }
        } catch {
            setVoiceState('idle');
            const errMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: t('connectionError'),
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errMsg]);
        }
    }, [speakResponse, t]);

    const startListening = useCallback(() => {
        const recognition = getSpeechRecognition();
        if (!recognition) return;

        recognition.lang = 'tr-TR';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            const transcript = event.results?.[0]?.[0]?.transcript || '';
            sendVoiceMessage(transcript);
        };

        recognition.onerror = () => {
            setVoiceState('idle');
        };

        recognition.onend = () => {
            if (voiceState === 'listening') {
                setVoiceState('idle');
            }
        };

        recognitionRef.current = recognition;
        setVoiceState('listening');
        recognition.start();
    }, [sendVoiceMessage, voiceState]);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setVoiceState('idle');
    }, []);

    const handleMicClick = useCallback(() => {
        if (voiceState === 'listening') {
            stopListening();
        } else if (voiceState === 'speaking') {
            stopAudio();
            setVoiceState('idle');
        } else if (voiceState === 'idle') {
            startListening();
        }
    }, [voiceState, startListening, stopListening, stopAudio]);

    // ─── Widget Controls ────────────────────────────────────────────────────

    const toggleWidget = () => {
        setWidgetState(prev => (prev === 'closed' ? 'open' : 'closed'));
    };

    const switchMode = (newMode: ChatMode) => {
        // Clean up any active voice state when switching
        if (mode === 'voice') {
            stopListening();
            stopAudio();
            setVoiceState('idle');
        }
        if (mode === 'text' && isStreaming) {
            abortRef.current?.abort();
            setIsStreaming(false);
        }
        setMode(newMode);
    };

    // ─── Render ─────────────────────────────────────────────────────────────

    const buttonBottom = hasCookieBanner ? 'bottom-28' : 'bottom-6';

    return (
        <>
            {/* ── Floating Trigger Button ─────────────────────────────────── */}
            <AnimatePresence>
                {widgetState === 'closed' && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={toggleWidget}
                        className={`fixed right-6 ${buttonBottom} z-[9990] h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 flex items-center justify-center transition-[bottom] duration-300`}
                        aria-label={t('liveSupport')}
                    >
                        <MessageSquare className="h-6 w-6" />

                        {/* Pulse ring */}
                        <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* ── Chat Panel ──────────────────────────────────────────────── */}
            <AnimatePresence>
                {widgetState === 'open' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className={`fixed z-[9990] flex flex-col
                            max-sm:inset-0
                            sm:right-6 sm:${buttonBottom} sm:w-[380px] sm:h-[520px] sm:rounded-2xl
                            bg-slate-900 border border-white/10 shadow-2xl shadow-black/30
                            overflow-hidden`}
                    >
                        {/* ── Header ──────────────────────────────────── */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-b border-white/10 flex-shrink-0">
                            {/* Bot avatar */}
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="h-5 w-5 text-white" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-white truncate">
                                    {t('headerTitle')}
                                </h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs text-slate-400">{t('online')}</span>
                                </div>
                            </div>

                            {/* Mode toggle */}
                            {speechSupported && (
                                <button
                                    onClick={() => switchMode(mode === 'text' ? 'voice' : 'text')}
                                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                    title={mode === 'text' ? t('switchToVoice') : t('switchToText')}
                                >
                                    {mode === 'text' ? (
                                        <Volume2 className="h-4 w-4" />
                                    ) : (
                                        <Keyboard className="h-4 w-4" />
                                    )}
                                </button>
                            )}

                            {/* Close */}
                            <button
                                onClick={toggleWidget}
                                className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                aria-label={t('close')}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* ── Body ────────────────────────────────────── */}
                        {mode === 'text' ? (
                            <TextChatBody
                                messages={messages}
                                messagesEndRef={messagesEndRef}
                                isStreaming={isStreaming}
                            />
                        ) : (
                            <VoiceChatBody
                                voiceState={voiceState}
                                voiceVolume={voiceVolume}
                                messages={messages}
                                onMicClick={handleMicClick}
                            />
                        )}

                        {/* ── Input (text mode only) ──────────────────── */}
                        {mode === 'text' && (
                            <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
                                <div className="flex items-end gap-2">
                                    <div className="flex-1 relative">
                                        <textarea
                                            ref={inputRef}
                                            value={input}
                                            onChange={e => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                                            onKeyDown={handleKeyDown}
                                            placeholder={t('placeholder')}
                                            disabled={isStreaming}
                                            rows={1}
                                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 max-h-24 overflow-y-auto"
                                            style={{ minHeight: '42px' }}
                                        />
                                        {input.length > 400 && (
                                            <span className="absolute right-2 bottom-1 text-[10px] text-slate-500">
                                                {input.length}/{MAX_MESSAGE_LENGTH}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => sendTextMessage(input)}
                                        disabled={!input.trim() || isStreaming}
                                        className="h-[42px] w-[42px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-colors flex-shrink-0"
                                        aria-label={t('send')}
                                    >
                                        <Send className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// ─── Text Chat Body ─────────────────────────────────────────────────────────

function TextChatBody({
    messages,
    messagesEndRef,
    isStreaming,
}: {
    messages: ChatMessage[];
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    isStreaming: boolean;
}) {
    return (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {messages.map(msg => (
                <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                    {/* Avatar */}
                    <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            msg.role === 'user'
                                ? 'bg-blue-600'
                                : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                        }`}
                    >
                        {msg.role === 'user' ? (
                            <User className="h-3.5 w-3.5 text-white" />
                        ) : (
                            <Bot className="h-3.5 w-3.5 text-white" />
                        )}
                    </div>

                    {/* Bubble */}
                    <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-md'
                                : 'bg-slate-800 text-slate-200 rounded-bl-md'
                        }`}
                    >
                        {msg.content || <TypingIndicator />}
                    </div>
                </div>
            ))}

            {/* Streaming indicator */}
            {isStreaming && messages[messages.length - 1]?.content && (
                <div className="flex items-center gap-1.5 pl-10 text-slate-500 text-xs">
                    <div className="flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
}

// ─── Voice Chat Body ────────────────────────────────────────────────────────

function VoiceChatBody({
    voiceState,
    voiceVolume,
    messages,
    onMicClick,
}: {
    voiceState: VoiceState;
    voiceVolume: number;
    messages: ChatMessage[];
    onMicClick: () => void;
}) {
    // Last user and assistant messages
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');

    const t = useTranslations('supportChat');

    const statusText = {
        idle: t('voiceIdle'),
        listening: t('voiceListening'),
        processing: t('voiceProcessing'),
        speaking: t('voiceSpeaking'),
    }[voiceState];

    const statusColor = {
        idle: 'text-slate-400',
        listening: 'text-red-400',
        processing: 'text-yellow-400',
        speaking: 'text-blue-400',
    }[voiceState];

    return (
        <div className="flex-1 flex flex-col items-center justify-between px-4 py-6">
            {/* Transcript area */}
            <div className="w-full space-y-3 flex-1 overflow-y-auto mb-4">
                {lastUserMsg && (
                    <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-slate-300">{lastUserMsg.content}</p>
                    </div>
                )}
                {lastAssistantMsg && (
                    <div className="flex items-start gap-2">
                        <Bot className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-slate-300">{lastAssistantMsg.content}</p>
                    </div>
                )}
            </div>

            {/* Waveform */}
            <div className="w-full mb-4">
                <AudioWaveform
                    volume={voiceVolume}
                    isActive={voiceState === 'listening' || voiceState === 'speaking'}
                    color={voiceState === 'listening' ? '#ef4444' : '#3b82f6'}
                    backgroundColor="#0f172a"
                    className="h-16"
                />
            </div>

            {/* Status */}
            <p className={`text-sm font-medium mb-4 ${statusColor}`}>
                {statusText}
            </p>

            {/* Mic button */}
            <button
                onClick={onMicClick}
                disabled={voiceState === 'processing'}
                className={`relative h-16 w-16 rounded-full flex items-center justify-center transition-all
                    ${voiceState === 'listening'
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : voiceState === 'speaking'
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50'
                    }`}
                aria-label={voiceState === 'listening' ? t('stopListening') : voiceState === 'speaking' ? t('stopSpeaking') : t('startListening')}
            >
                {voiceState === 'listening' ? (
                    <MicOff className="h-6 w-6" />
                ) : voiceState === 'speaking' ? (
                    <Square className="h-5 w-5" />
                ) : voiceState === 'processing' ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                    <Mic className="h-6 w-6" />
                )}

                {/* Listening pulse */}
                {voiceState === 'listening' && (
                    <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
                )}
            </button>
        </div>
    );
}

// ─── Typing Indicator ───────────────────────────────────────────────────────

function TypingIndicator() {
    return (
        <div className="flex items-center gap-1 py-1 px-1">
            <span
                className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                style={{ animationDelay: '0ms' }}
            />
            <span
                className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                style={{ animationDelay: '150ms' }}
            />
            <span
                className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                style={{ animationDelay: '300ms' }}
            />
        </div>
    );
}
