'use client';

/**
 * Tenant Analytics — Platform-wide tenant analytics panel
 *
 * Shows:
 * - Platform KPI summary (6 cards)
 * - Filter bar (search, plan, status)
 * - Sortable tenant table
 * - Click row → TenantDetailDialog
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Building2, CheckCircle, Phone, Clock, DollarSign, TrendingUp,
    Loader2, RefreshCw, AlertCircle, Search, ArrowUpDown, ChevronUp, ChevronDown,
} from 'lucide-react';
import TenantDetailDialog from './tenant-detail-dialog';

// ─── Types ───

interface PlatformSummary {
    totalTenants: number;
    activeTenants: number;
    totalUsers: number;
    totalCallsThisMonth: number;
    totalMinutesThisMonth: number;
    mrr: number;
    platformMargin: number;
}

interface TenantRow {
    id: string;
    companyName: string;
    sector: string;
    active: boolean;
    createdAt: string;
    planId: string;
    subscriptionStatus: string;
    memberCount: number;
    usage: {
        totalCalls: number;
        totalMinutes: number;
        estimatedCostUsd: number;
    };
    costBreakdown: {
        baseCost: number;
        infraCost: number;
        total: number;
        margin: number;
    };
}

interface AnalyticsResponse {
    platform: PlatformSummary;
    tenants: TenantRow[];
}

type SortField = 'companyName' | 'planId' | 'subscriptionStatus' | 'memberCount' | 'totalCalls' | 'totalMinutes' | 'estimatedCostUsd' | 'createdAt';
type SortDir = 'asc' | 'desc';

// ─── Plan/Status Label Helpers ───

const PLAN_LABELS: Record<string, string> = {
    starter: 'Başlangıç',
    professional: 'Profesyonel',
    enterprise: 'Kurumsal',
};

const PLAN_COLORS: Record<string, 'secondary' | 'default' | 'destructive'> = {
    starter: 'secondary',
    professional: 'default',
    enterprise: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
    active: 'Aktif',
    on_trial: 'Deneme',
    trialing: 'Deneme',
    cancelled: 'İptal',
    expired: 'Süresi Dolmuş',
    past_due: 'Ödeme Gecikmiş',
    none: 'Abonelik Yok',
    unknown: 'Bilinmiyor',
};

const STATUS_COLORS: Record<string, 'success' | 'default' | 'destructive' | 'secondary' | 'outline'> = {
    active: 'success',
    on_trial: 'default',
    trialing: 'default',
    cancelled: 'destructive',
    expired: 'destructive',
    past_due: 'destructive',
    none: 'outline',
    unknown: 'secondary',
};

// ─── KPI Card ───

function KpiCard({ icon: Icon, label, value, color, prefix, suffix }: {
    icon: React.ElementType;
    label: string;
    value: number;
    color: string;
    prefix?: string;
    suffix?: string;
}) {
    return (
        <Card>
            <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${color}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">
                            {prefix}{typeof value === 'number' ? value.toLocaleString('tr-TR') : value}{suffix}
                        </div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Sortable Header ───

function SortableHeader({ label, field, currentSort, currentDir, onSort }: {
    label: string;
    field: SortField;
    currentSort: SortField;
    currentDir: SortDir;
    onSort: (field: SortField) => void;
}) {
    const isActive = currentSort === field;
    return (
        <TableHead
            className="cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort(field)}
        >
            <div className="flex items-center gap-1">
                {label}
                {isActive ? (
                    currentDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                )}
            </div>
        </TableHead>
    );
}

// ─── Loading Skeleton ───

function AnalyticsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] rounded-lg" />
                ))}
            </div>
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-[400px] rounded-lg" />
        </div>
    );
}

// ─── Main Component ───

export default function TenantAnalytics() {
    const authFetch = useAuthFetch();
    const [data, setData] = useState<AnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [search, setSearch] = useState('');
    const [planFilter, setPlanFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Sort
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // Detail dialog
    const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await authFetch('/api/admin/tenant-analytics');
            if (!res.ok) throw new Error('Tenant analitikleri yüklenemedi');
            const json: AnalyticsResponse = await res.json();
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bilinmeyen hata');
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle sort
    const handleSort = useCallback((field: SortField) => {
        setSortDir(prev => sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'desc');
        setSortField(field);
    }, [sortField]);

    // Filtered & sorted tenants
    const filteredTenants = useMemo(() => {
        if (!data) return [];

        let list = [...data.tenants];

        // Text search
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t =>
                t.companyName.toLowerCase().includes(q) ||
                t.id.toLowerCase().includes(q) ||
                t.sector.toLowerCase().includes(q),
            );
        }

        // Plan filter
        if (planFilter !== 'all') {
            list = list.filter(t => t.planId === planFilter);
        }

        // Status filter
        if (statusFilter !== 'all') {
            if (statusFilter === 'active') {
                list = list.filter(t => t.active);
            } else if (statusFilter === 'inactive') {
                list = list.filter(t => !t.active);
            } else {
                list = list.filter(t => t.subscriptionStatus === statusFilter);
            }
        }

        // Sort
        list.sort((a, b) => {
            let aVal: string | number;
            let bVal: string | number;

            switch (sortField) {
                case 'companyName':
                    aVal = a.companyName.toLowerCase();
                    bVal = b.companyName.toLowerCase();
                    break;
                case 'planId':
                    aVal = a.planId;
                    bVal = b.planId;
                    break;
                case 'subscriptionStatus':
                    aVal = a.subscriptionStatus;
                    bVal = b.subscriptionStatus;
                    break;
                case 'memberCount':
                    aVal = a.memberCount;
                    bVal = b.memberCount;
                    break;
                case 'totalCalls':
                    aVal = a.usage.totalCalls;
                    bVal = b.usage.totalCalls;
                    break;
                case 'totalMinutes':
                    aVal = a.usage.totalMinutes;
                    bVal = b.usage.totalMinutes;
                    break;
                case 'estimatedCostUsd':
                    aVal = a.usage.estimatedCostUsd;
                    bVal = b.usage.estimatedCostUsd;
                    break;
                case 'createdAt':
                    aVal = a.createdAt || '';
                    bVal = b.createdAt || '';
                    break;
                default:
                    return 0;
            }

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });

        return list;
    }, [data, search, planFilter, statusFilter, sortField, sortDir]);

    // Format date helper
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    if (loading) return <AnalyticsSkeleton />;

    if (error) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertCircle className="h-10 w-10 mx-auto text-destructive/50 mb-3" />
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
                        Tekrar Dene
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    const { platform } = data;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Tenant Analitik</h3>
                <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Yenile
                </Button>
            </div>

            {/* Platform KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KpiCard icon={Building2} label="Toplam Tenant" value={platform.totalTenants} color="bg-blue-500/10 text-blue-600" />
                <KpiCard icon={CheckCircle} label="Aktif Tenant" value={platform.activeTenants} color="bg-emerald-500/10 text-emerald-600" />
                <KpiCard icon={Phone} label="Bu Ay Çağrı" value={platform.totalCallsThisMonth} color="bg-purple-500/10 text-purple-600" />
                <KpiCard icon={Clock} label="Bu Ay Dakika" value={platform.totalMinutesThisMonth} color="bg-orange-500/10 text-orange-600" />
                <KpiCard icon={DollarSign} label="Aylık Gelir (MRR)" value={platform.mrr} color="bg-green-500/10 text-green-600" prefix="$" />
                <KpiCard icon={TrendingUp} label="Platform Marjın" value={platform.platformMargin} color="bg-cyan-500/10 text-cyan-600" prefix="$" />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Firma adı, ID veya sektör ara..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <Select value={planFilter} onValueChange={setPlanFilter}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Plan" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tüm Planlar</SelectItem>
                        <SelectItem value="starter">Başlangıç</SelectItem>
                        <SelectItem value="professional">Profesyonel</SelectItem>
                        <SelectItem value="enterprise">Kurumsal</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Durum" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tüm Durumlar</SelectItem>
                        <SelectItem value="active">Aktif</SelectItem>
                        <SelectItem value="inactive">Pasif</SelectItem>
                        <SelectItem value="on_trial">Deneme</SelectItem>
                        <SelectItem value="cancelled">İptal</SelectItem>
                    </SelectContent>
                </Select>

                {(search || planFilter !== 'all' || statusFilter !== 'all') && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-10"
                        onClick={() => { setSearch(''); setPlanFilter('all'); setStatusFilter('all'); }}
                    >
                        Temizle
                    </Button>
                )}
            </div>

            {/* Result count */}
            <p className="text-sm text-muted-foreground">
                {filteredTenants.length} / {data.tenants.length} tenant gösteriliyor
            </p>

            {/* Tenant Table */}
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <SortableHeader label="Firma" field="companyName" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Plan" field="planId" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Durum" field="subscriptionStatus" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Üye" field="memberCount" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Çağrı" field="totalCalls" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Dakika" field="totalMinutes" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Maliyet ($)" field="estimatedCostUsd" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                            <SortableHeader label="Kayıt Tarihi" field="createdAt" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTenants.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                                    {search || planFilter !== 'all' || statusFilter !== 'all'
                                        ? 'Filtrelere uygun tenant bulunamadı'
                                        : 'Henüz tenant bulunmuyor'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTenants.map((tenant) => (
                                <TableRow
                                    key={tenant.id}
                                    className="cursor-pointer"
                                    onClick={() => setSelectedTenantId(tenant.id)}
                                >
                                    <TableCell>
                                        <div>
                                            <div className="font-medium">{tenant.companyName}</div>
                                            <div className="text-xs text-muted-foreground">{tenant.id}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={PLAN_COLORS[tenant.planId] || 'secondary'}>
                                            {PLAN_LABELS[tenant.planId] || tenant.planId}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_COLORS[tenant.subscriptionStatus] || 'secondary'}>
                                            {STATUS_LABELS[tenant.subscriptionStatus] || tenant.subscriptionStatus}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">{tenant.memberCount}</TableCell>
                                    <TableCell className="text-right">{tenant.usage.totalCalls.toLocaleString('tr-TR')}</TableCell>
                                    <TableCell className="text-right">{tenant.usage.totalMinutes.toLocaleString('tr-TR')}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">${tenant.usage.estimatedCostUsd.toFixed(2)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{formatDate(tenant.createdAt)}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Detail Dialog */}
            <TenantDetailDialog
                tenantId={selectedTenantId}
                onClose={() => setSelectedTenantId(null)}
            />
        </div>
    );
}
