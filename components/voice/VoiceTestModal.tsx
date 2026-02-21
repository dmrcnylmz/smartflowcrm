'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Mic,
    MicOff,
    Send,
    X,
    Bot,
    User,
    Loader2,
    Zap,
    Clock,
} from 'lucide-react';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    intent?: string;
    shortcut?: boolean;
    cached?: boolean;
    timestamp: Date;
}

interface VoiceTestModalProps {
    tenantId?: string;
    agentName?: string;
    isOpen: boolean;
    onClose: () => void;
}

export function VoiceTestModal({
    tenantId = 'default',
    agentName = 'SmartFlow AI',
    isOpen,
    onClose,
}: VoiceTestModalProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId] = useState(`test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const [metrics, setMetrics] = useState<{
        totalTurns: number;
        avgLatencyMs: number;
        shortcuts: number;
        cacheHits: number;
    }>({ totalTurns: 0, avgLatencyMs: 0, shortcuts: 0, cacheHits: 0 });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setMessages([{
                role: 'system',
                content: `🤖 ${agentName} test oturumu başlatıldı. Metin yazarak ajanı test edin.`,
                timestamp: new Date(),
            }]);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, agentName]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userText = input.trim();
        setInput('');

        // Add user message
        setMessages(prev => [...prev, {
            role: 'user',
            content: userText,
            timestamp: new Date(),
        }]);

        setLoading(true);
        const startTime = Date.now();

        try {
            const response = await fetch('/api/voice/pipeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    sessionId,
                    action: 'text',
                    text: userText,
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
                }]);

                // Update metrics
                setMetrics(prev => ({
                    totalTurns: prev.totalTurns + 1,
                    avgLatencyMs: Math.round(((prev.avgLatencyMs * prev.totalTurns) + latencyMs) / (prev.totalTurns + 1)),
                    shortcuts: prev.shortcuts + (data.shortcut ? 1 : 0),
                    cacheHits: prev.cacheHits + (data.cached ? 1 : 0),
                }));
            } else {
                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `❌ Hata: ${data.error || 'Bilinmeyen hata'}`,
                    timestamp: new Date(),
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'system',
                content: `❌ Bağlantı hatası: ${err instanceof Error ? err.message : 'Sunucu yanıt vermedi'}`,
                timestamp: new Date(),
            }]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <Card className="w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col shadow-2xl border-violet-500/20">
                {/* Header */}
                <CardHeader className="pb-3 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Bot className="h-5 w-5 text-violet-400" />
                            {agentName} — Test Oturumu
                        </CardTitle>
                        <div className="flex items-center gap-3">
                            {/* Metrics */}
                            <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {metrics.avgLatencyMs}ms
                                </span>
                                <span className="flex items-center gap-1">
                                    <Zap className="h-3 w-3 text-amber-400" />
                                    {metrics.shortcuts} kısayol
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </CardHeader>

                {/* Messages */}
                <CardContent className="flex-1 overflow-y-auto p-4 min-h-[300px] max-h-[50vh]">
                    <div className="space-y-3">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${msg.role === 'user'
                                            ? 'bg-violet-600 text-white'
                                            : msg.role === 'assistant'
                                                ? 'bg-white/10 text-foreground'
                                                : 'bg-blue-500/10 text-blue-300 text-xs italic'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        {msg.role === 'user' && <User className="h-3 w-3" />}
                                        {msg.role === 'assistant' && <Bot className="h-3 w-3 text-violet-400" />}
                                        <span className="text-[10px] text-white/60">
                                            {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        {msg.intent && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                                                {msg.intent}
                                            </span>
                                        )}
                                        {msg.shortcut && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                                                ⚡ kısayol
                                            </span>
                                        )}
                                        {msg.cached && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                                                💾 cache
                                            </span>
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
                                    <span className="text-sm text-muted-foreground">Düşünüyor...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </CardContent>

                {/* Input */}
                <div className="border-t border-white/10 p-3">
                    <div className="flex items-center gap-2">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                            placeholder="Bir mesaj yazın..."
                            disabled={loading}
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            className="p-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                        Tenant: {tenantId} · Session: {sessionId.slice(0, 12)}...
                    </p>
                </div>
            </Card>
        </div>
    );
}
