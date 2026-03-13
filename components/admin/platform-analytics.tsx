'use client';

/**
 * Platform Analytics — Cloudflare + platform-wide metrics dashboard
 *
 * Shows:
 * - Cloudflare KPIs (requests, bandwidth, page views, unique visitors, threats)
 * - Daily request & page view charts (AreaChart + BarChart)
 * - Country breakdown (horizontal bar chart + table)
 * - Security / threats section
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
    TrendingUp, RefreshCw, BarChart3, Calendar, ShieldAlert, Shield,
    MapPin, AlertTriangle, LogIn, MousePointerClick, UserCheck,
    FileText,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ─── Country name mapping ───

const COUNTRY_NAMES: Record<string, string> = {
    TR: 'Türkiye', US: 'Amerika', FR: 'Fransa', DE: 'Almanya', GB: 'İngiltere',
    NL: 'Hollanda', HK: 'Hong Kong', CA: 'Kanada', IN: 'Hindistan', SG: 'Singapur',
    SA: 'S. Arabistan', RU: 'Rusya', CN: 'Çin', JP: 'Japonya', KR: 'G. Kore',
    AU: 'Avustralya', BR: 'Brezilya', PL: 'Polonya', CH: 'İsviçre', IE: 'İrlanda',
    FI: 'Finlandiya', BE: 'Belçika', SE: 'İsveç', ES: 'İspanya', PT: 'Portekiz',
    AT: 'Avusturya', IT: 'İtalya', EG: 'Mısır', UA: 'Ukrayna', ID: 'Endonezya',
    TH: 'Tayland', VN: 'Vietnam', ZA: 'G. Afrika', MX: 'Meksika', CL: 'Şili',
    SK: 'Slovakya', BG: 'Bulgaristan', EE: 'Estonya', BD: 'Bangladeş',
    BY: 'Belarus', GT: 'Guatemala', TW: 'Tayvan', KZ: 'Kazakistan', T1: 'Tor Ağı',
};

function getCountryName(code: string) {
    return COUNTRY_NAMES[code] || code;
}

// Country flag emoji
function getFlag(code: string) {
    if (code === 'T1') return '🧅';
    if (code.length !== 2) return '🌐';
    return String.fromCodePoint(
        ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    );
}

// ─── Types ───

interface CountryEntry {
    country: string;
    requests: number;
    threats: number;
    bandwidthMB: number;
}

interface CloudflareData {
    requests: number;
    bandwidthMB: number;
    pageViews: number;
    uniqueVisitors: number;
    threats: number;
    dailyData: { date: string; requests: number; pageViews: number; bandwidth: number; threats: number }[];
    countryData: CountryEntry[];
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

interface UserActivityData {
    totalLogins: number;
    totalPageViews: number;
    uniqueActiveUsers: number;
    topPages: { page: string; views: number }[];
    dailyLogins: { date: string; logins: number; pageViews: number; activeUsers: number }[];
}

interface AnalyticsResponse {
    range: string;
    days: number;
    cloudflare: CloudflareData | null;
    platform: PlatformData;
    userActivity?: UserActivityData;
    generatedAt: string;
}

// ─── Custom Tooltip (matches existing dark theme) ───

interface TooltipEntry { name: string; value: number | string; color: string }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl shadow-xl">
            <p className="text-xs text-white/60 mb-2">{label}</p>
            {payload.map((entry: TooltipEntry, i: number) => (
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
    icon: React.ComponentType<{ className?: string }>;
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

// ─── Country Bar Colors ───
const BAR_COLORS = [
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#c084fc',
    '#d8b4fe', '#818cf8', '#60a5fa', '#38bdf8', '#22d3ee',
    '#2dd4bf', '#34d399', '#4ade80', '#a3e635', '#facc15',
];

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

    // Top 15 countries for chart
    const topCountries = (cf?.countryData || []).slice(0, 15).map(c => ({
        ...c,
        name: getCountryName(c.country),
        flag: getFlag(c.country),
    }));

    // Countries with threats
    const threatCountries = (cf?.countryData || []).filter(c => c.threats > 0)
        .sort((a, b) => b.threats - a.threats);

    const totalThreats = cf?.threats || 0;

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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <KpiCard icon={Activity} label="İstekler" value={cf.requests} color="text-blue-400" />
                    <KpiCard icon={HardDrive} label="Bant Genişliği" value={`${cf.bandwidthMB.toFixed(1)} MB`} color="text-cyan-400" />
                    <KpiCard icon={Eye} label="Sayfa Görüntüleme" value={cf.pageViews} color="text-amber-400" />
                    <KpiCard icon={Users} label="Benzersiz Ziyaretçi" value={cf.uniqueVisitors} color="text-emerald-400" />
                    <KpiCard
                        icon={ShieldAlert}
                        label="Tehditler"
                        value={totalThreats}
                        subtitle={totalThreats > 0 ? `${threatCountries.length} ülkeden` : 'Engellendi'}
                        color={totalThreats > 0 ? 'text-red-400' : 'text-green-400'}
                    />
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

            {/* Section 2: Charts — Daily trends */}
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

                    {/* Daily Page Views + Threats */}
                    <Card className="border-white/10 bg-white/[0.02]">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Eye className="h-4 w-4 text-amber-400" />
                                <span className="text-sm font-medium text-white/70">Sayfa Görüntüleme & Tehditler</span>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={cf.dailyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="pageViews" name="Sayfa Görüntüleme" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="threats" name="Tehditler" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Section 3: Country Breakdown */}
            {topCountries.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Country Horizontal Bar Chart */}
                    <Card className="border-white/10 bg-white/[0.02]">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Globe className="h-4 w-4 text-violet-400" />
                                <span className="text-sm font-medium text-white/70">Ülkelere Göre Trafik (Top 15)</span>
                            </div>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={topCountries} layout="vertical" margin={{ left: 80 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }}
                                        width={75}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="requests" name="İstekler" radius={[0, 4, 4, 0]}>
                                        {topCountries.map((_, i) => (
                                            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Country Table */}
                    <Card className="border-white/10 bg-white/[0.02]">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <MapPin className="h-4 w-4 text-violet-400" />
                                <span className="text-sm font-medium text-white/70">Ülke Detayları</span>
                            </div>
                            <div className="overflow-auto max-h-[400px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-white/5">
                                            <TableHead className="text-white/50">Ülke</TableHead>
                                            <TableHead className="text-white/50 text-right">İstek</TableHead>
                                            <TableHead className="text-white/50 text-right">Bant (MB)</TableHead>
                                            <TableHead className="text-white/50 text-right">Tehdit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(cf?.countryData || []).map((c, i) => (
                                            <TableRow key={i} className="border-white/5">
                                                <TableCell className="text-white/80 font-medium">
                                                    <span className="mr-2">{getFlag(c.country)}</span>
                                                    {getCountryName(c.country)}
                                                </TableCell>
                                                <TableCell className="text-right text-white/60 font-mono text-sm">
                                                    {c.requests.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right text-white/60 font-mono text-sm">
                                                    {c.bandwidthMB.toFixed(1)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {c.threats > 0 ? (
                                                        <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30 font-mono">
                                                            {c.threats}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-white/30 text-sm">0</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Section 4: Security / Threats */}
            {totalThreats > 0 && threatCountries.length > 0 && (
                <Card className="border-red-500/20 bg-red-500/[0.02]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="h-4 w-4 text-red-400" />
                            <span className="text-sm font-medium text-red-300">Güvenlik Tehditleri</span>
                            <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30 ml-auto">
                                {totalThreats} toplam tehdit
                            </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {threatCountries.map((c, i) => (
                                <div key={i} className="flex items-center gap-2 rounded-lg border border-red-500/10 bg-red-500/5 px-3 py-2">
                                    <span className="text-lg">{getFlag(c.country)}</span>
                                    <div className="min-w-0">
                                        <p className="text-xs text-white/60 truncate">{getCountryName(c.country)}</p>
                                        <p className="text-sm font-bold text-red-300">{c.threats}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
                            <Shield className="h-3.5 w-3.5" />
                            <span>Cloudflare WAF tarafından otomatik engellendi</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Section 5: Platform Metrics */}
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

            {/* Section 6: User Activity (Real logged-in users) */}
            {data?.userActivity && (
                <>
                    {/* Divider */}
                    <div className="flex items-center gap-3 pt-2">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs text-white/40 uppercase tracking-wider">Kullanıcı Aktivitesi</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    {/* User Activity KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard
                            icon={LogIn}
                            label="Toplam Giriş"
                            value={data.userActivity.totalLogins}
                            subtitle={`Son ${data.days} gün`}
                            color="text-teal-400"
                        />
                        <KpiCard
                            icon={UserCheck}
                            label="Aktif Kullanıcı"
                            value={data.userActivity.uniqueActiveUsers}
                            subtitle="Benzersiz kullanıcı"
                            color="text-sky-400"
                        />
                        <KpiCard
                            icon={MousePointerClick}
                            label="Sayfa Görüntüleme"
                            value={data.userActivity.totalPageViews}
                            subtitle="Uygulama içi"
                            color="text-orange-400"
                        />
                        <KpiCard
                            icon={FileText}
                            label="Popüler Sayfa"
                            value={data.userActivity.topPages?.[0]?.page || '—'}
                            subtitle={data.userActivity.topPages?.[0] ? `${data.userActivity.topPages[0].views} görüntüleme` : undefined}
                            color="text-indigo-400"
                        />
                    </div>

                    {/* Daily Logins & Active Users Chart + Top Pages */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Daily Logins & Active Users */}
                        {data.userActivity.dailyLogins.length > 0 && (
                            <Card className="border-white/10 bg-white/[0.02]">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <LogIn className="h-4 w-4 text-teal-400" />
                                        <span className="text-sm font-medium text-white/70">Günlük Giriş & Aktif Kullanıcılar</span>
                                    </div>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <AreaChart data={data.userActivity.dailyLogins}>
                                            <defs>
                                                <linearGradient id="loginGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                            <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Area type="monotone" dataKey="logins" name="Giriş" stroke="#2dd4bf" fill="url(#loginGrad)" strokeWidth={2} />
                                            <Area type="monotone" dataKey="activeUsers" name="Aktif Kullanıcı" stroke="#38bdf8" fill="url(#activeGrad)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        )}

                        {/* Top Pages Table */}
                        {data.userActivity.topPages.length > 0 && (
                            <Card className="border-white/10 bg-white/[0.02]">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <FileText className="h-4 w-4 text-indigo-400" />
                                        <span className="text-sm font-medium text-white/70">En Çok Ziyaret Edilen Sayfalar</span>
                                    </div>
                                    <div className="overflow-auto max-h-[280px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="border-white/5">
                                                    <TableHead className="text-white/50">#</TableHead>
                                                    <TableHead className="text-white/50">Sayfa</TableHead>
                                                    <TableHead className="text-white/50 text-right">Görüntüleme</TableHead>
                                                    <TableHead className="text-white/50 text-right">Oran</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.userActivity.topPages.map((page, i) => {
                                                    const pct = data.userActivity!.totalPageViews > 0
                                                        ? ((page.views / data.userActivity!.totalPageViews) * 100).toFixed(1)
                                                        : '0';
                                                    return (
                                                        <TableRow key={i} className="border-white/5">
                                                            <TableCell className="text-white/30 text-sm w-8">{i + 1}</TableCell>
                                                            <TableCell className="text-white/80 font-medium text-sm">
                                                                <code className="bg-white/5 px-2 py-0.5 rounded text-xs">
                                                                    {page.page}
                                                                </code>
                                                            </TableCell>
                                                            <TableCell className="text-right text-white/60 font-mono text-sm">
                                                                {page.views.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-indigo-500 rounded-full"
                                                                            style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-white/40 text-xs font-mono w-12 text-right">{pct}%</span>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Daily Page Views from App (bar chart) */}
                    {data.userActivity.dailyLogins.length > 0 && data.userActivity.totalPageViews > 0 && (
                        <Card className="border-white/10 bg-white/[0.02]">
                            <CardContent className="p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <MousePointerClick className="h-4 w-4 text-orange-400" />
                                    <span className="text-sm font-medium text-white/70">Günlük Uygulama Sayfa Görüntüleme</span>
                                </div>
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={data.userActivity.dailyLogins}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="pageViews" name="Sayfa Görüntüleme" fill="#f97316" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
