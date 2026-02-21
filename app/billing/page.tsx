'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CreditCard, Activity, Cpu, Zap, ArrowUpRight, BarChart3, CloudLightning, ShieldCheck, Wallet } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface UsageStats {
    tenantId: string;
    period: string;
    totalCalls: number;
    totalMinutes: number;
    gpuSeconds: number;
    apiCalls: number;
    kbQueries: number;
    tokensUsed: number;
}

interface CostEstimate {
    baseCost: number;
    overageCost: number;
    total: number;
}

export default function BillingPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [cost, setCost] = useState<CostEstimate | null>(null);

    // Simulated tier data (In a real app, fetch from user's current subscription)
    const currentTier = {
        name: 'Starter',
        includedMinutes: 100,
        pricePerMinute: 0.15,
    };

    useEffect(() => {
        async function loadBillingData() {
            if (!user) return;
            try {
                setLoading(true);
                const token = await user.getIdToken();
                const response = await fetch('/api/billing/usage?history=true', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Faturalandırma verileri alınamadı');
                }

                const data = await response.json();
                setUsage(data.usage || {
                    totalCalls: 0,
                    totalMinutes: 0,
                    gpuSeconds: 0,
                    apiCalls: 0,
                    kbQueries: 0,
                    tokensUsed: 0,
                    period: 'current'
                });
                setCost(data.cost || { baseCost: 29.0, overageCost: 0, total: 29.0 });
            } catch (err: unknown) {
                // Fallback for demo display if API fails
                setUsage({
                    tenantId: 'demo-tenant',
                    period: 'current',
                    totalCalls: 45,
                    totalMinutes: 112,
                    gpuSeconds: 8430,
                    apiCalls: 1205,
                    kbQueries: 340,
                    tokensUsed: 1250000
                });
                setCost({
                    baseCost: 29.0,
                    overageCost: 1.8,
                    total: 30.8
                });
                setError('Gerçek veriler alınamadı, demo veriler gösteriliyor.');
            } finally {
                setLoading(false);
            }
        }

        loadBillingData();
    }, [user]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Wallet className="h-8 w-8 text-primary" />
                        Faturalandırma ve Kullanım
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Mevcut döneme ait kaynak tüketimi ve tahmini fatura detaylarınız.
                    </p>
                </div>

                {cost && (
                    <div className="bg-primary/10 rounded-2xl px-6 py-4 flex items-center gap-6 border border-primary/20">
                        <div>
                            <p className="text-sm font-medium text-primary">Tahmini Fatura (Aylık)</p>
                            <div className="text-3xl font-bold text-foreground">
                                ${cost.total.toFixed(2)}
                            </div>
                        </div>
                        <div className="h-10 w-px bg-primary/20"></div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Plan Ücreti</p>
                            <p className="text-lg font-semibold text-foreground">${cost.baseCost.toFixed(2)}</p>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-orange-500/10 text-orange-600 border border-orange-500/20 p-4 rounded-xl flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-[200px] rounded-2xl" />
                    <Skeleton className="h-[200px] rounded-2xl" />
                    <Skeleton className="h-[200px] rounded-2xl" />
                </div>
            ) : usage ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Çağrı Süresi (Voice AI) */}
                        <Card className="rounded-2xl border-none shadow-md overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <Activity className="h-24 w-24" />
                            </div>
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2 font-medium">
                                    <Activity className="h-4 w-4 text-blue-500" />
                                    Sesli Asistan Kullanımı
                                </CardDescription>
                                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                                    {usage.totalMinutes} <span className="text-lg text-muted-foreground font-medium">dk</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="mt-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Dahil olan (Starter)</span>
                                        <span className="font-medium text-blue-600">{currentTier.includedMinutes} dk</span>
                                    </div>
                                    <Progress value={Math.min((usage.totalMinutes / currentTier.includedMinutes) * 100, 100)} className="h-2" />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {usage.totalMinutes > currentTier.includedMinutes
                                            ? <span className="text-orange-500 font-medium">Limit aşıldı! Ekstra ücretlendirme uygulanıyor.</span>
                                            : `${currentTier.includedMinutes - usage.totalMinutes} dakika kullanım hakkınız kaldı.`}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* GPU Süresi (Inference) */}
                        <Card className="rounded-2xl border-none shadow-md overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <Cpu className="h-24 w-24" />
                            </div>
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2 font-medium">
                                    <Cpu className="h-4 w-4 text-purple-500" />
                                    GPU Çıkarım Süresi (RunPod)
                                </CardDescription>
                                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                                    {Math.round(usage.gpuSeconds / 60)} <span className="text-lg text-muted-foreground font-medium">dk</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="mt-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Toplam GPU Saniye</span>
                                        <span className="font-semibold">{usage.gpuSeconds} saniye</span>
                                    </div>
                                    <div className="bg-purple-500/10 text-purple-600 border border-purple-500/20 text-xs px-3 py-2 rounded-lg mt-4 flex items-center gap-2">
                                        <CloudLightning className="h-4 w-4" />
                                        GPU kaynağı saniye bazlı anlık ücretlendirilir. $0.002 / sn
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* API / Token Tüketimi */}
                        <Card className="rounded-2xl border-none shadow-md overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <Zap className="h-24 w-24" />
                            </div>
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2 font-medium">
                                    <Zap className="h-4 w-4 text-emerald-500" />
                                    LLM Token Tüketimi
                                </CardDescription>
                                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                                    {(usage.tokensUsed / 1000).toFixed(1)}k <span className="text-lg text-muted-foreground font-medium">token</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="mt-4 space-y-3">
                                    <div className="flex justify-between items-center text-sm border-b pb-2">
                                        <span className="text-muted-foreground">API İstekleri</span>
                                        <span className="font-semibold">{usage.apiCalls}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Bilgi Bankası Sorgu</span>
                                        <span className="font-semibold">{usage.kbQueries}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Geçerli Plan Özeti */}
                    <div className="mt-8 bg-card rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between shadow-sm border">
                        <div className="flex items-center gap-6">
                            <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                                <ShieldCheck className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">SmartFlow Starter Plan</h3>
                                <p className="text-muted-foreground text-sm mt-1">Girişimler ve küçük işletmeler için ideal AI paket.</p>
                            </div>
                        </div>
                        <div className="mt-6 md:mt-0 flex gap-4">
                            <Button variant="outline" className="rounded-xl border-dashed">Fatura Geçmişi</Button>
                            <Button className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow">
                                Planı Yükselt
                            </Button>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
