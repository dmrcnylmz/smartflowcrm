'use client';

/**
 * AgentTestPanel — Tabbed test panel for agents
 *
 * 3 Tabs:
 * - 💬 Metin: Text-based chat testing (original)
 * - 🎙️ Sesli: Real voice call testing (VoiceTestInline)
 * - 📚 Bilgi Bankası: Quick KB content addition (KBQuickAdd)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Send, X, Bot, User, Loader2, Zap, Clock, MessageCircle,
    Sparkles, ChevronRight, Mic, BookOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { AgentDraft, AgentTestScenario, AgentVoiceConfig } from '@/lib/agents/types';
import { getTemplateById } from '@/lib/agents/templates';
import { VoiceTestInline } from './VoiceTestInline';
import { KBQuickAdd } from './KBQuickAdd';

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
}

type TestTab = 'chat' | 'voice' | 'knowledge';

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
}

// =============================================
// Tab Definitions
// =============================================

const TEST_TABS: { id: TestTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'chat', label: 'Metin', icon: MessageCircle },
    { id: 'voice', label: 'Sesli', icon: Mic },
    { id: 'knowledge', label: 'Bilgi Bankası', icon: BookOpen },
];

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
}: AgentTestPanelProps) {
    const authFetch = useAuthFetch();
    const [activeTab, setActiveTab] = useState<TestTab>('chat');
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

    // Get test scenarios from template
    const template = templateId ? getTemplateById(templateId) : null;
    const scenarios: AgentTestScenario[] = template?.scenarios || [];

    // Initialize session
    useEffect(() => {
        setMessages([{
            role: 'system',
            content: `${agentName} test oturumu baslatildi. Mesaj yazarak asistani test edin.`,
            timestamp: new Date(),
        }]);
        setTimeout(() => inputRef.current?.focus(), 200);
    }, [agentName]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send message
    const sendMessage = useCallback(async (text?: string) => {
        const userText = (text || input).trim();
        if (!userText || loading) return;
        if (!text) setInput('');

        // Add user message
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

    // ─── Render ───

    const containerClass = inline
        ? 'bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden flex flex-col'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';

    const cardClass = inline
        ? 'flex flex-col h-[520px]'
        : 'w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl';

    return (
        <div className={containerClass}>
            <div className={cardClass}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <span className="text-sm font-medium text-white/80">{agentName} — Test</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Metrics (only for chat tab) */}
                        {activeTab === 'chat' && (
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
                            </div>
                        )}
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

                {/* Tab Bar */}
                <div className="flex border-b border-white/[0.06]">
                    {TEST_TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all border-b-2 ${
                                    isActive
                                        ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                                        : 'border-transparent text-white/30 hover:text-white/50 hover:bg-white/[0.02]'
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                {activeTab === 'chat' && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Test Scenarios */}
                        {scenarios.length > 0 && messages.length <= 1 && (
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

                        {/* Input */}
                        <div className="border-t border-white/[0.06] p-3">
                            <div className="flex items-center gap-2">
                                <input
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Bir mesaj yazin..."
                                    disabled={loading}
                                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50"
                                />
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || loading}
                                    className="p-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="h-4 w-4 text-white" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'voice' && (
                    <VoiceTestInline
                        agentId={agentId}
                        agentName={agentName}
                        voiceConfig={voiceConfig}
                        systemPrompt={systemPrompt}
                    />
                )}

                {activeTab === 'knowledge' && (
                    <KBQuickAdd
                        agentId={agentId}
                        agentName={agentName}
                        onSwitchToChat={() => setActiveTab('chat')}
                    />
                )}
            </div>
        </div>
    );
}
