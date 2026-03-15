'use client';

/**
 * Tenant Detail Dialog — Detailed view for a single tenant
 *
 * Opens when a row is clicked in the tenant analytics table.
 * Tabs:
 *   1. Overview — Usage KPIs + 6-month bar chart + cost breakdown
 *   2. Members — Member table with roles
 *   3. Subscription — Plan info, billing details
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
    Phone, Clock, DollarSign, Users, AlertCircle,
    CalendarDays, MessageSquare, UserCheck,
    Building2, Globe, Mail, CreditCard,
} from 'lucide-react';

// ─── Types ───

interface TenantDetail {
    tenant: {
        id: string;
        companyName: string;
        sector: string;
        language: string;
        active: boolean;
        createdAt: string;
        updatedAt: string;
        agent: { name: string; role: string };
        business: { workingHours: string; workingDays: string; phone?: string; email?: string; website?: string };
        quotas: { dailyMinutes: number; monthlyCalls: number; maxConcurrentSessions: number };
    };
    subscription: {
        status: string;
        planId: string;
        planName: string;
        billingInterval: string;
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        renewsAt: string | null;
        cardBrand: string | null;
        cardLastFour: string | null;
    } | null;
    members: Array<{
        uid: string;
        email: string | null;
        displayName: string | null;
        role: string;
        assignedAt: unknown;
    }>;
    currentUsage: {
        totalCalls?: number;
        totalMinutes?: number;
        ttsChars?: number;
        costBreakdown: {
            baseCost: number;
            voiceCost: number;
            ttsCost: number;
            llmCost: number;
            infraCost: number;
            overageCost: number;
            total: number;
            margin: number;
            avgCostPerCall: number;
        };
    };
    usageHistory: Array<{
        period?: string;
        totalCalls?: number;
        totalMinutes?: number;
        costBreakdown: {
            infraCost: number;
            total: number;
        };
    }>;
    entityCounts: {
        calls: number;
        appointments: number;
        complaints: number;
        customers: number;
    };
}

// ─── Color Helpers (no labels — labels come from translations) ───

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

const ROLE_COLORS: Record<string, 'default' | 'secondary' | 'success' | 'outline'> = {
    owner: 'default',
    admin: 'success',
    agent: 'secondary',
    viewer: 'outline',
};

// ─── Mini KPI Card ───

function MiniKpi({ icon: Icon, label, value, color }: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    color: string;
}) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg border">
            <div className={`p-1.5 rounded-md ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <div className="text-lg font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
                <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
        </div>
    );
}

// ─── Main Component ───

interface TenantDetailDialogProps {
    tenantId: string | null;
    onClose: () => void;
}

export default function TenantDetailDialog({ tenantId, onClose }: TenantDetailDialogProps) {
    const t = useTranslations('tenantDetail');
    const ta = useTranslations('adminAnalytics');
    const authFetch = useAuthFetch();
    const [data, setData] = useState<TenantDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Build label maps from translations
    const PLAN_LABELS: Record<string, string> = useMemo(() => ({
        starter: ta('starter'),
        professional: ta('professional'),
        enterprise: ta('enterprise'),
    }), [ta]);

    const STATUS_LABELS: Record<string, string> = useMemo(() => ({
        active: ta('active'),
        on_trial: ta('trial'),
        trialing: ta('trial'),
        cancelled: ta('cancelled'),
        expired: ta('expired'),
        past_due: ta('pastDue'),
        none: ta('noSubscription'),
        unknown: ta('unknown'),
    }), [ta]);

    const ROLE_LABELS: Record<string, string> = useMemo(() => ({
        owner: t('owner'),
        admin: t('admin'),
        agent: t('agent'),
        viewer: t('viewer'),
    }), [t]);

    // Format date helper
    const formatDate = useCallback((dateStr: string | null | undefined) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return String(dateStr);
        }
    }, []);

    const fetchDetail = useCallback(async (id: string) => {
        try {
            setLoading(true);
            setError(null);
            setData(null);
            const res = await authFetch(`/api/admin/tenant-analytics/${id}`);
            if (!res.ok) throw new Error(t('loadError'));
            const json: TenantDetail = await res.json();
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : ta('unknownError'));
        } finally {
            setLoading(false);
        }
    }, [authFetch, t, ta]);

    useEffect(() => {
        if (tenantId) {
            fetchDetail(tenantId);
        } else {
            setData(null);
        }
    }, [tenantId, fetchDetail]);

    const isOpen = Boolean(tenantId);

    // Prepare chart data (reverse so oldest is first)
    const chartData = data?.usageHistory
        ? [...data.usageHistory].reverse().map(u => ({
            period: u.period?.replace(/^\d{4}-/, '') || '?',
            calls: u.totalCalls || 0,
            minutes: u.totalMinutes || 0,
            cost: u.costBreakdown?.infraCost || 0,
        }))
        : [];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {data?.tenant.companyName || tenantId}
                    </DialogTitle>
                    <DialogDescription>
                        {data ? `${data.tenant.sector} • ${data.tenant.id}` : t('loading')}
                    </DialogDescription>
                </DialogHeader>

                {loading && (
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-[72px] rounded-lg" />
                            ))}
                        </div>
                        <Skeleton className="h-[200px] rounded-lg" />
                    </div>
                )}

                {error && (
                    <div className="py-8 text-center">
                        <AlertCircle className="h-8 w-8 mx-auto text-destructive/50 mb-2" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                {data && (
                    <Tabs defaultValue="overview" className="mt-2">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
                            <TabsTrigger value="members">{t('membersTab')} ({data.members.length})</TabsTrigger>
                            <TabsTrigger value="subscription">{t('subscription')}</TabsTrigger>
                        </TabsList>

                        {/* ─── Overview Tab ─── */}
                        <TabsContent value="overview" className="space-y-4">
                            {/* Usage KPIs */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <MiniKpi icon={Phone} label={t('totalCalls')} value={data.entityCounts.calls} color="bg-purple-500/10 text-purple-600" />
                                <MiniKpi icon={CalendarDays} label={t('appointments')} value={data.entityCounts.appointments} color="bg-blue-500/10 text-blue-600" />
                                <MiniKpi icon={MessageSquare} label={t('complaints')} value={data.entityCounts.complaints} color="bg-orange-500/10 text-orange-600" />
                                <MiniKpi icon={UserCheck} label={t('customers')} value={data.entityCounts.customers} color="bg-emerald-500/10 text-emerald-600" />
                            </div>

                            {/* Current Usage Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <MiniKpi icon={Phone} label={t('callsThisMonth')} value={data.currentUsage.totalCalls || 0} color="bg-purple-500/10 text-purple-600" />
                                <MiniKpi icon={Clock} label={t('minutesThisMonth')} value={data.currentUsage.totalMinutes || 0} color="bg-orange-500/10 text-orange-600" />
                                <MiniKpi icon={DollarSign} label={t('infraCost')} value={`$${data.currentUsage.costBreakdown.infraCost.toFixed(2)}`} color="bg-red-500/10 text-red-600" />
                                <MiniKpi icon={DollarSign} label={t('totalRevenue')} value={`$${data.currentUsage.costBreakdown.total.toFixed(2)}`} color="bg-green-500/10 text-green-600" />
                            </div>

                            {/* Usage History Chart */}
                            {chartData.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">{t('monthlyUsageHistory')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                                <XAxis dataKey="period" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                                                    labelStyle={{ fontWeight: 600 }}
                                                />
                                                <Bar dataKey="calls" name={ta('calls')} fill="hsl(270, 70%, 55%)" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="minutes" name={ta('minutes')} fill="hsl(200, 70%, 50%)" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Cost Breakdown */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">{t('costDetail')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="flex justify-between p-2 rounded border">
                                            <span className="text-muted-foreground">{t('planFee')}</span>
                                            <span className="font-medium">${data.currentUsage.costBreakdown.baseCost}</span>
                                        </div>
                                        <div className="flex justify-between p-2 rounded border">
                                            <span className="text-muted-foreground">{t('voiceCost')}</span>
                                            <span className="font-medium">${data.currentUsage.costBreakdown.voiceCost}</span>
                                        </div>
                                        <div className="flex justify-between p-2 rounded border">
                                            <span className="text-muted-foreground">{t('ttsCost')}</span>
                                            <span className="font-medium">${data.currentUsage.costBreakdown.ttsCost}</span>
                                        </div>
                                        <div className="flex justify-between p-2 rounded border">
                                            <span className="text-muted-foreground">{t('llmCost')}</span>
                                            <span className="font-medium">${data.currentUsage.costBreakdown.llmCost}</span>
                                        </div>
                                        <div className="flex justify-between p-2 rounded border">
                                            <span className="text-muted-foreground">{t('overageFee')}</span>
                                            <span className="font-medium">${data.currentUsage.costBreakdown.overageCost}</span>
                                        </div>
                                        <div className="flex justify-between p-2 rounded border bg-muted/50">
                                            <span className="font-medium">{t('margin')}</span>
                                            <span className={`font-bold ${data.currentUsage.costBreakdown.margin >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                                ${data.currentUsage.costBreakdown.margin.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                    {data.currentUsage.costBreakdown.avgCostPerCall > 0 && (
                                        <p className="text-xs text-muted-foreground mt-3">
                                            {t('avgCostPerCall')}: <span className="font-medium">${data.currentUsage.costBreakdown.avgCostPerCall.toFixed(3)}</span>
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ─── Members Tab ─── */}
                        <TabsContent value="members">
                            {data.members.length === 0 ? (
                                <div className="py-12 text-center text-sm text-muted-foreground">
                                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    {t('noMembersYet')}
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('email')}</TableHead>
                                            <TableHead>{t('name')}</TableHead>
                                            <TableHead>{t('role')}</TableHead>
                                            <TableHead>{t('joinDate')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.members.map((m) => (
                                            <TableRow key={m.uid}>
                                                <TableCell className="font-medium text-sm">{m.email || m.uid}</TableCell>
                                                <TableCell className="text-sm">{m.displayName || '-'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={ROLE_COLORS[m.role] || 'secondary'}>
                                                        {ROLE_LABELS[m.role] || m.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {m.assignedAt && typeof m.assignedAt === 'object' && '_seconds' in (m.assignedAt as Record<string, unknown>)
                                                        ? formatDate(new Date((m.assignedAt as { _seconds: number })._seconds * 1000).toISOString())
                                                        : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </TabsContent>

                        {/* ─── Subscription Tab ─── */}
                        <TabsContent value="subscription" className="space-y-4">
                            {!data.subscription ? (
                                <div className="py-12 text-center text-sm text-muted-foreground">
                                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    {t('noSubscriptionInfo')}
                                </div>
                            ) : (
                                <>
                                    {/* Plan Info */}
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-medium">{t('planInfo')}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">{ta('plan')}</span>
                                                <Badge variant="default">
                                                    {PLAN_LABELS[data.subscription.planId] || data.subscription.planName}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">{ta('status')}</span>
                                                <Badge variant={STATUS_COLORS[data.subscription.status] || 'secondary'}>
                                                    {STATUS_LABELS[data.subscription.status] || data.subscription.status}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">{t('billingInterval')}</span>
                                                <span className="text-sm font-medium">
                                                    {data.subscription.billingInterval === 'yearly' ? t('yearly') : t('monthly')}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Billing Period */}
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-medium">{t('billingPeriod')}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">{t('periodStart')}</span>
                                                <span className="text-sm">{formatDate(data.subscription.currentPeriodStart)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">{t('periodEnd')}</span>
                                                <span className="text-sm">{formatDate(data.subscription.currentPeriodEnd)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">{t('renewalDate')}</span>
                                                <span className="text-sm">{formatDate(data.subscription.renewsAt)}</span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Payment Method */}
                                    {data.subscription.cardLastFour && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-medium">{t('paymentMethod')}</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="flex items-center gap-3">
                                                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                                                    <span className="text-sm font-medium">
                                                        {data.subscription.cardBrand || t('card')} •••• {data.subscription.cardLastFour}
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </>
                            )}

                            {/* Tenant Business Info */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">{t('businessInfo')}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{t('sector')}:</span>
                                        <span>{data.tenant.sector}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Globe className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{t('language')}:</span>
                                        <span>{data.tenant.language}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{t('workingHours')}:</span>
                                        <span>{data.tenant.business.workingHours} ({data.tenant.business.workingDays})</span>
                                    </div>
                                    {data.tenant.business.email && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">{t('email')}:</span>
                                            <span>{data.tenant.business.email}</span>
                                        </div>
                                    )}
                                    {data.tenant.business.phone && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">{t('phone')}:</span>
                                            <span>{data.tenant.business.phone}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-sm">
                                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{ta('registrationDate')}:</span>
                                        <span>{formatDate(data.tenant.createdAt)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Quotas */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">{t('quotas')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-3 text-sm">
                                        <div className="text-center p-2 rounded border">
                                            <div className="text-lg font-bold">{data.tenant.quotas.dailyMinutes}</div>
                                            <p className="text-[11px] text-muted-foreground">{t('dailyMinutes')}</p>
                                        </div>
                                        <div className="text-center p-2 rounded border">
                                            <div className="text-lg font-bold">{data.tenant.quotas.monthlyCalls.toLocaleString()}</div>
                                            <p className="text-[11px] text-muted-foreground">{t('monthlyCalls')}</p>
                                        </div>
                                        <div className="text-center p-2 rounded border">
                                            <div className="text-lg font-bold">{data.tenant.quotas.maxConcurrentSessions}</div>
                                            <p className="text-[11px] text-muted-foreground">{t('concurrent')}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    );
}
