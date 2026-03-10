'use client';

/**
 * Super-Admin Dashboard Page
 *
 * Tabs:
 *   1. Sistem Metrikleri — System-wide stats from /api/admin/stats
 *   2. Tenant Analitik — Platform-wide tenant analytics & detail view
 *   3. Numara Havuzu — NumberPoolAdmin
 *   4. Porting İstekleri — PortingAdmin
 */

import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
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
} from 'lucide-react';

// Lazy load heavy components
const NumberPoolAdmin = lazy(() => import('@/components/admin/number-pool-admin'));
const PortingAdmin = lazy(() => import('@/components/admin/porting-admin'));
const TenantAnalytics = lazy(() => import('@/components/admin/tenant-analytics'));

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
    const authFetch = useAuthFetch();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await authFetch('/api/admin/stats');
            if (!res.ok) throw new Error('Sistem metrikleri yüklenemedi');
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bilinmeyen hata');
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
                        Tekrar Dene
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
                <h3 className="text-lg font-semibold">Sistem Genel Bakış</h3>
                <Button variant="outline" size="sm" onClick={fetchStats}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Yenile
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
                                <p className="text-xs text-muted-foreground">Toplam Tenant</p>
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
                                <p className="text-xs text-muted-foreground">Aktif Numara</p>
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
                                <p className="text-xs text-muted-foreground">Havuz (Müsait)</p>
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
                                <p className="text-xs text-muted-foreground">Aktif Porting</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Phone Number Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Numara Dağılımı (Provider)</CardTitle>
                    <CardDescription>
                        Aktif telefon numaralarının sağlayıcıya göre dağılımı
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium">SIP Trunk</p>
                                <p className="text-xs text-muted-foreground">Netgsm / Bulutfon</p>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold">{stats.phoneNumbers.sipTrunk}</div>
                                <Badge variant="success" className="text-[10px]">$0.003/dk</Badge>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium">Twilio Native</p>
                                <p className="text-xs text-muted-foreground">Uluslararası</p>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold">{stats.phoneNumbers.twilioNative}</div>
                                <Badge variant="secondary" className="text-[10px]">$0.01/dk</Badge>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-sm font-medium">Legacy</p>
                                <p className="text-xs text-muted-foreground">Eski sistem</p>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold">{stats.phoneNumbers.legacy}</div>
                                <Badge variant="outline" className="text-[10px]">migrasyon bekliyor</Badge>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Pool Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Numara Havuzu Durumu</CardTitle>
                    <CardDescription>
                        SIP numara havuzunun durumu ve operatör dağılımı
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Pool summary bar */}
                    <div className="mb-4">
                        <div className="flex items-center gap-4 mb-2">
                            <span className="text-sm">
                                <span className="font-semibold">{stats.pool.total}</span> toplam
                            </span>
                            <span className="text-sm text-emerald-600">
                                <span className="font-semibold">{stats.pool.available}</span> müsait
                            </span>
                            <span className="text-sm text-blue-600">
                                <span className="font-semibold">{stats.pool.assigned}</span> atanmış
                            </span>
                            <span className="text-sm text-orange-600">
                                <span className="font-semibold">{stats.pool.reserved}</span> rezerve
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
    return (
        <Tabs defaultValue="metrics" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 max-w-2xl">
                <TabsTrigger value="metrics" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Metrikler</span>
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Tenant Analitik</span>
                </TabsTrigger>
                <TabsTrigger value="pool" className="gap-2">
                    <Database className="h-4 w-4" />
                    <span className="hidden sm:inline">Numara Havuzu</span>
                </TabsTrigger>
                <TabsTrigger value="porting" className="gap-2">
                    <ArrowRightLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Porting</span>
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
        </Tabs>
    );
}
