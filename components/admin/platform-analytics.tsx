'use client';

/**
 * Platform Analytics — Cloudflare + platform-wide metrics dashboard
 *
 * Shows:
 * - Cloudflare KPIs (requests, bandwidth, page views, unique visitors)
 * - Daily request & page view charts (AreaChart + BarChart)
 * - Platform KPIs (tenants, users, calls, enterprise count)
 * - Recent registrations table
 *
 * Data source: /api/admin/super/analytics?range=7d
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Globe, Activity, HardDrive, Eye, Users, Building2, Phone,
    TrendingUp, RefreshCw, BarChart3, Calendar,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───

interface CloudflareData {
    requests: number;
    bandwidthMB: number;
    pageViews: number;
    uniqueVisitors: number;
    dailyData: { date: string; requests: number; pageViews: number; bandwidth: number }[];
}

interface PlatformData {
    totalTenants: number;
    activeTenants: number;
    enterpriseTenants: number;
    totalUsers: number;
    totalCallsThisMonth: number;
    totalMinutesThisMonth: number;
    recentRegistrations: { email: string; companyName: string; plan: string; createdAt: string }[];
}

interface AnalyticsResponse {
    range: string;
    days: number;
    cloudflare: CloudflareData | null;
    platform: PlatformData;
    generatedAt: string;
}

// ─── Custom Tooltip (matches existing dark theme) ───

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl shadow-xl">
            <p className="text-xs text-white/60 mb-2">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} className="text-sm" style={{ color: entry.color }}>
                    {entry.name}: <span className="font-semibold">
                        {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                    </span>
                </p>
            ))}
        </div>
    );
}

// ─── KPI Card ───

function KpiCard({ icon: Icon, label, value, subtitle, color = 'text-blue-400' }: {
    icon: any;
    label: string;
    value: string | number;
    subtitle?: string;
    color?: string;
}) {
    return (
        <Card className="border-white/10 bg-white/[0.02]">
            <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                    <div className={`rounded-lg bg-white/5 p-2 ${color}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
                </div>
                <p className="text-2xl font-bold text-white">
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </p>
                {subtitle && (
                    <p className="text-xs text-white/40 mt-1">{subtitle}</p>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Plan Badge Color ───

function planColor(plan: string) {
    switch (plan) {
        case 'enterprise': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
        case 'professional': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
        case 'starter': return 'bg-green-500/20 text-green-300 border-green-500/30';
        default: return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
    }
}

// ─── Main Component ───

export default function PlatformAnalytics() {
    const authFetch = useAuthFetch();
    const [data, setData] = useState<AnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState('7d');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch(`/api/admin/super/analytics?range=${range}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (err) {
            console.error('Analytics fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [authFetch, range]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-48 rounded-xl" />
            </div>
        );
    }

    const cf = data?.cloudflare;
    const pf = data?.platform;

    return (
        <div className="space-y-6">
            {/* Header with controls */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Platform Analitik</h3>
                <div className="flex items-center gap-3">
                    <Select value={range} onValueChange={setRange}>
                        <SelectTrigger className="w-[120px] border-white/10 bg-white/5">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="24h">Son 24 Saat</SelectItem>
                            <SelectItem value="7d">Son 7 Gün</SelectItem>
                            <SelectItem value="30d">Son 30 Gün</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={fetchData} className="border-white/10">
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Yenile
                    </Button>
                </div>
            </div>

            {/* Section 1: Cloudflare KPI Cards */}
            {cf ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <KpiCard icon={Activity} label="İstekler" value={cf.requests} color="text-blue-400" />
                    <KpiCard icon={HardDrive} label="Bant Genişliği" value={`${cf.bandwidthMB.toFixed(1)} MB`} color="text-cyan-400" />
                    <KpiCard icon={Eye} label="Sayfa Görüntüleme" value={cf.pageViews} color="text-amber-400" />
                    <KpiCard icon={Users} label="Benzersiz Ziyaretçi" value={cf.uniqueVisitors} color="text-emerald-400" />
                </div>
            ) : (
                <Card className="border-white/10 bg-white/[0.02]">
                    <CardContent className="p-6 text-center text-white/40">
                        <Globe className="h-8 w-8 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">Cloudflare Analytics yapılandırılmamış</p>
                        <p className="text-xs mt-1">CLOUDFLARE_API_TOKEN ve CLOUDFLARE_ZONE_ID env var&apos;larını ekleyin</p>
                    </CardContent>
                </Card>
            )}

            {/* Section 2: Charts */}
            {cf?.dailyData && cf.dailyData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Daily Requests Trend */}
                    <Card className="border-white/10 bg-white/[0.02]">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium text-white/70">Günlük İstekler</span>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={cf.dailyData}>
                                    <defs>
                                        <linearGradient id="requestGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="requests" name="İstekler" stroke="#3b82f6" fill="url(#requestGrad)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Daily Page Views */}
                    <Card className="border-white/10 bg-white/[0.02]">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Eye className="h-4 w-4 text-amber-400" />
                                <span className="text-sm font-medium text-white/70">Sayfa Görüntüleme & Bant Genişliği</span>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={cf.dailyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="pageViews" name="Sayfa Görüntüleme" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Section 3: Platform Metrics */}
            {pf && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <KpiCard icon={Building2} label="Toplam Tenant" value={pf.totalTenants} subtitle={`${pf.activeTenants} aktif`} color="text-violet-400" />
                        <KpiCard icon={Users} label="Toplam Kullanıcı" value={pf.totalUsers} color="text-pink-400" />
                        <KpiCard icon={Phone} label="Bu Ay Çağrı" value={pf.totalCallsThisMonth} subtitle={`${pf.totalMinutesThisMonth} dakika`} color="text-green-400" />
                        <KpiCard icon={TrendingUp} label="Enterprise" value={pf.enterpriseTenants} subtitle="enterprise tenant" color="text-purple-400" />
                    </div>

                    {/* Recent Registrations Table */}
                    {pf.recentRegistrations.length > 0 && (
                        <Card className="border-white/10 bg-white/[0.02]">
                            <CardContent className="p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar className="h-4 w-4 text-blue-400" />
                                    <span className="text-sm font-medium text-white/70">Son Kayıtlar</span>
                                </div>
                                <div className="overflow-auto max-h-80">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-white/5">
                                                <TableHead className="text-white/50">Şirket</TableHead>
                                                <TableHead className="text-white/50">E-posta</TableHead>
                                                <TableHead className="text-white/50">Plan</TableHead>
                                                <TableHead className="text-white/50">Kayıt Tarihi</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pf.recentRegistrations.map((reg, i) => (
                                                <TableRow key={i} className="border-white/5">
                                                    <TableCell className="text-white/80 font-medium">{reg.companyName}</TableCell>
                                                    <TableCell className="text-white/60 text-sm">{reg.email}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={planColor(reg.plan)}>
                                                            {reg.plan}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-white/50 text-sm">
                                                        {new Date(reg.createdAt).toLocaleDateString('tr-TR')}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
