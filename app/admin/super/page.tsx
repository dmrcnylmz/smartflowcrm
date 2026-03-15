'use client';

/**
 * Super-Admin Dashboard Page
 *
 * Tabs:
 *   1. Sistem Metrikleri — System-wide stats from /api/admin/stats
 *   2. Tenant Analitik — Platform-wide tenant analytics & detail view
 *   3. Numara Havuzu — NumberPoolAdmin
 *   4. Porting İstekleri — PortingAdmin
 *   5. Platform Analitik — Cloudflare + platform metrics dashboard
 */

import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Database,
    ArrowRightLeft,
    BarChart3,
    Building2,
    Users,
    Phone,
    Server,
    Loader2,
    RefreshCw,
    AlertCircle,
    Globe,
} from 'lucide-react';

// Lazy load heavy components
const NumberPoolAdmin = lazy(() => import('@/components/admin/number-pool-admin'));
const PortingAdmin = lazy(() => import('@/components/admin/porting-admin'));
const TenantAnalytics = lazy(() => import('@/components/admin/tenant-analytics'));
const PlatformAnalytics = lazy(() => import('@/components/admin/platform-analytics'));

// ─── Types ───

interface SystemStats {
    tenants: { total: number };
    phoneNumbers: {
        total: number;
        twilioNative: number;
        sipTrunk: number;
        legacy: number;
    };
    pool: {
        total: number;
        available: number;
        assigned: number;
        reserved: number;
        byCarrier: Record<string, { total: number; available: number }>;
    };
    porting: { activeRequests: number };
}

// ─── Loading Fallback ───

function TabLoader() {
    return (
        <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
}

// ─── System Metrics Tab ───

function SystemMetrics() {
    const t = useTranslations('superAdmin');
    const authFetch = useAuthFetch();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await authFetch('/api/admin/stats');
            if (!res.ok) throw new Error(t('loadError'));
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('unknownError'));
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (loading) return <TabLoader />;

    if (error) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertCircle className="h-10 w-10 mx-auto text-destructive/50 mb-3" />
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={fetchStats}>
                        {t('tryAgain')}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (!stats) return null;

    return (
        <div className="space-y-6">
            {/* Header with refresh */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('systemOverview')}</h3>
                <Button variant="outline" size="sm" onClick={fetchStats}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('refresh')}
                </Button>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <Users className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{stats.tenants.total}</div>
                                <p className="text-xs text-muted-foreground">{t('totalTenants')}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <Phone className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{stats.phoneNumbers.total}</div>
                                <p className="text-xs text-muted-foreground">{t('activeNumbers')}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-500/10">
                                <Database className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{stats.pool.available}</div>
                                <p className="text-xs text-muted-foreground">{t('poolAvailable')}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-500/10">
                                <ArrowRightLeft className="h-5 w-5 text-orange-600" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{stats.porting.activeRequests}</div>
                                <p className="text-xs text-muted-foreground">{t('activePorting')}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Phone Number Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('numberDistribution')}</CardTitle>
                    <CardDescription>
                        {t('numberDistributionDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium">SIP Trunk</p>
                                <p className="text-xs text-muted-foreground">{t('localProviders')}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold">{stats.phoneNumbers.sipTrunk}</div>
                                <Badge variant="success" className="text-[10px]">$0.003/dk</Badge>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium">Twilio Native</p>
                                <p className="text-xs text-muted-foreground">{t('international')}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold">{stats.phoneNumbers.twilioNative}</div>
                                <Badge variant="secondary" className="text-[10px]">$0.01/dk</Badge>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium">Legacy</p>
                                <p className="text-xs text-muted-foreground">{t('legacySystem')}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold">{stats.phoneNumbers.legacy}</div>
                                <Badge variant="outline" className="text-[10px]">{t('pendingMigration')}</Badge>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Pool Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('numberPoolStatus')}</CardTitle>
                    <CardDescription>
                        {t('numberPoolStatusDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Pool summary bar */}
                    <div className="mb-4">
                        <div className="flex items-center gap-4 mb-2">
                            <span className="text-sm">
                                <span className="font-semibold">{stats.pool.total}</span> {t('total')}
                            </span>
                            <span className="text-sm text-emerald-600">
                                <span className="font-semibold">{stats.pool.available}</span> {t('available')}
                            </span>
                            <span className="text-sm text-blue-600">
                                <span className="font-semibold">{stats.pool.assigned}</span> {t('assigned')}
                            </span>
                            <span className="text-sm text-orange-600">
                                <span className="font-semibold">{stats.pool.reserved}</span> {t('reserved')}
                            </span>
                        </div>

                        {stats.pool.total > 0 && (
                            <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
                                <div
                                    className="bg-emerald-500 h-full transition-all"
                                    style={{ width: `${(stats.pool.available / stats.pool.total) * 100}%` }}
                                />
                                <div
                                    className="bg-blue-500 h-full transition-all"
                                    style={{ width: `${(stats.pool.assigned / stats.pool.total) * 100}%` }}
                                />
                                <div
                                    className="bg-orange-500 h-full transition-all"
                                    style={{ width: `${(stats.pool.reserved / stats.pool.total) * 100}%` }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Carrier breakdown */}
                    {Object.keys(stats.pool.byCarrier).length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                            {Object.entries(stats.pool.byCarrier).map(([carrier, data]) => (
                                <div key={carrier} className="flex items-center justify-between p-3 rounded-lg border">
                                    <div className="flex items-center gap-2">
                                        <Server className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium capitalize">{carrier}</span>
                                    </div>
                                    <div className="text-right text-sm">
                                        <span className="text-emerald-600 font-medium">{data.available}</span>
                                        <span className="text-muted-foreground"> / {data.total}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ─── Main Page ───

export default function SuperAdminPage() {
    const t = useTranslations('superAdmin');
    return (
        <Tabs defaultValue="metrics" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 max-w-3xl">
                <TabsTrigger value="metrics" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('metrics')}</span>
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('tenantAnalytics')}</span>
                </TabsTrigger>
                <TabsTrigger value="pool" className="gap-2">
                    <Database className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('numberPool')}</span>
                </TabsTrigger>
                <TabsTrigger value="porting" className="gap-2">
                    <ArrowRightLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('porting')}</span>
                </TabsTrigger>
                <TabsTrigger value="platform" className="gap-2">
                    <Globe className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('platformAnalytics')}</span>
                </TabsTrigger>
            </TabsList>

            <TabsContent value="metrics">
                <SystemMetrics />
            </TabsContent>

            <TabsContent value="analytics">
                <Suspense fallback={<TabLoader />}>
                    <TenantAnalytics />
                </Suspense>
            </TabsContent>

            <TabsContent value="pool">
                <Suspense fallback={<TabLoader />}>
                    <NumberPoolAdmin />
                </Suspense>
            </TabsContent>

            <TabsContent value="porting">
                <Suspense fallback={<TabLoader />}>
                    <PortingAdmin />
                </Suspense>
            </TabsContent>

            <TabsContent value="platform">
                <Suspense fallback={<TabLoader />}>
                    <PlatformAnalytics />
                </Suspense>
            </TabsContent>
        </Tabs>
    );
}
