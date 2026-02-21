'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Cpu,
    Activity,
    Wifi,
    WifiOff,
    Zap,
    Users,
    Timer,
    HardDrive,
    RefreshCw,
} from 'lucide-react';

interface GPUHealth {
    status: 'healthy' | 'degraded' | 'offline';
    personaplex: boolean;
    model_loaded: boolean;
    gpu: string | null;
    gpu_memory_gb?: number;
    active_sessions: number;
    max_sessions: number;
    latency_ms: number;
    uptime_seconds?: number;
    mode: 'live' | 'mock' | 'degraded';
    cached?: boolean;
    system?: {
        circuitBreakers?: Record<string, string>;
        cache?: Record<string, { hits: number; misses: number; size: number }>;
    };
}

interface PipelineStatus {
    status: string;
    pipeline: {
        configured: boolean;
        providers: {
            stt: string;
            llm: string;
            tts: string;
        };
    };
}

export function VoiceAIStatus() {
    const [health, setHealth] = useState<GPUHealth | null>(null);
    const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const fetchHealth = useCallback(async () => {
        setLoading(true);
        try {
            const [healthRes, pipelineRes] = await Promise.all([
                fetch('/api/voice/health').then(r => r.json()),
                fetch('/api/voice/pipeline').then(r => r.json()),
            ]);
            setHealth(healthRes);
            setPipeline(pipelineRes);
            setLastChecked(new Date());
        } catch {
            setHealth({
                status: 'offline',
                personaplex: false,
                model_loaded: false,
                gpu: null,
                active_sessions: 0,
                max_sessions: 0,
                latency_ms: 0,
                mode: 'degraded',
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [fetchHealth]);

    const statusColor = health?.status === 'healthy'
        ? 'text-emerald-400'
        : health?.status === 'degraded'
            ? 'text-amber-400'
            : 'text-red-400';

    const statusBg = health?.status === 'healthy'
        ? 'bg-emerald-500/10 border-emerald-500/20'
        : health?.status === 'degraded'
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-red-500/10 border-red-500/20';

    const statusDot = health?.status === 'healthy'
        ? 'bg-emerald-400'
        : health?.status === 'degraded'
            ? 'bg-amber-400'
            : 'bg-red-400';

    const formatUptime = (seconds?: number) => {
        if (!seconds) return '—';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    return (
        <Card className={`border ${statusBg} transition-all duration-500`}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Cpu className={`h-5 w-5 ${statusColor}`} />
                        Voice AI Durumu
                    </CardTitle>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${statusDot} ${health?.status === 'healthy' ? 'animate-pulse' : ''}`} />
                            <span className={`text-xs font-medium ${statusColor}`}>
                                {health?.status === 'healthy' ? 'Çevrimiçi' : health?.status === 'degraded' ? 'Kısıtlı' : 'Çevrimdışı'}
                            </span>
                        </div>
                        <button
                            onClick={fetchHealth}
                            disabled={loading}
                            className="p-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50"
                            title="Yenile"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* GPU Info Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {/* GPU */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                        <HardDrive className="h-4 w-4 text-violet-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">GPU</p>
                            <p className="text-xs font-medium truncate">
                                {health?.gpu || 'N/A'}
                            </p>
                        </div>
                    </div>

                    {/* Sessions */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                        <Users className="h-4 w-4 text-blue-400 shrink-0" />
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Oturumlar</p>
                            <p className="text-xs font-medium">
                                {health?.active_sessions ?? 0} / {health?.max_sessions ?? 0}
                            </p>
                        </div>
                    </div>

                    {/* Latency */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                        <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gecikme</p>
                            <p className="text-xs font-medium">
                                {health?.latency_ms ? `${health.latency_ms}ms` : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Uptime */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                        <Timer className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Çalışma</p>
                            <p className="text-xs font-medium">
                                {formatUptime(health?.uptime_seconds)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Pipeline Providers */}
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        {pipeline?.pipeline?.providers?.stt?.includes('deepgram') ? (
                            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                            <WifiOff className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span className="text-muted-foreground">STT</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {pipeline?.pipeline?.providers?.llm?.includes('gpt') ? (
                            <Activity className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                            <Activity className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span className="text-muted-foreground">LLM</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {pipeline?.pipeline?.providers?.tts?.includes('elevenlabs') ? (
                            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                            <WifiOff className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span className="text-muted-foreground">TTS</span>
                    </div>
                    <div className="ml-auto text-[10px] text-muted-foreground">
                        {health?.mode === 'live' ? '🟢 Canlı' : health?.mode === 'mock' ? '🟡 Demo' : '🔴 Kapalı'}
                        {lastChecked && ` · ${lastChecked.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                </div>

                {/* VRAM Bar */}
                {health?.gpu_memory_gb && (
                    <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>GPU VRAM</span>
                            <span>{health.gpu_memory_gb.toFixed(1)} GB</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-700"
                                style={{ width: `${Math.min(100, (health.gpu_memory_gb / 24) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
