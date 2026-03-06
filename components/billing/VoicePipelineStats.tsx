'use client';

/**
 * Voice Pipeline Stats Card
 *
 * Summary card showing:
 * - Total calls this month
 * - Average response time
 * - Pipeline stage breakdown (horizontal stacked bar)
 * - Trend indicator
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoicePipelineStatsProps {
    totalCalls: number;
    avgPipelineMs: number;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
    totalTtsChars: number;
    estimatedCostUsd: number;
    emergencyModeActive: boolean;
    callsTrend: number; // percentage change vs previous period
    isLoading?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VoicePipelineStats({
    totalCalls,
    avgPipelineMs,
    avgSttMs,
    avgLlmMs,
    avgTtsMs,
    totalTtsChars,
    estimatedCostUsd,
    emergencyModeActive,
    callsTrend,
    isLoading,
}: VoicePipelineStatsProps) {
    if (isLoading) {
        return (
            <Card className="rounded-3xl border-white/5 bg-card">
                <CardContent className="p-6">
                    <div className="space-y-4">
                        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                        <div className="h-8 w-full animate-pulse rounded-full bg-muted" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    const totalStageMs = avgSttMs + avgLlmMs + avgTtsMs;
    const sttPercent = totalStageMs > 0 ? (avgSttMs / totalStageMs) * 100 : 33;
    const llmPercent = totalStageMs > 0 ? (avgLlmMs / totalStageMs) * 100 : 33;
    const ttsPercent = totalStageMs > 0 ? (avgTtsMs / totalStageMs) * 100 : 34;

    const avgResponseSec = (avgPipelineMs / 1000).toFixed(1);

    const TrendIcon = callsTrend > 0 ? TrendingUp : callsTrend < 0 ? TrendingDown : Minus;
    const trendColor = callsTrend > 0 ? 'text-emerald-400' : callsTrend < 0 ? 'text-red-400' : 'text-muted-foreground';

    const formatNumber = (n: number) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
        return String(n);
    };

    return (
        <Card className="rounded-3xl border-white/5 bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Phone className="h-4 w-4 text-primary" />
                        Ses Pipeline Ozeti
                    </CardTitle>
                    {emergencyModeActive && (
                        <Badge variant="destructive" className="text-[10px]">
                            Acil Mod
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* KPI Row */}
                <div className="grid grid-cols-3 gap-4">
                    {/* Total Calls */}
                    <div>
                        <p className="text-2xl font-bold tracking-tight">
                            {formatNumber(totalCalls)}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-xs text-muted-foreground">cagri</p>
                            {callsTrend !== 0 && (
                                <span className={`flex items-center text-[10px] ${trendColor}`}>
                                    <TrendIcon className="h-3 w-3" />
                                    {Math.abs(callsTrend)}%
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Avg Response */}
                    <div>
                        <p className="text-2xl font-bold tracking-tight">
                            {avgResponseSec}<span className="text-sm font-normal text-muted-foreground">s</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            ort. yanit
                        </p>
                    </div>

                    {/* Cost */}
                    <div>
                        <p className="text-2xl font-bold tracking-tight">
                            ${estimatedCostUsd.toFixed(0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            altyapi
                        </p>
                    </div>
                </div>

                {/* Pipeline Stage Breakdown — Horizontal Stacked Bar */}
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                        Pipeline Asama Dagilimi
                    </p>
                    <div className="h-6 w-full rounded-full overflow-hidden flex">
                        {/* STT */}
                        <div
                            className="h-full bg-blue-500 flex items-center justify-center text-[9px] font-medium text-white transition-all"
                            style={{ width: `${sttPercent}%` }}
                            title={`STT: ${avgSttMs}ms`}
                        >
                            {sttPercent > 15 ? `STT ${avgSttMs}ms` : ''}
                        </div>
                        {/* LLM */}
                        <div
                            className="h-full bg-purple-500 flex items-center justify-center text-[9px] font-medium text-white transition-all"
                            style={{ width: `${llmPercent}%` }}
                            title={`LLM: ${avgLlmMs}ms`}
                        >
                            {llmPercent > 15 ? `LLM ${avgLlmMs}ms` : ''}
                        </div>
                        {/* TTS */}
                        <div
                            className="h-full bg-amber-500 flex items-center justify-center text-[9px] font-medium text-white transition-all"
                            style={{ width: `${ttsPercent}%` }}
                            title={`TTS: ${avgTtsMs}ms`}
                        >
                            {ttsPercent > 15 ? `TTS ${avgTtsMs}ms` : ''}
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-blue-500" /> STT
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-purple-500" /> LLM
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-amber-500" /> TTS
                            </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                            Toplam: {totalStageMs}ms
                        </span>
                    </div>
                </div>

                {/* TTS Char Usage */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-white/5">
                    <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        TTS Karakter
                    </span>
                    <span className="font-mono">{formatNumber(totalTtsChars)}</span>
                </div>
            </CardContent>
        </Card>
    );
}
