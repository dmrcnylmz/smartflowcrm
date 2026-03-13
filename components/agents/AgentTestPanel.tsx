'use client';

/**
 * AgentTestPanel — Unified test panel for agents
 *
 * Single unified chat interface with:
 * - Text chat (default)
 * - Voice toggle via mic button in input area
 * - RAG Gate overlay blocking testing when no KB exists
 *
 * Replaces the previous 3-tab layout (Metin / Sesli / Bilgi Bankası).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Send, X, Bot, User, Loader2, Zap, Clock, MessageCircle,
    Sparkles, Mic, MicOff, Phone, PhoneOff, Wifi, WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { AgentDraft, AgentTestScenario, AgentVoiceConfig } from '@/lib/agents/types';
import { getTemplateById } from '@/lib/agents/templates';
import { VoiceTestInline, type VoiceTestHandle, type CallState, type VoiceMode } from './VoiceTestInline';
import { RAGGateOverlay } from './RAGGateOverlay';
import { useAgentKBCheck } from '@/lib/hooks/useAgentKBCheck';
import type { TranscriptTurn } from '@/lib/voice/personaplex-client';

// =============================================
// Types
// =============================================

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    intent?: string;
    shortcut?: boolean;
    cached?: boolean;
    timestamp: Date;
    latencyMs?: number;
    /** Messages from voice mode are tagged */
    voiceMode?: boolean;
}

interface AgentTestPanelProps {
    /** Agent ID (for saved agents) */
    agentId?: string;
    /** Agent draft data (for pre-save testing) */
    draft?: AgentDraft;
    /** Agent name display */
    agentName: string;
    /** Template ID for scenario suggestions */
    templateId?: string;
    /** Custom system prompt (overrides agent config) */
    systemPrompt?: string;
    /** Voice config for voice testing */
    voiceConfig?: AgentVoiceConfig;
    /** Callback to close panel */
    onClose?: () => void;
    /** Inline mode (no close button, embedded) */
    inline?: boolean;
    /** Callback when user clicks "Add KB" from RAG gate */
    onAddKB?: () => void;
}

// =============================================
// Component
// =============================================

export function AgentTestPanel({
    agentId,
    draft,
    agentName,
    templateId,
    systemPrompt,
    voiceConfig,
    onClose,
    inline = false,
    onAddKB,
}: AgentTestPanelProps) {
    const authFetch = useAuthFetch();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId] = useState(`test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const [metrics, setMetrics] = useState({
        totalTurns: 0,
        avgLatencyMs: 0,
        shortcuts: 0,
        cacheHits: 0,
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ─── Voice state ───
    const voiceRef = useRef<VoiceTestHandle>(null);
    const [voiceActive, setVoiceActive] = useState(false);
    const [voiceCallState, setVoiceCallState] = useState<CallState>('idle');
    const [voiceModeBadge, setVoiceModeBadge] = useState<VoiceMode>('gpu');
    const [voiceDuration, setVoiceDuration] = useState(0);

    // ─── RAG Gate ───
    const { hasKB, isChecking, recheck } = useAgentKBCheck(agentId);

    // Get test scenarios from template
    const template = templateId ? getTemplateById(templateId) : null;
    const scenarios: AgentTestScenario[] = template?.scenarios || [];

    // Initialize session
    useEffect(() => {
        setMessages([{
            role: 'system',
            content: `${agentName} test oturumu baslatildi. Mesaj yazarak veya mikrofon butonunu kullanarak asistani test edin.`,
            timestamp: new Date(),
        }]);
        setTimeout(() => inputRef.current?.focus(), 200);
    }, [agentName]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send text message
    const sendMessage = useCallback(async (text?: string) => {
        const userText = (text || input).trim();
        if (!userText || loading) return;
        if (!text) setInput('');

        setMessages(prev => [...prev, {
            role: 'user',
            content: userText,
            timestamp: new Date(),
        }]);

        setLoading(true);
        const startTime = Date.now();

        try {
            const response = await authFetch('/api/voice/pipeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 'default',
                    sessionId,
                    action: 'text',
                    text: userText,
                    ...(systemPrompt ? { systemPrompt } : {}),
                }),
            });

            const data = await response.json();
            const latencyMs = Date.now() - startTime;

            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.response,
                    intent: data.intent?.intent,
                    shortcut: data.shortcut,
                    cached: data.cached,
                    timestamp: new Date(),
                    latencyMs,
                }]);

                setMetrics(prev => ({
                    totalTurns: prev.totalTurns + 1,
                    avgLatencyMs: Math.round(((prev.avgLatencyMs * prev.totalTurns) + latencyMs) / (prev.totalTurns + 1)),
                    shortcuts: prev.shortcuts + (data.shortcut ? 1 : 0),
                    cacheHits: prev.cacheHits + (data.cached ? 1 : 0),
                }));
            } else {
                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Hata: ${data.error || 'Bilinmeyen hata'}`,
                    timestamp: new Date(),
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'system',
                content: `Baglanti hatasi: ${err instanceof Error ? err.message : 'Sunucu yanit vermedi'}`,
                timestamp: new Date(),
            }]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, sessionId, systemPrompt, authFetch]);

    // ─── Voice Callbacks ───

    const handleTranscriptUpdate = useCallback((turn: TranscriptTurn) => {
        setMessages(prev => [...prev, {
            role: turn.speaker === 'user' ? 'user' : 'assistant',
            content: turn.text,
            timestamp: new Date(),
            voiceMode: true,
        }]);
        if (turn.speaker === 'assistant') {
            setMetrics(prev => ({
                ...prev,
                totalTurns: prev.totalTurns + 1,
            }));
        }
    }, []);

    const handleCallStateChange = useCallback((state: CallState) => {
        setVoiceCallState(state);
        if (state === 'connected') {
            setMessages(prev => [...prev, {
                role: 'system',
                content: 'Sesli gorusme basladi. Konusmaya baslayin...',
                timestamp: new Date(),
            }]);
        } else if (state === 'idle' && voiceActive) {
            setMessages(prev => [...prev, {
                role: 'system',
                content: 'Sesli gorusme sona erdi.',
                timestamp: new Date(),
            }]);
        }
    }, [voiceActive]);

    const handleVoiceModeChange = useCallback((mode: VoiceMode) => {
        setVoiceModeBadge(mode);
    }, []);

    const handleDurationUpdate = useCallback((seconds: number) => {
        setVoiceDuration(seconds);
    }, []);

    // ─── Toggle Voice Mode ───
    const toggleVoice = useCallback(() => {
        if (voiceActive) {
            // End voice call
            voiceRef.current?.endCall();
            setVoiceActive(false);
            setVoiceDuration(0);
        } else {
            // Start voice call
            setVoiceActive(true);
            // Small delay to let embedded VoiceTestInline mount before calling startCall
            setTimeout(() => {
                voiceRef.current?.startCall();
            }, 100);
        }
    }, [voiceActive]);

    // Format duration
    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // ─── Render ───

    const containerClass = inline
        ? 'bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden flex flex-col relative'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';

    const cardClass = inline
        ? 'flex flex-col h-[520px] relative'
        : 'w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl relative';

    // Default onAddKB: navigate to /knowledge
    const handleAddKB = onAddKB || (() => {
        window.location.href = '/knowledge';
    });

    return (
        <div className={containerClass}>
            <div className={cardClass}>
                {/* RAG Gate Overlay */}
                <RAGGateOverlay
                    agentName={agentName}
                    hasKB={hasKB}
                    isChecking={isChecking}
                    onAddKB={handleAddKB}
                />

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <span className="text-sm font-medium text-white/80">{agentName} — Test</span>
                        {voiceActive && voiceCallState === 'connected' && (
                            <Badge variant="outline" className={`text-[9px] border-0 py-0.5 ${
                                voiceModeBadge === 'gpu'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-blue-500/10 text-blue-400'
                            }`}>
                                {voiceModeBadge === 'gpu' ? (
                                    <><Wifi className="h-2.5 w-2.5 mr-1" /> GPU</>
                                ) : (
                                    <><WifiOff className="h-2.5 w-2.5 mr-1" /> Cartesia</>
                                )}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Metrics — always visible */}
                        <div className="hidden md:flex items-center gap-3 text-xs text-white/40">
                            <span className="flex items-center gap-1">
                                <MessageCircle className="h-3 w-3" />
                                {metrics.totalTurns} tur
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {metrics.avgLatencyMs}ms
                            </span>
                            {metrics.shortcuts > 0 && (
                                <span className="flex items-center gap-1 text-amber-400">
                                    <Zap className="h-3 w-3" />
                                    {metrics.shortcuts}
                                </span>
                            )}
                            {voiceActive && voiceCallState === 'connected' && (
                                <span className="flex items-center gap-1 text-emerald-400">
                                    <Phone className="h-3 w-3" />
                                    {formatDuration(voiceDuration)}
                                </span>
                            )}
                        </div>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                            >
                                <X className="h-4 w-4 text-white/50" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Unified Chat Area */}
                <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Test Scenarios */}
                    {scenarios.length > 0 && messages.length <= 1 && !voiceActive && (
                        <div className="px-4 py-2 border-b border-white/[0.04]">
                            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Test Senaryolari</p>
                            <div className="flex flex-wrap gap-1.5">
                                {scenarios.map((scenario, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(scenario.message)}
                                        className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors flex items-center gap-1"
                                    >
                                        <Sparkles className="h-2.5 w-2.5" />
                                        {scenario.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-[150px]">
                        <div className="space-y-3">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div
                                        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                                            msg.role === 'user'
                                                ? 'bg-violet-600 text-white'
                                                : msg.role === 'assistant'
                                                    ? 'bg-white/10 text-white/80'
                                                    : 'bg-blue-500/10 text-blue-300 text-xs italic'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {msg.role === 'user' && <User className="h-3 w-3" />}
                                            {msg.role === 'assistant' && <Bot className="h-3 w-3 text-violet-400" />}
                                            <span className="text-[10px] text-white/40">
                                                {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                            {msg.voiceMode && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-400">
                                                    sesli
                                                </Badge>
                                            )}
                                            {msg.intent && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-violet-500/30 text-violet-400">
                                                    {msg.intent}
                                                </Badge>
                                            )}
                                            {msg.shortcut && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/30 text-amber-400">
                                                    kisayol
                                                </Badge>
                                            )}
                                            {msg.latencyMs && (
                                                <span className="text-[9px] text-white/20">{msg.latencyMs}ms</span>
                                            )}
                                        </div>
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                                        <span className="text-sm text-white/40">Dusunuyor...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input Area with Voice Toggle */}
                    <div className="border-t border-white/[0.06] p-3">
                        {/* Voice active banner */}
                        {voiceActive && voiceCallState === 'connected' && (
                            <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs text-emerald-400">Sesli gorusme aktif — {formatDuration(voiceDuration)}</span>
                                </div>
                                <button
                                    onClick={toggleVoice}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <PhoneOff className="h-3 w-3" />
                                    Bitir
                                </button>
                            </div>
                        )}

                        {voiceActive && voiceCallState === 'connecting' && (
                            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                <span className="text-xs text-amber-400">Ses servisi baglaniyor...</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder={voiceActive && voiceCallState === 'connected' ? 'Sesli gorusme aktif — konusun...' : 'Bir mesaj yazin...'}
                                disabled={loading || (voiceActive && voiceCallState === 'connected')}
                                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50"
                            />

                            {/* Mic Toggle Button */}
                            <button
                                onClick={toggleVoice}
                                disabled={loading}
                                title={voiceActive ? 'Sesli gorusmeyi bitir' : 'Sesli gorusme baslat'}
                                className={`p-2.5 rounded-lg transition-all ${
                                    voiceActive
                                        ? voiceCallState === 'connected'
                                            ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/20 animate-pulse'
                                            : 'bg-amber-600 hover:bg-amber-500'
                                        : 'bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10] text-white/40 hover:text-white/60'
                                }`}
                            >
                                {voiceActive ? (
                                    <MicOff className="h-4 w-4 text-white" />
                                ) : (
                                    <Mic className="h-4 w-4" />
                                )}
                            </button>

                            {/* Send Button */}
                            <button
                                onClick={() => sendMessage()}
                                disabled={!input.trim() || loading || (voiceActive && voiceCallState === 'connected')}
                                className="p-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="h-4 w-4 text-white" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Embedded VoiceTestInline (invisible — only manages audio/STT) */}
                {voiceActive && (
                    <VoiceTestInline
                        ref={voiceRef}
                        agentId={agentId}
                        agentName={agentName}
                        voiceConfig={voiceConfig}
                        systemPrompt={systemPrompt}
                        embedded
                        onTranscriptUpdate={handleTranscriptUpdate}
                        onCallStateChange={handleCallStateChange}
                        onDurationUpdate={handleDurationUpdate}
                        onVoiceModeChange={handleVoiceModeChange}
                    />
                )}
            </div>
        </div>
    );
}
