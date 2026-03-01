'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    AlertCircle, CreditCard, Activity, Cpu, Zap, Check,
    BarChart3, CloudLightning, ShieldCheck, Wallet, Sparkles,
    Crown, Building2, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';

// =============================================
// Types
// =============================================

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

interface SubscriptionPlan {
    id: string;
    name: string;
    nameTr: string;
    description: string;
    priceTry: number;
    includedMinutes: number;
    includedCalls: number;
    maxConcurrentSessions: number;
    features: string[];
}

interface Subscription {
    planId: string;
    status: string;
    isActive: boolean;
    currentPeriodEnd: number;
    trialEndsAt?: number;
}

// =============================================
// Component
// =============================================

function BillingPageContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [cost, setCost] = useState<CostEstimate | null>(null);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [paymentHtml, setPaymentHtml] = useState<string | null>(null);

    // Check payment result from redirect
    const paymentResult = searchParams?.get('payment');
    const paymentPlan = searchParams?.get('plan');

    const loadData = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const token = await user.getIdToken();
            const headers = { 'Authorization': `Bearer ${token}` };

            // Load usage, plans, and subscription in parallel
            const [usageRes, plansRes, subRes] = await Promise.all([
                fetch('/api/billing/usage?history=true', { headers }).catch(() => null),
                fetch('/api/billing/checkout', { headers }).catch(() => null),
                fetch('/api/billing/webhook', { headers }).catch(() => null),
            ]);

            // Usage data
            if (usageRes?.ok) {
                const data = await usageRes.json();
                setUsage(data.usage || { totalCalls: 0, totalMinutes: 0, gpuSeconds: 0, apiCalls: 0, kbQueries: 0, tokensUsed: 0, period: 'current', tenantId: '' });
                setCost(data.cost || { baseCost: 0, overageCost: 0, total: 0 });
            }

            // Plans
            if (plansRes?.ok) {
                const data = await plansRes.json();
                setPlans(data.plans || []);
            }

            // Subscription
            if (subRes?.ok) {
                const data = await subRes.json();
                setSubscription(data.subscription || null);
            }

        } catch (err: unknown) {
            setError('Veriler yüklenirken hata oluştu.');
            console.error('Billing data load error:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handle checkout
    const handleCheckout = async (planId: string) => {
        if (!user) return;
        setCheckoutLoading(planId);
        setError(null);

        try {
            const token = await user.getIdToken();

            // Split display name or use defaults
            const displayName = user.displayName || '';
            const nameParts = displayName.split(' ');
            const name = nameParts[0] || 'Ad';
            const surname = nameParts.slice(1).join(' ') || 'Soyad';

            const response = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    planId,
                    buyer: {
                        name,
                        surname,
                        email: user.email || '',
                        phone: user.phoneNumber || undefined,
                    },
                }),
            });

            const data = await response.json();

            if (data.success && data.checkoutFormContent) {
                // Show iyzico payment form
                setPaymentHtml(data.checkoutFormContent);
            } else {
                setError(data.error || 'Ödeme formu oluşturulamadı.');
            }
        } catch (err) {
            setError('Ödeme başlatılamadı. Lütfen tekrar deneyin.');
            console.error('Checkout error:', err);
        } finally {
            setCheckoutLoading(null);
        }
    };

    // Plan icons
    const planIcons: Record<string, React.ReactNode> = {
        starter: <Sparkles className="h-6 w-6" />,
        professional: <Crown className="h-6 w-6" />,
        enterprise: <Building2 className="h-6 w-6" />,
    };

    const planColors: Record<string, string> = {
        starter: 'from-blue-500 to-indigo-600',
        professional: 'from-purple-500 to-pink-600',
        enterprise: 'from-amber-500 to-orange-600',
    };

    // If showing payment form, render it securely via iframe
    if (paymentHtml) {
        const iframeSrcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${paymentHtml}</body></html>`;
        return (
            <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <CreditCard className="h-6 w-6 text-primary" />
                        Ödeme
                    </h2>
                    <Button variant="outline" onClick={() => setPaymentHtml(null)} className="rounded-xl">
                        Vazgeç
                    </Button>
                </div>
                <Card className="rounded-2xl overflow-hidden border shadow-lg">
                    <CardContent className="p-0">
                        <iframe
                            srcDoc={iframeSrcDoc}
                            sandbox="allow-scripts allow-forms allow-same-origin"
                            className="w-full border-0 min-h-[600px] rounded-2xl"
                            title="Ödeme Formu"
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Payment result banner */}
            {paymentResult === 'success' && (
                <div className="bg-green-500/10 text-green-700 border border-green-500/20 p-4 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5" />
                    <div>
                        <p className="font-semibold">Ödeme Başarılı!</p>
                        <p className="text-sm">
                            {paymentPlan ? `${paymentPlan.charAt(0).toUpperCase() + paymentPlan.slice(1)} planınız aktif edildi.` : 'Aboneliğiniz aktif edildi.'}
                        </p>
                    </div>
                </div>
            )}
            {paymentResult === 'failed' && (
                <div className="bg-red-500/10 text-red-700 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
                    <XCircle className="h-5 w-5" />
                    <p className="font-semibold">Ödeme başarısız oldu. Lütfen tekrar deneyin.</p>
                </div>
            )}

            {/* Header */}
            <div className="animate-fade-in-down flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Wallet className="h-8 w-8 text-primary" />
                        Faturalandırma ve Abonelik
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Plan seçimi, kullanım istatistikleri ve ödeme yönetimi.
                    </p>
                </div>

                {subscription?.isActive && (
                    <div className="bg-primary/10 rounded-2xl px-6 py-4 flex items-center gap-4 border border-primary/20">
                        <ShieldCheck className="h-8 w-8 text-primary" />
                        <div>
                            <p className="text-sm font-medium text-primary">Aktif Plan</p>
                            <div className="text-xl font-bold text-foreground capitalize">
                                {subscription.planId}
                                {subscription.status === 'trialing' && (
                                    <Badge variant="secondary" className="ml-2 text-xs">Deneme</Badge>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-orange-500/10 text-orange-600 border border-orange-500/20 p-4 rounded-xl flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm font-medium flex-1">{error}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl shrink-0 text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
                        onClick={() => { setError(null); loadData(); }}
                    >
                        Tekrar Dene
                    </Button>
                </div>
            )}

            {/* Pricing Plans */}
            <div>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Planlar
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(plans.length > 0 ? plans : defaultPlans).map((plan, idx) => {
                        const isCurrentPlan = subscription?.planId === plan.id && subscription?.isActive;
                        const isPro = plan.id === 'professional';

                        return (
                            <Card
                                key={plan.id}
                                className={`rounded-2xl relative overflow-hidden transition-all hover:shadow-lg animate-fade-in-up ${isPro ? 'border-2 border-primary shadow-md scale-[1.02]' : 'border'}`}
                                style={{ animationDelay: `${idx * 120}ms` }}
                            >
                                {isPro && (
                                    <div className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground text-center text-xs font-semibold py-1">
                                        En Popüler
                                    </div>
                                )}
                                <CardHeader className={`${isPro ? 'pt-8' : 'pt-6'} pb-4`}>
                                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${planColors[plan.id] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white mb-3`}>
                                        {planIcons[plan.id] || <Sparkles className="h-6 w-6" />}
                                    </div>
                                    <CardTitle className="text-xl">{plan.nameTr || plan.name}</CardTitle>
                                    <CardDescription>{plan.description}</CardDescription>
                                    <div className="mt-3">
                                        <span className="text-4xl font-bold text-foreground">
                                            {plan.priceTry?.toLocaleString('tr-TR') || '0'}
                                        </span>
                                        <span className="text-muted-foreground ml-1">₺/ay</span>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        {plan.features.map((feature, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm">
                                                <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                                <span>{feature}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="pt-4">
                                        {isCurrentPlan ? (
                                            <Button variant="outline" className="w-full rounded-xl" disabled>
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                Mevcut Plan
                                            </Button>
                                        ) : (
                                            <Button
                                                className={`w-full rounded-xl ${isPro ? 'shadow-lg shadow-primary/20' : ''}`}
                                                variant={isPro ? 'default' : 'outline'}
                                                onClick={() => handleCheckout(plan.id)}
                                                disabled={!!checkoutLoading}
                                            >
                                                {checkoutLoading === plan.id ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Hazırlanıyor...
                                                    </>
                                                ) : (
                                                    <>
                                                        <CreditCard className="h-4 w-4 mr-2" />
                                                        {subscription?.isActive ? 'Plan Değiştir' : 'Satın Al'}
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Usage Statistics */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-[200px] rounded-2xl" />
                    <Skeleton className="h-[200px] rounded-2xl" />
                    <Skeleton className="h-[200px] rounded-2xl" />
                </div>
            ) : usage ? (
                <>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        Kullanım İstatistikleri
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Voice AI Usage */}
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
                                        <span className="text-muted-foreground">Dahil olan</span>
                                        <span className="font-medium text-blue-600">
                                            {getCurrentPlanMinutes(subscription?.planId)} dk
                                        </span>
                                    </div>
                                    <Progress
                                        value={Math.min(
                                            (usage.totalMinutes / getCurrentPlanMinutes(subscription?.planId)) * 100,
                                            100
                                        )}
                                        className="h-2"
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {usage.totalMinutes > getCurrentPlanMinutes(subscription?.planId)
                                            ? <span className="text-orange-500 font-medium">Limit aşıldı!</span>
                                            : `${getCurrentPlanMinutes(subscription?.planId) - usage.totalMinutes} dk kaldı`}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* GPU Usage */}
                        <Card className="rounded-2xl border-none shadow-md overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <Cpu className="h-24 w-24" />
                            </div>
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2 font-medium">
                                    <Cpu className="h-4 w-4 text-purple-500" />
                                    GPU Çıkarım Süresi
                                </CardDescription>
                                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                                    {Math.round(usage.gpuSeconds / 60)} <span className="text-lg text-muted-foreground font-medium">dk</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="mt-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Toplam GPU Saniye</span>
                                        <span className="font-semibold">{usage.gpuSeconds}</span>
                                    </div>
                                    <div className="bg-purple-500/10 text-purple-600 border border-purple-500/20 text-xs px-3 py-2 rounded-lg mt-4 flex items-center gap-2">
                                        <CloudLightning className="h-4 w-4" />
                                        Saniye bazlı ücretlendirilir
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Token Usage */}
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
                                        <span className="text-muted-foreground">KB Sorguları</span>
                                        <span className="font-semibold">{usage.kbQueries}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : null}

            {/* Current Plan Info */}
            {subscription?.isActive && (
                <Card className="rounded-2xl p-6 md:p-8 shadow-sm">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className={`h-16 w-16 bg-gradient-to-br ${planColors[subscription.planId] || 'from-blue-500 to-indigo-600'} rounded-2xl flex items-center justify-center shadow-lg text-white`}>
                                {planIcons[subscription.planId] || <ShieldCheck className="h-8 w-8" />}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold capitalize">SmartFlow {subscription.planId} Plan</h3>
                                <p className="text-muted-foreground text-sm mt-1">
                                    {subscription.status === 'trialing'
                                        ? `Deneme süresi: ${subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString('tr-TR') : '-'}  tarihine kadar`
                                        : `Sonraki ödeme: ${new Date(subscription.currentPeriodEnd).toLocaleDateString('tr-TR')}`}
                                </p>
                            </div>
                        </div>
                        <Badge
                            variant={subscription.status === 'active' ? 'default' : subscription.status === 'trialing' ? 'secondary' : 'destructive'}
                            className="text-sm px-4 py-1"
                        >
                            {subscription.status === 'active' ? 'Aktif' : subscription.status === 'trialing' ? 'Deneme' : 'İptal Edildi'}
                        </Badge>
                    </div>
                </Card>
            )}
        </div>
    );
}

// =============================================
// Skeleton
// =============================================

function BillingPageSkeleton() {
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Header skeleton */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-72 rounded-lg" />
                    <Skeleton className="h-5 w-96 rounded-lg" />
                </div>
            </div>

            {/* Plan cards skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-7 w-32 rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-2xl border border-border/30 p-6 space-y-4 bg-muted/10 animate-fade-in-up opacity-0"
                            style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'forwards' }}
                        >
                            <Skeleton className="h-12 w-12 rounded-xl" />
                            <Skeleton className="h-6 w-28 rounded" />
                            <Skeleton className="h-4 w-full rounded" />
                            <Skeleton className="h-10 w-32 rounded" />
                            <div className="space-y-2 pt-2">
                                <Skeleton className="h-3 w-full rounded" />
                                <Skeleton className="h-3 w-4/5 rounded" />
                                <Skeleton className="h-3 w-3/4 rounded" />
                                <Skeleton className="h-3 w-2/3 rounded" />
                            </div>
                            <Skeleton className="h-10 w-full rounded-xl mt-4" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Usage stat cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-2xl border border-border/30 p-6 space-y-3 bg-muted/10 animate-fade-in-up opacity-0"
                        style={{ animationDelay: `${360 + i * 120}ms`, animationFillMode: 'forwards' }}
                    >
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-36 rounded" />
                            <Skeleton className="h-4 w-4 rounded" />
                        </div>
                        <Skeleton className="h-10 w-24 rounded" />
                        <Skeleton className="h-2 w-full rounded-full" />
                        <Skeleton className="h-3 w-28 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// =============================================
// Page (with Suspense boundary)
// =============================================

export default function BillingPage() {
    return (
        <Suspense fallback={<BillingPageSkeleton />}>
            <BillingPageContent />
        </Suspense>
    );
}

// =============================================
// Helpers
// =============================================

function getCurrentPlanMinutes(planId?: string): number {
    const minutesMap: Record<string, number> = {
        starter: 100,
        professional: 500,
        enterprise: 2000,
    };
    return minutesMap[planId || 'starter'] || 100;
}

// Default plans (used when API is not available)
const defaultPlans: SubscriptionPlan[] = [
    {
        id: 'starter',
        name: 'Starter',
        nameTr: 'Başlangıç',
        description: 'Girişimler ve küçük işletmeler için ideal.',
        priceTry: 990,
        includedMinutes: 100,
        includedCalls: 500,
        maxConcurrentSessions: 2,
        features: [
            'AI Sesli Asistan',
            '100 dk/ay konuşma',
            'Temel CRM',
            'E-posta bildirimleri',
            '2 eşzamanlı oturum',
        ],
    },
    {
        id: 'professional',
        name: 'Professional',
        nameTr: 'Profesyonel',
        description: 'Büyüyen işletmeler için gelişmiş özellikler.',
        priceTry: 2990,
        includedMinutes: 500,
        includedCalls: 2000,
        maxConcurrentSessions: 5,
        features: [
            'AI Sesli Asistan (Gelişmiş)',
            '500 dk/ay konuşma',
            'Gelişmiş CRM + Raporlama',
            'E-posta + SMS bildirimleri',
            '5 eşzamanlı oturum',
            'Bilgi Bankası (RAG)',
            'n8n Otomasyon',
        ],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        nameTr: 'Kurumsal',
        description: 'Kurumsal düzeyde tam çözüm.',
        priceTry: 7990,
        includedMinutes: 2000,
        includedCalls: 10000,
        maxConcurrentSessions: 20,
        features: [
            'Tüm Professional özellikler',
            '2000 dk/ay konuşma',
            'Sınırsız CRM',
            'Özel AI modeli eğitimi',
            '20 eşzamanlı oturum',
            'API erişimi',
            'Öncelikli destek',
            'SLA garantisi',
        ],
    },
];
