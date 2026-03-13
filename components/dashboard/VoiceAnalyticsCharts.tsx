'use client';

/**
 * Voice Pipeline Analytics Charts — Latency, Cost & Provider Breakdown
 *
 * Three charts for the billing/analytics page:
 * 1. Latency Trend (LineChart) — STT, LLM, TTS, Total per day
 * 2. Provider Distribution (PieChart) — Groq vs OpenAI, Cartesia vs OpenAI
 * 3. Cost Trend (BarChart) — Monthly TTS + LLM costs
 *
 * Lazy-loaded via next/dynamic to keep recharts (~100KB) out of initial bundle.
 */

import { useMemo } from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LatencyDataPoint {
    date: string;
    avgSttMs: number;
    avgLlmMs: number;
    avgTtsMs: number;
    avgPipelineMs: number;
    callCount: number;
}

interface CostDataPoint {
    period: string;
    ttsCostUsd: number;
    llmCostUsd: number;
    totalCostUsd: number;
}

interface ProviderData {
    stt: Record<string, number>;
    llm: Record<string, number>;
    tts: Record<string, number>;
}

interface VoiceAnalyticsChartsProps {
    latencyData: LatencyDataPoint[];
    costData: CostDataPoint[];
    providerData: ProviderData;
    isLoading?: boolean;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const CHART_COLORS = {
    stt: '#3b82f6',      // blue
    llm: '#8b5cf6',      // purple
    tts: '#f59e0b',      // amber
    total: '#10b981',    // emerald
    ttsCost: '#f59e0b',  // amber
    llmCost: '#8b5cf6',  // purple
};

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

interface TooltipEntry { name: string; value: number | string; color: string }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-xl border border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl shadow-xl">
            <p className="text-xs text-white/60 mb-2">{label}</p>
            {payload.map((entry: TooltipEntry, i: number) => (
                <p key={i} className="text-sm" style={{ color: entry.color }}>
                    {entry.name}: <span className="font-semibold">{
                        typeof entry.value === 'number'
                            ? entry.value < 10
                                ? `$${entry.value.toFixed(2)}`
                                : `${Math.round(entry.value)}ms`
                            : entry.value
                    }</span>
                </p>
            ))}
        </div>
    );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VoiceAnalyticsCharts({
    latencyData,
    costData,
    providerData,
    isLoading,
}: VoiceAnalyticsChartsProps) {
    // Format provider data for pie charts
    const llmPieData = useMemo(() => {
        return Object.entries(providerData?.llm || {}).map(([name, value]) => ({
            name: formatProviderName(name),
            value,
        }));
    }, [providerData]);

    const ttsPieData = useMemo(() => {
        return Object.entries(providerData?.tts || {}).map(([name, value]) => ({
            name: formatProviderName(name),
            value,
        }));
    }, [providerData]);

    // Format dates for display
    const formattedLatency = useMemo(() => {
        return (latencyData || []).map(d => ({
            ...d,
            date: formatDateShort(d.date),
        }));
    }, [latencyData]);

    const formattedCost = useMemo(() => {
        return (costData || []).map(d => ({
            ...d,
            period: formatPeriod(d.period),
        }));
    }, [costData]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="h-[350px] animate-pulse rounded-3xl bg-muted" />
                <div className="h-[350px] animate-pulse rounded-3xl bg-muted" />
                <div className="h-[300px] animate-pulse rounded-3xl bg-muted" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Row 1: Latency Trend + Provider Pie */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Latency Trend — LineChart */}
                <div className="xl:col-span-2 rounded-3xl border border-white/5 bg-card p-6">
                    <h3 className="text-base font-semibold text-foreground mb-1">
                        Pipeline Latency Trendi
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                        STT, LLM, TTS ortalama yanit suresi (ms)
                    </p>

                    {formattedLatency.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={formattedLatency}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit="ms" />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Line
                                    type="monotone" dataKey="avgSttMs" name="STT"
                                    stroke={CHART_COLORS.stt} strokeWidth={2} dot={false}
                                />
                                <Line
                                    type="monotone" dataKey="avgLlmMs" name="LLM"
                                    stroke={CHART_COLORS.llm} strokeWidth={2} dot={false}
                                />
                                <Line
                                    type="monotone" dataKey="avgTtsMs" name="TTS"
                                    stroke={CHART_COLORS.tts} strokeWidth={2} dot={false}
                                />
                                <Line
                                    type="monotone" dataKey="avgPipelineMs" name="Toplam"
                                    stroke={CHART_COLORS.total} strokeWidth={3} dot={false}
                                    strokeDasharray="6 3"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                            Henuz latency verisi yok
                        </div>
                    )}
                </div>

                {/* Provider Distribution — Pie Charts */}
                <div className="rounded-3xl border border-white/5 bg-card p-6">
                    <h3 className="text-base font-semibold text-foreground mb-1">
                        Provider Dagilimi
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                        LLM ve TTS kullanim oranlari
                    </p>

                    <div className="space-y-6">
                        {/* LLM Pie */}
                        <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">LLM</p>
                            {llmPieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={100}>
                                    <PieChart>
                                        <Pie
                                            data={llmPieData}
                                            cx="50%" cy="50%"
                                            innerRadius={25} outerRadius={45}
                                            dataKey="value"
                                            label={({ name, percent }) =>
                                                `${name} ${(percent * 100).toFixed(0)}%`
                                            }
                                            labelLine={false}
                                        >
                                            {llmPieData.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-xs text-muted-foreground text-center py-4">Veri yok</p>
                            )}
                        </div>

                        {/* TTS Pie */}
                        <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">TTS</p>
                            {ttsPieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={100}>
                                    <PieChart>
                                        <Pie
                                            data={ttsPieData}
                                            cx="50%" cy="50%"
                                            innerRadius={25} outerRadius={45}
                                            dataKey="value"
                                            label={({ name, percent }) =>
                                                `${name} ${(percent * 100).toFixed(0)}%`
                                            }
                                            labelLine={false}
                                        >
                                            {ttsPieData.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-xs text-muted-foreground text-center py-4">Veri yok</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 2: Cost Trend */}
            <div className="rounded-3xl border border-white/5 bg-card p-6">
                <h3 className="text-base font-semibold text-foreground mb-1">
                    Aylik Maliyet Trendi
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                    TTS + LLM altyapi maliyetleri ($)
                </p>

                {formattedCost.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={formattedCost}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                                dataKey="ttsCostUsd" name="TTS Maliyeti"
                                fill={CHART_COLORS.ttsCost}
                                radius={[4, 4, 0, 0]}
                                stackId="cost"
                            />
                            <Bar
                                dataKey="llmCostUsd" name="LLM Maliyeti"
                                fill={CHART_COLORS.llmCost}
                                radius={[4, 4, 0, 0]}
                                stackId="cost"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                        Henuz maliyet verisi yok
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Export types for parent components ──────────────────────────────────────

export type { LatencyDataPoint, CostDataPoint, ProviderData, VoiceAnalyticsChartsProps };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatProviderName(name: string): string {
    const map: Record<string, string> = {
        'groq-llama': 'Groq',
        'openai-gpt': 'OpenAI',
        'openai-fallback': 'OpenAI (FB)',
        'openai-emergency': 'OpenAI (Acil)',
        'cartesia': 'Cartesia',
        'deepgram': 'Deepgram',
    };
    return map[name] || name;
}

function formatDateShort(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
}

function formatPeriod(period: string): string {
    if (!period) return '';
    const months: Record<string, string> = {
        '01': 'Oca', '02': 'Sub', '03': 'Mar', '04': 'Nis',
        '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Agu',
        '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara',
    };
    const parts = period.split('-');
    if (parts.length === 2) return `${months[parts[1]] || parts[1]} ${parts[0]}`;
    return period;
}
