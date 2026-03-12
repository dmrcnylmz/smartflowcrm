'use client';

/**
 * LatencyBreakdownChart — Voice Pipeline Performance Visualization
 *
 * Displays:
 * 1. Stacked bar chart: STT | LLM | TTS | RAG breakdown per day
 * 2. KPI cards: Avg TTFT, Avg Pipeline, P95 TTFT, Total Calls
 * 3. Trend line: TTFT over time
 *
 * Data source: /api/voice/metrics?days=7
 *
 * Uses recharts (lazy-loaded to keep bundle small).
 * Dark theme matching existing DashboardCharts pattern.
 */

import { useEffect, useState, useCallback } from 'react';
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';

// =============================================
// Types
// =============================================

interface DailyBreakdown {
    date: string;
    callCount: number;
    avgTtftMs: number;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
}

interface LatencyStats {
    avgTtftMs: number;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
    avgRagMs: number;
    avgPipelineMs: number;
    p95TtftMs: number;
    totalCalls: number;
    dailyBreakdown: DailyBreakdown[];
}

interface LatencyBreakdownChartProps {
    days?: number;
}

// =============================================
// Shared Styles
// =============================================

const tooltipStyle = {
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(8px)',
};

const COLORS = {
    stt: '#38bdf8',  // sky-400
    llm: '#a78bfa',  // violet-400
    tts: '#34d399',  // emerald-400
    rag: '#fbbf24',  // amber-400
    ttft: '#f472b6', // pink-400
};

// =============================================
// Component
// =============================================

export default function LatencyBreakdownChart({ days = 7 }: LatencyBreakdownChartProps) {
    const [stats, setStats] = useState<LatencyStats | null>(null);
    const [loading, setLoading] = useState(true);
    const authFetch = useAuthFetch();

    const fetchMetrics = useCallback(async () => {
        try {
            const response = await authFetch(`/api/voice/metrics?days=${days}`);
            if (response.ok) {
                const data = await response.json();
                setStats(data.stats);
            }
        } catch {
            // Silent — metrics are informational
        } finally {
            setLoading(false);
        }
    }, [days, authFetch]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    if (!stats || stats.totalCalls === 0) {
        return (
            <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="py-12 text-center">
                    <p className="text-slate-500 text-sm">
                        Henüz yeterli çağrı verisi yok. Pipeline metrikleri çağrılar başladığında burada görünecek.
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Format daily data for charts
    const chartData = stats.dailyBreakdown.map(d => ({
        ...d,
        date: d.date.slice(5), // MM-DD format
    }));

    return (
        <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard
                    label="Ort. TTFT"
                    value={`${stats.avgTtftMs}ms`}
                    description="İlk Yanıt Süresi"
                    color="text-pink-400"
                />
                <KPICard
                    label="Ort. Pipeline"
                    value={`${stats.avgPipelineMs}ms`}
                    description="STT + LLM + TTS"
                    color="text-blue-400"
                />
                <KPICard
                    label="P95 TTFT"
                    value={`${stats.p95TtftMs}ms`}
                    description="En yavaş %5"
                    color="text-amber-400"
                />
                <KPICard
                    label="Toplam Çağrı"
                    value={`${stats.totalCalls}`}
                    description={`Son ${days} gün`}
                    color="text-emerald-400"
                />
            </div>

            {/* Stacked Bar Chart: Component Breakdown */}
            {chartData.length > 0 && (
                <Card className="border-slate-800 bg-slate-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-300">Pipeline Latency Dağılımı</CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                            Günlük ortalama bileşen süreleri (ms)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="avgSttMs" name="STT" stackId="pipeline" fill={COLORS.stt} radius={[0, 0, 0, 0]} />
                                <Bar dataKey="avgLlmMs" name="LLM" stackId="pipeline" fill={COLORS.llm} />
                                <Bar dataKey="avgTtsMs" name="TTS" stackId="pipeline" fill={COLORS.tts} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* TTFT Trend Line */}
            {chartData.length > 1 && (
                <Card className="border-slate-800 bg-slate-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-300">TTFT Trendi</CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                            İlk yanıt süresi (Time to First Token) ms
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Line
                                    type="monotone"
                                    dataKey="avgTtftMs"
                                    name="TTFT"
                                    stroke={COLORS.ttft}
                                    strokeWidth={2}
                                    dot={{ fill: COLORS.ttft, r: 3 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Component Averages Summary */}
            <Card className="border-slate-800 bg-slate-900/50">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-300">Bileşen Ortalamaları</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <ComponentStat label="STT (Deepgram)" value={stats.avgSttMs} color={COLORS.stt} />
                        <ComponentStat label="LLM (Groq/OpenAI)" value={stats.avgLlmMs} color={COLORS.llm} />
                        <ComponentStat label="TTS (Cartesia)" value={stats.avgTtsMs} color={COLORS.tts} />
                        <ComponentStat label="RAG Retrieval" value={stats.avgRagMs} color={COLORS.rag} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// =============================================
// Sub-components
// =============================================

function KPICard({ label, value, description, color }: {
    label: string;
    value: string;
    description: string;
    color: string;
}) {
    return (
        <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="pt-4 pb-3 px-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{description}</p>
            </CardContent>
        </Card>
    );
}

function ComponentStat({ label, value, color }: {
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div className="text-center">
            <div
                className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2"
                style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
            >
                <span className="text-sm font-bold" style={{ color }}>{value}</span>
            </div>
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-[10px] text-slate-600">ms ort.</p>
        </div>
    );
}
