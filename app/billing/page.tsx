'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Button } from '@/components/ui/button';
import {
    AlertCircle, CreditCard, Activity, Zap, Check,
    BarChart3, ShieldCheck, Wallet, Sparkles,
    Crown, Building2, Loader2, CheckCircle2, XCircle,
    Phone, MessageSquare, TrendingUp, DollarSign,
    Calculator, ArrowRight, Info, Volume2,
    ArrowUpRight, Calendar, RefreshCw, ExternalLink,
    ChevronUp, Repeat
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import nextDynamic from 'next/dynamic';

// Lazy-load heavy chart components
const VoiceAnalyticsCharts = nextDynamic(() => import('@/components/dashboard/VoiceAnalyticsCharts'), {
    ssr: false,
    loading: () => <div className="h-[400px] animate-pulse rounded-3xl bg-muted" />,
});
import EmergencyModeCard from '@/components/billing/EmergencyModeCard';
import VoicePipelineStats from '@/components/billing/VoicePipelineStats';

// =============================================
// Types
// =============================================

interface UsageStats {
    tenantId: string;
    period: string;
    totalCalls: number;
    totalMinutes: number;
    ttsChars: number;
    gpuSeconds: number;
    apiCalls: number;
    kbQueries: number;
    tokensUsed: number;
}

interface CostBreakdown {
    baseCost: number;
    twilioCost: number;
    ttsCost: number;
    llmCost: number;
    gpuCost: number;
    apiCost: number;
    overageCost: number;
    infraCost: number;
    total: number;
    avgCostPerCall: number;
    margin: number;
}

interface PerCallCost {
    twilio: number;
    tts: number;
    llm: number;
    total: number;
}

interface UsageLimits {
    minutesExceeded: boolean;
    callsExceeded: boolean;
    usagePercent: number;
    callPercent: number;
}

interface TierInfo {
    name: string;
    includedMinutes: number;
    includedCalls: number;
}

interface SubscriptionPlan {
    id: string;
    name: string;
    nameTr: string;
    description: string;
    priceTry: number;
    priceYearlyTry: number;
    includedMinutes: number;
    includedCalls: number;
    maxConcurrentSessions: number;
    features: string[];
}

type BillingInterval = 'monthly' | 'yearly';

interface BillingActivity {
    id: string;
    type: string;
    description?: string;
    details?: Record<string, unknown>;
    createdAt: { _seconds?: number; seconds?: number } | string;
}

interface Subscription {
    planId: string;
    status: string;
    isActive: boolean;
    currentPeriodEnd: number;
    billingInterval?: BillingInterval;
    trialEndsAt?: number;
    cancelledAt?: number;
    endsAt?: number;
    customerPortalUrl?: string;
    updatePaymentMethodUrl?: string;
    cardBrand?: string;
    cardLastFour?: string;
    lsSubscriptionId?: string;
}

// Plan sıralaması (swap butonları için)
const PLAN_ORDER: Record<string, number> = { starter: 1, professional: 2, enterprise: 3 };

// =============================================
// Billing Page
// =============================================

function BillingPageContent() {
    const { user, role } = useAuth();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [cost, setCost] = useState<CostBreakdown | null>(null);
    const [perCallCost, setPerCallCost] = useState<PerCallCost | null>(null);
    const [limits, setLimits] = useState<UsageLimits | null>(null);
    const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
    const [plans] = useState<SubscriptionPlan[]>(defaultPlans);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [swapLoading, setSwapLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'plans' | 'usage' | 'calculator' | 'pipeline' | 'invoices'>('plans');
    const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

    // Voice pipeline analytics state
    const [pipelineData, setPipelineData] = useState<any>(null);
    const [emergencyData, setEmergencyData] = useState<any>(null);
    const [pipelineLoading, setPipelineLoading] = useState(false);

    // Invoice history state
    const [invoices, setInvoices] = useState<BillingActivity[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);

    // Scaling calculator state
    const [calcUsers, setCalcUsers] = useState(10);
    const [calcCallsPerUser, setCalcCallsPerUser] = useState(50);
    const [calcAvgDuration, setCalcAvgDuration] = useState(3);

    const paymentResult = searchParams?.get('payment');
    const paymentPlan = searchParams?.get('plan');
    const paymentInterval = searchParams?.get('interval');

    const loadData = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const token = await user.getIdToken();
            const headers = { 'Authorization': `Bearer ${token}` };

            const [usageRes, subRes] = await Promise.all([
                fetch('/api/billing/usage?history=true', { headers }).catch(() => null),
                fetch('/api/billing/webhook', { headers }).catch(() => null),
            ]);

            if (usageRes?.ok) {
                const data = await usageRes.json();
                setUsage(data.usage || null);
                setCost(data.cost || null);
                setPerCallCost(data.perCallCost || null);
                setLimits(data.limits || null);
                setTierInfo(data.tierInfo || null);
            }

            if (subRes?.ok) {
                const data = await subRes.json();
                if (data.subscription) {
                    setSubscription(data.subscription);
                    // Mevcut aboneliğin interval'ini toggle'a yansıt
                    if (data.subscription.billingInterval) {
                        setBillingInterval(data.subscription.billingInterval);
                    }
                }
            }
        } catch {
            setError('Veriler yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    // Load voice pipeline analytics when tab switches
    const loadPipelineData = useCallback(async () => {
        if (!user) return;
        setPipelineLoading(true);
        try {
            const token = await user.getIdToken();
            const headers = { 'Authorization': `Bearer ${token}` };

            const [analyticsRes, emergencyRes] = await Promise.all([
                fetch('/api/billing/analytics?range=30d&type=summary', { headers }).catch(() => null),
                fetch('/api/billing/emergency', { headers }).catch(() => null),
            ]);

            if (analyticsRes?.ok) {
                const data = await analyticsRes.json();
                setPipelineData(data);
            }
            if (emergencyRes?.ok) {
                const data = await emergencyRes.json();
                setEmergencyData(data);
            }
        } catch {
            // Non-critical — billing page still works
        } finally {
            setPipelineLoading(false);
        }
    }, [user]);

    // Load invoice history when tab switches
    const loadInvoices = useCallback(async () => {
        if (!user) return;
        setInvoicesLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/billing/invoices', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setInvoices(data.activities || []);
            }
        } catch {
            // Non-critical
        } finally {
            setInvoicesLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (activeTab === 'pipeline') loadPipelineData();
        if (activeTab === 'invoices') loadInvoices();
    }, [activeTab, loadPipelineData, loadInvoices]);

    const handleEmergencyToggle = useCallback(async (action: 'activate' | 'deactivate') => {
        if (!user) return;
        const token = await user.getIdToken();
        await fetch('/api/billing/emergency', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
        await loadPipelineData();
    }, [user, loadPipelineData]);

    // Scaling calculator computed values
    const totalCalls = calcUsers * calcCallsPerUser;
    const totalMinutes = totalCalls * calcAvgDuration;
    const calcTwilio = totalMinutes * 0.01;
    const calcTts = totalMinutes * 600 * 0.00015; // ~600 chars/min
    const calcLlm = totalCalls * 0.02;
    const calcInfra = calcTwilio + calcTts + calcLlm;

    // Lemon Squeezy checkout — redirect to hosted payment page
    async function handleCheckout(planId: string) {
        if (!user) return;
        setCheckoutLoading(planId);
        setError(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ planId, billingInterval }),
            });
            const data = await res.json();
            if (data.success && data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            } else {
                setError(data.error || 'Ödeme sayfası oluşturulamadı.');
            }
        } catch {
            setError('Ödeme sayfası oluşturulurken bir hata oluştu.');
        } finally {
            setCheckoutLoading(null);
        }
    }

    // Plan swap — change plan or billing interval
    async function handleSwap(planId: string, interval: BillingInterval) {
        if (!user || !subscription?.isActive) return;
        const key = `${planId}-${interval}`;
        setSwapLoading(key);
        setError(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/billing/swap', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ planId, billingInterval: interval, prorate: true }),
            });
            const data = await res.json();
            if (data.success) {
                // Veri yenileme — webhook Firestore'u güncelledikten sonra
                setTimeout(() => loadData(), 3000);
                setError(null);
                // Geçici başarı mesajı
                setError(null);
                // Başarı banner göster (error state'i kötüye kullanmak yerine)
                alert('Plan değişikliği başarılı! Abonelik bilgileriniz birkaç saniye içinde güncellenecek.');
            } else {
                setError(data.error || 'Plan değişikliği yapılamadı.');
            }
        } catch {
            setError('Plan değişikliği sırasında bir hata oluştu.');
        } finally {
            setSwapLoading(null);
        }
    }

    // Plan kartı buton metni ve aksiyonu belirleme
    function getPlanAction(plan: SubscriptionPlan): {
        label: string;
        icon: React.ReactNode;
        action: () => void;
        disabled: boolean;
        variant: 'current' | 'upgrade' | 'swap' | 'interval' | 'select';
    } {
        const isLoading = checkoutLoading !== null || swapLoading !== null;
        const currentKey = `${plan.id}-${billingInterval}`;
        const isSwapLoading = swapLoading === currentKey;
        const isCheckoutLoading = checkoutLoading === plan.id;

        // Abonelik yoksa → "Planı Seç"
        if (!subscription?.isActive) {
            return {
                label: isCheckoutLoading ? 'Yönlendiriliyor...' : 'Planı Seç',
                icon: isCheckoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />,
                action: () => handleCheckout(plan.id),
                disabled: isLoading,
                variant: 'select',
            };
        }

        const currentOrder = PLAN_ORDER[subscription.planId] || 0;
        const targetOrder = PLAN_ORDER[plan.id] || 0;
        const isSamePlan = subscription.planId === plan.id;
        const isSameInterval = (subscription.billingInterval || 'monthly') === billingInterval;

        // Aynı plan ve aynı interval → "Mevcut Plan ✓"
        if (isSamePlan && isSameInterval) {
            return {
                label: 'Mevcut Plan',
                icon: <CheckCircle2 className="h-4 w-4" />,
                action: () => {},
                disabled: true,
                variant: 'current',
            };
        }

        // Aynı plan, farklı interval → "Süreyi Değiştir"
        if (isSamePlan && !isSameInterval) {
            return {
                label: isSwapLoading ? 'Değiştiriliyor...' : (billingInterval === 'yearly' ? 'Yıllığa Geç' : 'Aylığa Geç'),
                icon: isSwapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />,
                action: () => handleSwap(plan.id, billingInterval),
                disabled: isLoading,
                variant: 'interval',
            };
        }

        // Üst plan → "Yükselt ↑"
        if (targetOrder > currentOrder) {
            return {
                label: isSwapLoading ? 'Yükseltiliyor...' : 'Yükselt',
                icon: isSwapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronUp className="h-4 w-4" />,
                action: () => handleSwap(plan.id, billingInterval),
                disabled: isLoading,
                variant: 'upgrade',
            };
        }

        // Alt plan → "Değiştir"
        return {
            label: isSwapLoading ? 'Değiştiriliyor...' : 'Değiştir',
            icon: isSwapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />,
            action: () => handleSwap(plan.id, billingInterval),
            disabled: isLoading,
            variant: 'swap',
        };
    }

    // Fiyatı göster — aylık veya yıllık
    function getDisplayPrice(plan: SubscriptionPlan): { price: number; period: string; note?: string } {
        if (billingInterval === 'yearly') {
            const monthlyEquivalent = Math.round(plan.priceYearlyTry / 12);
            return {
                price: monthlyEquivalent,
                period: '/ay',
                note: `Yıllık faturalanır — ${plan.priceYearlyTry.toLocaleString('tr-TR')} ₺/yıl`,
            };
        }
        return { price: plan.priceTry, period: '/ay' };
    }

    return (
        <div className="min-h-screen bg-[#080810] p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Payment result banners */}
            {paymentResult === 'success' && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <div>
                        <p className="font-semibold text-emerald-300">Ödeme Başarılı!</p>
                        <p className="text-sm text-emerald-400/70">
                            {paymentPlan ? `${paymentPlan.charAt(0).toUpperCase() + paymentPlan.slice(1)} planınız aktif.` : 'Aboneliğiniz aktif.'}
                            {paymentInterval === 'yearly' && ' (Yıllık)'}
                        </p>
                    </div>
                </div>
            )}
            {paymentResult === 'failed' && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
                    <XCircle className="h-5 w-5 text-red-400" />
                    <p className="font-semibold text-red-300">Ödeme başarısız. Lütfen tekrar deneyin.</p>
                </div>
            )}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}

            {/* Header */}
            <div className="animate-fade-in">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                                <Wallet className="h-5 w-5 text-white" />
                            </div>
                            Faturalandırma
                        </h1>
                        <p className="text-white/40 mt-2 text-sm">
                            Plan yönetimi, maliyet analizi ve kullanım takibi.
                        </p>
                    </div>

                    {subscription?.isActive && (
                        <div className="flex items-center gap-3">
                            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-5 py-3 flex items-center gap-3">
                                <ShieldCheck className="h-6 w-6 text-emerald-400" />
                                <div>
                                    <p className="text-xs text-white/40">Aktif Plan</p>
                                    <p className="text-lg font-bold text-white capitalize">
                                        {subscription.planId}
                                        <span className="text-xs font-normal text-white/40 ml-2">
                                            ({subscription.billingInterval === 'yearly' ? 'Yıllık' : 'Aylık'})
                                        </span>
                                    </p>
                                </div>
                            </div>
                            {subscription.customerPortalUrl && (
                                <a
                                    href={subscription.customerPortalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors flex items-center gap-2"
                                >
                                    <CreditCard className="h-4 w-4" />
                                    Aboneliği Yönet
                                </a>
                            )}
                        </div>
                    )}
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 mt-6 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit">
                    {[
                        { id: 'plans' as const, label: 'Planlar', icon: CreditCard },
                        { id: 'usage' as const, label: 'Kullanim', icon: BarChart3 },
                        { id: 'invoices' as const, label: 'Faturalar', icon: Wallet },
                        { id: 'pipeline' as const, label: 'Ses Pipeline', icon: Volume2 },
                        ...(role === 'owner' || role === 'admin' ? [{ id: 'calculator' as const, label: 'Maliyet Hesaplama', icon: Calculator }] : []),
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeTab === tab.id
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                            }`}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-orange-400" />
                    <p className="text-sm text-orange-300 flex-1">{error}</p>
                    <button
                        onClick={() => { setError(null); loadData(); }}
                        className="px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 text-sm hover:bg-orange-500/30 transition-colors"
                    >
                        Tekrar Dene
                    </button>
                </div>
            )}

            {/* ===================== PLANS TAB ===================== */}
            {activeTab === 'plans' && (
                <div className="space-y-8 animate-fade-in">

                    {/* ── Active Subscription Detail Card ── */}
                    {subscription?.isActive && (
                        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <ShieldCheck className="h-5 w-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/40 uppercase tracking-wider">Aktif Abonelik</p>
                                        <p className="text-lg font-bold text-white capitalize">
                                            {subscription.planId}
                                            <span className="ml-2 text-xs font-normal bg-white/[0.06] px-2 py-0.5 rounded-full text-white/50">
                                                {subscription.billingInterval === 'yearly' ? 'Yıllık' : 'Aylık'}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {subscription.updatePaymentMethodUrl && (
                                        <a
                                            href={subscription.updatePaymentMethodUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
                                        >
                                            <CreditCard className="h-3.5 w-3.5" />
                                            Ödeme Yöntemi
                                        </a>
                                    )}
                                    {subscription.customerPortalUrl && (
                                        <a
                                            href={subscription.customerPortalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Müşteri Portalı
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Subscription details row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-white/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-white/30 uppercase tracking-wider">Durum</p>
                                    <p className={`text-sm font-semibold mt-0.5 ${
                                        subscription.status === 'active' ? 'text-emerald-400' :
                                        subscription.status === 'cancelled' ? 'text-amber-400' :
                                        subscription.status === 'past_due' ? 'text-red-400' :
                                        'text-white/60'
                                    }`}>
                                        {subscription.status === 'active' ? 'Aktif' :
                                         subscription.status === 'cancelled' ? 'İptal Edildi' :
                                         subscription.status === 'past_due' ? 'Ödeme Gecikmiş' :
                                         subscription.status === 'on_trial' ? 'Deneme' :
                                         subscription.status}
                                    </p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-white/30 uppercase tracking-wider">Yenilenme Tarihi</p>
                                    <p className="text-sm font-semibold text-white mt-0.5">
                                        {subscription.currentPeriodEnd
                                            ? new Date(subscription.currentPeriodEnd).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
                                            : '—'}
                                    </p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-white/30 uppercase tracking-wider">Ödeme Döngüsü</p>
                                    <p className="text-sm font-semibold text-white mt-0.5">
                                        {subscription.billingInterval === 'yearly' ? 'Yıllık' : 'Aylık'}
                                    </p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-white/30 uppercase tracking-wider">Ödeme Yöntemi</p>
                                    <p className="text-sm font-semibold text-white mt-0.5">
                                        {subscription.cardBrand && subscription.cardLastFour
                                            ? `${subscription.cardBrand} •••• ${subscription.cardLastFour}`
                                            : '—'}
                                    </p>
                                </div>
                            </div>

                            {/* Cancellation warning */}
                            {subscription.status === 'cancelled' && subscription.endsAt && (
                                <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-300">Aboneliğiniz iptal edildi</p>
                                        <p className="text-xs text-amber-400/70 mt-1">
                                            {new Date(subscription.endsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            {' '}tarihine kadar erişiminiz devam edecektir. Yeniden abone olmak için bir plan seçin.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Past due warning */}
                            {subscription.status === 'past_due' && (
                                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-300">Ödeme gecikmiş</p>
                                        <p className="text-xs text-red-400/70 mt-1">
                                            Son ödemeniz alınamadı. Lütfen ödeme yönteminizi güncelleyin, aksi halde aboneliğiniz askıya alınabilir.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Billing Interval Toggle ── */}
                    <div className="flex items-center justify-center gap-3">
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 flex items-center">
                            <button
                                onClick={() => setBillingInterval('monthly')}
                                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                                    billingInterval === 'monthly'
                                        ? 'bg-white/[0.1] text-white shadow-sm'
                                        : 'text-white/40 hover:text-white/60'
                                }`}
                            >
                                Aylık
                            </button>
                            <button
                                onClick={() => setBillingInterval('yearly')}
                                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                    billingInterval === 'yearly'
                                        ? 'bg-white/[0.1] text-white shadow-sm'
                                        : 'text-white/40 hover:text-white/60'
                                }`}
                            >
                                Yıllık
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    2 Ay Hediye
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Per-call cost info banner */}
                    <div className="bg-gradient-to-r from-red-600/10 via-purple-600/10 to-blue-600/10 border border-white/[0.08] rounded-2xl p-5">
                        <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-white/90 mb-2">Çağrı Başına Maliyet Formülü</p>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg font-mono">
                                        C = Twilio + TTS + LLM
                                    </span>
                                    <span className="text-white/30">=</span>
                                    <span className="bg-white/[0.06] text-white/60 px-2.5 py-1 rounded-lg">$0.01/dk</span>
                                    <span className="text-white/30">+</span>
                                    <span className="bg-white/[0.06] text-white/60 px-2.5 py-1 rounded-lg">$0.15/1K karakter</span>
                                    <span className="text-white/30">+</span>
                                    <span className="bg-white/[0.06] text-white/60 px-2.5 py-1 rounded-lg">~$0.02/çağrı</span>
                                </div>
                                <p className="text-xs text-white/30 mt-2">
                                    Ortalama 3 dakikalık çağrı maliyeti: <span className="text-white/60 font-semibold">$0.35 – $0.50</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Plan cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((plan, idx) => {
                            const planAction = getPlanAction(plan);
                            const displayPrice = getDisplayPrice(plan);
                            const isPro = plan.id === 'professional';
                            const gradients: Record<string, string> = {
                                starter: 'from-blue-600 to-indigo-700',
                                professional: 'from-red-600 to-pink-700',
                                enterprise: 'from-amber-500 to-orange-700',
                            };
                            const icons: Record<string, React.ReactNode> = {
                                starter: <Sparkles className="h-6 w-6" />,
                                professional: <Crown className="h-6 w-6" />,
                                enterprise: <Building2 className="h-6 w-6" />,
                            };

                            return (
                                <div
                                    key={plan.id}
                                    className={`relative rounded-2xl border transition-all duration-300 animate-fade-in-up ${
                                        isPro
                                            ? 'border-red-500/40 bg-white/[0.04] scale-[1.02] shadow-xl shadow-red-500/10'
                                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                                    }`}
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                >
                                    {isPro && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-full">
                                            En Popüler
                                        </div>
                                    )}

                                    <div className="p-6">
                                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradients[plan.id]} flex items-center justify-center text-white mb-4`}>
                                            {icons[plan.id]}
                                        </div>
                                        <h3 className="text-lg font-bold text-white">{plan.nameTr}</h3>
                                        <p className="text-white/40 text-sm mt-1">{plan.description}</p>

                                        <div className="mt-4 mb-1">
                                            <span className="text-3xl font-bold text-white">
                                                {displayPrice.price.toLocaleString('tr-TR')}
                                            </span>
                                            <span className="text-white/40 ml-1">₺{displayPrice.period}</span>
                                        </div>
                                        {displayPrice.note && (
                                            <p className="text-[11px] text-emerald-400/70 mb-4">{displayPrice.note}</p>
                                        )}
                                        {!displayPrice.note && <div className="mb-4" />}

                                        {/* Quota summary */}
                                        <div className="grid grid-cols-2 gap-3 mb-6">
                                            <div className="bg-white/[0.04] rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-white/30 uppercase tracking-wider">Dakika</p>
                                                <p className="text-sm font-bold text-white">{plan.includedMinutes}</p>
                                            </div>
                                            <div className="bg-white/[0.04] rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-white/30 uppercase tracking-wider">Çağrı</p>
                                                <p className="text-sm font-bold text-white">{plan.includedCalls.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* Features */}
                                        <div className="space-y-2 mb-6">
                                            {plan.features.map((f, i) => (
                                                <div key={i} className="flex items-start gap-2 text-sm">
                                                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                                                    <span className="text-white/60">{f}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Action button — contextual */}
                                        {planAction.variant === 'current' ? (
                                            <button className="w-full py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-sm font-medium cursor-default flex items-center justify-center gap-2">
                                                {planAction.icon}
                                                {planAction.label}
                                            </button>
                                        ) : planAction.variant === 'upgrade' ? (
                                            <button
                                                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20"
                                                onClick={planAction.action}
                                                disabled={planAction.disabled}
                                            >
                                                {planAction.icon}
                                                {planAction.label}
                                            </button>
                                        ) : (
                                            <button
                                                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                                    isPro && planAction.variant === 'select'
                                                        ? 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20'
                                                        : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white border border-white/[0.08]'
                                                }`}
                                                onClick={planAction.action}
                                                disabled={planAction.disabled}
                                            >
                                                {planAction.icon}
                                                {planAction.label}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ===================== USAGE TAB ===================== */}
            {activeTab === 'usage' && (
                <div className="space-y-6 animate-fade-in">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-[140px] rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <>
                            {/* Usage stat cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <StatCard
                                    icon={Phone}
                                    label="Toplam Çağrı"
                                    value={usage?.totalCalls || 0}
                                    suffix=""
                                    color="blue"
                                    percent={limits?.callPercent}
                                    limit={tierInfo?.includedCalls}
                                    limitLabel="çağrı"
                                />
                                <StatCard
                                    icon={Activity}
                                    label="Konuşma Süresi"
                                    value={usage?.totalMinutes || 0}
                                    suffix="dk"
                                    color="emerald"
                                    percent={limits?.usagePercent}
                                    limit={tierInfo?.includedMinutes}
                                    limitLabel="dk"
                                />
                                <StatCard
                                    icon={Volume2}
                                    label="TTS Karakter"
                                    value={usage?.ttsChars ? Math.round(usage.ttsChars / 1000) : 0}
                                    suffix="K"
                                    color="purple"
                                />
                                <StatCard
                                    icon={Zap}
                                    label="LLM Token"
                                    value={usage?.tokensUsed ? Math.round(usage.tokensUsed / 1000) : 0}
                                    suffix="K"
                                    color="amber"
                                />
                            </div>

                            {/* Cost breakdown */}
                            {cost && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Per-call breakdown */}
                                    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-6">
                                        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-red-400" />
                                            Ortalama Çağrı Maliyeti
                                        </h3>
                                        {perCallCost && (
                                            <div className="space-y-3">
                                                <CostRow label="Twilio (Telekom)" value={perCallCost.twilio} color="bg-blue-500" />
                                                <CostRow label="ElevenLabs (TTS)" value={perCallCost.tts} color="bg-purple-500" />
                                                <CostRow label="Groq/Gemini (LLM)" value={perCallCost.llm} color="bg-amber-500" />
                                                <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-white">Toplam / Çağrı</span>
                                                    <span className="text-lg font-bold text-red-400">${perCallCost.total}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Cost distribution bar */}
                                        {perCallCost && perCallCost.total > 0 && (
                                            <div className="mt-4">
                                                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Maliyet Dağılımı</p>
                                                <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.04]">
                                                    <div
                                                        className="bg-blue-500 transition-all"
                                                        style={{ width: `${(perCallCost.twilio / perCallCost.total) * 100}%` }}
                                                        title="Twilio"
                                                    />
                                                    <div
                                                        className="bg-purple-500 transition-all"
                                                        style={{ width: `${(perCallCost.tts / perCallCost.total) * 100}%` }}
                                                        title="TTS"
                                                    />
                                                    <div
                                                        className="bg-amber-500 transition-all"
                                                        style={{ width: `${(perCallCost.llm / perCallCost.total) * 100}%` }}
                                                        title="LLM"
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-1.5 text-[10px] text-white/30">
                                                    <span className="flex items-center gap-1">
                                                        <span className="h-2 w-2 rounded-full bg-blue-500" /> Twilio
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="h-2 w-2 rounded-full bg-purple-500" /> TTS
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="h-2 w-2 rounded-full bg-amber-500" /> LLM
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Monthly summary */}
                                    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-6">
                                        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-emerald-400" />
                                            Aylık Maliyet Özeti
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-white/50">Plan Ücreti</span>
                                                <span className="text-sm font-semibold text-white">${cost.baseCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-white/50">Altyapı Maliyeti</span>
                                                <span className="text-sm font-semibold text-red-400">-${cost.infraCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-white/50">├ Twilio</span>
                                                <span className="text-sm text-white/40">${cost.twilioCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-white/50">├ ElevenLabs TTS</span>
                                                <span className="text-sm text-white/40">${cost.ttsCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-white/50">└ LLM (Groq/Gemini)</span>
                                                <span className="text-sm text-white/40">${cost.llmCost}</span>
                                            </div>
                                            <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
                                                <span className="text-sm font-semibold text-white">Marj</span>
                                                <span className={`text-lg font-bold ${cost.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    ${cost.margin}
                                                </span>
                                            </div>
                                        </div>

                                        {cost.avgCostPerCall > 0 && (
                                            <div className="mt-4 bg-white/[0.04] rounded-xl px-4 py-3 flex items-center justify-between">
                                                <span className="text-xs text-white/40">Ortalama Çağrı Maliyeti</span>
                                                <span className="text-sm font-bold text-white">${cost.avgCostPerCall}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Usage warnings */}
                            {limits && (limits.minutesExceeded || limits.callsExceeded) && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-300">Kullanım Limiti Uyarısı</p>
                                        <p className="text-sm text-red-400/70 mt-1">
                                            {limits.minutesExceeded && `Dakika limitiniz aşıldı (${limits.usagePercent}%). `}
                                            {limits.callsExceeded && `Çağrı limitiniz aşıldı (${limits.callPercent}%). `}
                                            Daha yüksek bir plana geçmeyi düşünebilirsiniz.
                                        </p>
                                        <button
                                            onClick={() => setActiveTab('plans')}
                                            className="mt-3 inline-flex items-center gap-1 text-sm text-red-300 hover:text-red-200 transition-colors"
                                        >
                                            Planları İncele <ArrowRight className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ===================== PIPELINE TAB ===================== */}
            {activeTab === 'pipeline' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Pipeline Stats + Emergency Mode — Side by Side */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="xl:col-span-2">
                            <VoicePipelineStats
                                totalCalls={pipelineData?.summary?.totalCalls || 0}
                                avgPipelineMs={pipelineData?.summary?.avgPipelineMs || pipelineData?.latency?.avgPipelineMs || 0}
                                avgSttMs={pipelineData?.latency?.avgSttMs || 0}
                                avgLlmMs={pipelineData?.latency?.avgLlmMs || 0}
                                avgTtsMs={pipelineData?.latency?.avgTtsMs || 0}
                                totalTtsChars={pipelineData?.summary?.totalTtsChars || 0}
                                estimatedCostUsd={pipelineData?.summary?.estimatedCostUsd || 0}
                                emergencyModeActive={emergencyData?.active || false}
                                callsTrend={pipelineData?.summary?.callsTrend || 0}
                                isLoading={pipelineLoading}
                            />
                        </div>
                        <div>
                            <EmergencyModeCard
                                active={emergencyData?.active || false}
                                manualOverride={emergencyData?.manualOverride || false}
                                ttsCharsUsed={emergencyData?.ttsCharsUsed || 0}
                                ttsCharsBudget={emergencyData?.ttsCharsBudget || 500000}
                                percentUsed={emergencyData?.percentUsed || 0}
                                estimatedCostUsd={emergencyData?.estimatedCostUsd || 0}
                                recentAlerts={emergencyData?.recentAlerts || []}
                                onToggle={handleEmergencyToggle}
                                isLoading={pipelineLoading}
                            />
                        </div>
                    </div>

                    {/* Analytics Charts */}
                    <VoiceAnalyticsCharts
                        latencyData={pipelineData?.latency?.dailyBreakdown || []}
                        costData={pipelineData?.costTrend?.months || []}
                        providerData={pipelineData?.providers || { stt: {}, llm: {}, tts: {} }}
                        isLoading={pipelineLoading}
                    />
                </div>
            )}

            {/* ===================== INVOICES TAB ===================== */}
            {activeTab === 'invoices' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Fatura & Ödeme Geçmişi</h3>
                                <p className="text-sm text-white/50">Abonelik işlemleri ve ödeme kayıtları</p>
                            </div>
                            {subscription?.customerPortalUrl && (
                                <a
                                    href={subscription.customerPortalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors flex items-center gap-2"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Ödeme Portalı
                                </a>
                            )}
                        </div>

                        {invoicesLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                            </div>
                        ) : invoices.length === 0 ? (
                            <div className="text-center py-12">
                                <Wallet className="h-10 w-10 text-white/20 mx-auto mb-3" />
                                <p className="text-white/40 text-sm">Henüz ödeme kaydı bulunmuyor</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {invoices.map((activity) => {
                                    const ts = typeof activity.createdAt === 'string'
                                        ? new Date(activity.createdAt)
                                        : new Date(((activity.createdAt as any)?._seconds || (activity.createdAt as any)?.seconds || 0) * 1000);
                                    const typeMap: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
                                        subscription_created: { label: 'Abonelik Başlatıldı', color: 'text-green-400', icon: CheckCircle2 },
                                        subscription_updated: { label: 'Abonelik Güncellendi', color: 'text-blue-400', icon: RefreshCw },
                                        subscription_cancelled: { label: 'Abonelik İptal Edildi', color: 'text-orange-400', icon: XCircle },
                                        subscription_expired: { label: 'Abonelik Sona Erdi', color: 'text-red-400', icon: XCircle },
                                        subscription_paused: { label: 'Abonelik Duraklatıldı', color: 'text-yellow-400', icon: Info },
                                        subscription_resumed: { label: 'Abonelik Devam Ettirildi', color: 'text-green-400', icon: CheckCircle2 },
                                        subscription_unpaused: { label: 'Abonelik Devam Ettirildi', color: 'text-green-400', icon: CheckCircle2 },
                                        payment_success: { label: 'Ödeme Başarılı', color: 'text-emerald-400', icon: CheckCircle2 },
                                        payment_failed: { label: 'Ödeme Başarısız', color: 'text-red-400', icon: XCircle },
                                        payment_refunded: { label: 'İade Yapıldı', color: 'text-orange-400', icon: Repeat },
                                        settings_update: { label: 'Ayar Güncellendi', color: 'text-white/50', icon: Info },
                                    };
                                    const info = typeMap[activity.type] || { label: activity.type, color: 'text-white/50', icon: Info };
                                    const Icon = info.icon;

                                    return (
                                        <div
                                            key={activity.id}
                                            className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                                        >
                                            <div className={`p-2 rounded-lg bg-white/[0.06] ${info.color}`}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium ${info.color}`}>{info.label}</p>
                                                {activity.details?.planId && (
                                                    <p className="text-xs text-white/40 mt-0.5">
                                                        Plan: {String(activity.details.planId)}
                                                        {activity.details?.status && ` — ${String(activity.details.status)}`}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs text-white/40">
                                                    {ts.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                                <p className="text-xs text-white/30 mt-0.5">
                                                    {ts.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===================== CALCULATOR TAB (Admin Only) ===================== */}
            {activeTab === 'calculator' && (role === 'owner' || role === 'admin') && (
                <div className="space-y-6 animate-fade-in">
                    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-6">
                        <h3 className="text-lg font-bold text-white mb-1">Ölçeklendirme Hesaplayıcı</h3>
                        <p className="text-sm text-white/40 mb-6">Kullanıcı sayısı ve çağrı hacmine göre aylık maliyet tahmini.</p>

                        {/* Sliders */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <SliderInput
                                label="Kullanıcı Sayısı"
                                value={calcUsers}
                                onChange={setCalcUsers}
                                min={1}
                                max={500}
                                step={1}
                                suffix=""
                            />
                            <SliderInput
                                label="Kullanıcı Başına Çağrı/Ay"
                                value={calcCallsPerUser}
                                onChange={setCalcCallsPerUser}
                                min={10}
                                max={500}
                                step={10}
                                suffix=""
                            />
                            <SliderInput
                                label="Ortalama Çağrı Süresi"
                                value={calcAvgDuration}
                                onChange={setCalcAvgDuration}
                                min={1}
                                max={10}
                                step={1}
                                suffix="dk"
                            />
                        </div>

                        {/* Results */}
                        <div className="border-t border-white/[0.06] pt-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <CalcResult label="Toplam Çağrı" value={totalCalls.toLocaleString()} />
                                <CalcResult label="Toplam Dakika" value={totalMinutes.toLocaleString()} />
                                <CalcResult label="Çağrı Başına" value={`$${((calcInfra / totalCalls) || 0).toFixed(2)}`} />
                                <CalcResult label="Aylık Toplam" value={`$${calcInfra.toFixed(0)}`} highlight />
                            </div>

                            {/* Breakdown bars */}
                            <div className="space-y-3">
                                <CostBar label="Twilio" value={calcTwilio} total={calcInfra} color="bg-blue-500" />
                                <CostBar label="ElevenLabs TTS" value={calcTts} total={calcInfra} color="bg-purple-500" />
                                <CostBar label="LLM (Groq/Gemini)" value={calcLlm} total={calcInfra} color="bg-amber-500" />
                            </div>

                            {/* Plan recommendation */}
                            <div className="mt-6 bg-white/[0.04] rounded-xl p-4">
                                <p className="text-xs text-white/40 mb-2">Önerilen Plan</p>
                                <p className="text-sm font-semibold text-white">
                                    {totalMinutes <= 100 ? 'Başlangıç (₺990/ay)' :
                                     totalMinutes <= 500 ? 'Profesyonel (₺2.990/ay)' :
                                     'Kurumsal (₺7.990/ay)'}
                                </p>
                                <p className="text-xs text-white/30 mt-1">
                                    {totalMinutes <= 100 ? '100 dk dahil — küçük ekipler için ideal' :
                                     totalMinutes <= 500 ? '500 dk dahil — büyüyen işletmeler için' :
                                     '2.000 dk dahil — yüksek hacimli operasyonlar için'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Strategy cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <StrategyCard
                            step="01"
                            title="Erken Kullanıcı Analizi"
                            description="İlk 10 müşteride çağrı başına maliyeti izle, fiyatlandırmayı ayarla."
                            color="blue"
                        />
                        <StrategyCard
                            step="02"
                            title="TTS Optimizasyonu"
                            description="Kısa yanıtlar, cache kullanımı, karakter limiti ile TTS maliyetini %40 düşür."
                            color="purple"
                        />
                        <StrategyCard
                            step="03"
                            title="Rate Limiting"
                            description="Eşzamanlı çağrı limiti, dakika kotası, aşım bildirimleri."
                            color="amber"
                        />
                        <StrategyCard
                            step="04"
                            title="Self-Hosted (Gelecek)"
                            description="100+ kullanıcıda kendi TTS/LLM altyapısına geçiş, %60 maliyet düşüşü."
                            color="emerald"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================
// Sub-components
// =============================================

function StatCard({ icon: Icon, label, value, suffix, color, percent, limit, limitLabel }: {
    icon: typeof Phone;
    label: string;
    value: number;
    suffix: string;
    color: string;
    percent?: number;
    limit?: number;
    limitLabel?: string;
}) {
    const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', bar: 'bg-blue-500' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-500' },
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', bar: 'bg-purple-500' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-500' },
    };
    const c = colorMap[color] || colorMap.blue;
    const isOver = percent !== undefined && percent >= 100;

    return (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 hover:border-white/[0.15] transition-colors">
            <div className="flex items-center justify-between mb-3">
                <div className={`h-9 w-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${c.text}`} />
                </div>
                {percent !== undefined && (
                    <span className={`text-xs font-mono ${isOver ? 'text-red-400' : 'text-white/40'}`}>
                        {percent}%
                    </span>
                )}
            </div>
            <p className="text-2xl font-bold text-white">
                {value.toLocaleString()}{suffix && <span className="text-sm text-white/40 ml-1">{suffix}</span>}
            </p>
            <p className="text-xs text-white/40 mt-1">{label}</p>
            {limit !== undefined && (
                <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : c.bar}`}
                            style={{ width: `${Math.min(percent || 0, 100)}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-white/30 mt-1">
                        {limit.toLocaleString()} {limitLabel} dahil
                    </p>
                </div>
            )}
        </div>
    );
}

function CostRow({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="text-sm text-white/50">{label}</span>
            </div>
            <span className="text-sm font-semibold text-white">${value.toFixed(3)}</span>
        </div>
    );
}

function SliderInput({ label, value, onChange, min, max, step, suffix }: {
    label: string; value: number; onChange: (v: number) => void;
    min: number; max: number; step: number; suffix: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white/60">{label}</label>
                <span className="text-sm font-bold text-white">{value}{suffix}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-2 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-red-500
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:shadow-lg
                    [&::-webkit-slider-thumb]:shadow-red-500/30"
            />
            <div className="flex justify-between text-[10px] text-white/20 mt-1">
                <span>{min}{suffix}</span>
                <span>{max}{suffix}</span>
            </div>
        </div>
    );
}

function CalcResult({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`rounded-xl px-4 py-3 ${highlight ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/[0.04]'}`}>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${highlight ? 'text-red-400' : 'text-white'}`}>{value}</p>
        </div>
    );
}

function CostBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-32 shrink-0">{label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono text-white/60 w-20 text-right">${value.toFixed(0)} ({pct.toFixed(0)}%)</span>
        </div>
    );
}

function StrategyCard({ step, title, description, color }: {
    step: string; title: string; description: string; color: string;
}) {
    const colorMap: Record<string, string> = {
        blue: 'text-blue-400 bg-blue-500/10',
        purple: 'text-purple-400 bg-purple-500/10',
        amber: 'text-amber-400 bg-amber-500/10',
        emerald: 'text-emerald-400 bg-emerald-500/10',
    };
    const c = colorMap[color] || colorMap.blue;

    return (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 hover:border-white/[0.12] transition-colors">
            <div className="flex items-start gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c}`}>{step}</span>
                <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-white/40 mt-1">{description}</p>
                </div>
            </div>
        </div>
    );
}

// =============================================
// Skeleton
// =============================================

function BillingPageSkeleton() {
    return (
        <div className="min-h-screen bg-[#080810] p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            <div className="space-y-2">
                <div className="h-9 w-72 rounded-lg bg-white/[0.04] animate-pulse" />
                <div className="h-5 w-96 rounded-lg bg-white/[0.03] animate-pulse" />
            </div>
            <div className="h-10 w-96 rounded-xl bg-white/[0.03] animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[380px] rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
                ))}
            </div>
        </div>
    );
}

// =============================================
// Page
// =============================================

export default function BillingPage() {
    return (
        <Suspense fallback={<BillingPageSkeleton />}>
            <BillingPageContent />
        </Suspense>
    );
}

// =============================================
// Default Plans
// =============================================

const defaultPlans: SubscriptionPlan[] = [
    {
        id: 'starter',
        name: 'Starter',
        nameTr: 'Başlangıç',
        description: 'Girişimler ve küçük işletmeler için ideal.',
        priceTry: 990,
        priceYearlyTry: 9490,
        includedMinutes: 100,
        includedCalls: 500,
        maxConcurrentSessions: 2,
        features: [
            'AI Sesli Asistan',
            '100 dk/ay konuşma',
            '500 çağrı/ay',
            'Temel CRM',
            '2 eşzamanlı oturum',
        ],
    },
    {
        id: 'professional',
        name: 'Professional',
        nameTr: 'Profesyonel',
        description: 'Büyüyen işletmeler için gelişmiş özellikler.',
        priceTry: 2990,
        priceYearlyTry: 28690,
        includedMinutes: 500,
        includedCalls: 2000,
        maxConcurrentSessions: 5,
        features: [
            'AI Sesli Asistan (Gelişmiş)',
            '500 dk/ay konuşma',
            '2.000 çağrı/ay',
            'Gelişmiş CRM + Raporlama',
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
        priceYearlyTry: 76590,
        includedMinutes: 2000,
        includedCalls: 10000,
        maxConcurrentSessions: 20,
        features: [
            'Tüm Professional özellikler',
            '2.000 dk/ay konuşma',
            '10.000 çağrı/ay',
            'Özel AI modeli eğitimi',
            '20 eşzamanlı oturum',
            'API erişimi',
            'Öncelikli destek',
            'SLA garantisi',
        ],
    },
];
