'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/firebase/auth-context';
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
const LatencyBreakdownChart = nextDynamic(() => import('@/components/dashboard/LatencyBreakdownChart'), {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded-3xl bg-muted" />,
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
    sipTrunkCost: number;
    voiceCost: number;
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
    voice: number;
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

// Super admin emails — only they see cost breakdowns
const SUPER_ADMIN_EMAILS = ['dmrcnylmz@gmail.com'];
const SUPER_ADMIN_DOMAIN = 'callception.com';

function isSuperAdminUser(email?: string | null): boolean {
    if (!email) return false;
    const e = email.toLowerCase();
    return e.endsWith(`@${SUPER_ADMIN_DOMAIN}`) || SUPER_ADMIN_EMAILS.includes(e);
}

function BillingPageContent() {
    const { user, role } = useAuth();
    const isSuperAdmin = isSuperAdminUser(user?.email);
    const searchParams = useSearchParams();
    const t = useTranslations('billing');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    const localeMap: Record<string, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };
    const dateLocaleStr = localeMap[locale] || 'tr-TR';
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
            setError(t('dataLoadError'));
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
                setError(data.error || t('checkoutError'));
            }
        } catch {
            setError(t('checkoutCreateError'));
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
                setError(null);
                alert(t('swapSuccess'));
            } else {
                setError(data.error || t('swapError'));
            }
        } catch {
            setError(t('swapCreateError'));
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

        if (!subscription?.isActive) {
            return {
                label: isCheckoutLoading ? t('redirecting') : t('selectPlan'),
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

        if (isSamePlan && isSameInterval) {
            return {
                label: t('currentPlanBadge'),
                icon: <CheckCircle2 className="h-4 w-4" />,
                action: () => {},
                disabled: true,
                variant: 'current',
            };
        }

        if (isSamePlan && !isSameInterval) {
            return {
                label: isSwapLoading ? t('switching') : (billingInterval === 'yearly' ? t('switchToYearly') : t('switchToMonthly')),
                icon: isSwapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />,
                action: () => handleSwap(plan.id, billingInterval),
                disabled: isLoading,
                variant: 'interval',
            };
        }

        if (targetOrder > currentOrder) {
            return {
                label: isSwapLoading ? t('upgrading') : t('upgrade'),
                icon: isSwapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronUp className="h-4 w-4" />,
                action: () => handleSwap(plan.id, billingInterval),
                disabled: isLoading,
                variant: 'upgrade',
            };
        }

        return {
            label: isSwapLoading ? t('switching') : t('swap'),
            icon: isSwapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />,
            action: () => handleSwap(plan.id, billingInterval),
            disabled: isLoading,
            variant: 'swap',
        };
    }

    function getDisplayPrice(plan: SubscriptionPlan): {
        price: number; period: string; note?: string;
        yearlyTotal?: number; monthlySaving?: number; savingPercent?: number;
    } {
        if (billingInterval === 'yearly') {
            const monthlyEquivalent = Math.round(plan.priceYearlyTry / 12);
            const monthlySaving = plan.priceTry - monthlyEquivalent;
            const savingPercent = Math.round((monthlySaving / plan.priceTry) * 100);
            return {
                price: monthlyEquivalent,
                period: t('perMonth'),
                note: t('billedYearly'),
                yearlyTotal: plan.priceYearlyTry,
                monthlySaving,
                savingPercent,
            };
        }
        return { price: plan.priceTry, period: t('perMonth') };
    }

    // Feature translation keys per plan
    const planFeatureKeys: Record<string, string[]> = {
        starter: ['featureAiAssistant', 'featureMinutes100', 'featureCalls500', 'featureBasicCrm', 'featureSessions2'],
        professional: ['featureAiAdvanced', 'featureMinutes500', 'featureCalls2000', 'featureAdvancedCrm', 'featureSessions5', 'featureKnowledgeBase', 'featureAutomation'],
        enterprise: ['featureAllProfessional', 'featureMinutes2000', 'featureCalls10000', 'featureCustomModel', 'featureSessions20', 'featureApi', 'featurePrioritySupport', 'featureSla'],
    };

    return (
        <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-8">
            {/* Payment result banners */}
            {paymentResult === 'success' && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <div>
                        <p className="font-semibold text-emerald-300">{t('paymentSuccessBanner')}</p>
                        <p className="text-sm text-emerald-400/70">
                            {paymentPlan ? t('planActive', { plan: paymentPlan.charAt(0).toUpperCase() + paymentPlan.slice(1) }) : t('subscriptionActive')}
                            {paymentInterval === 'yearly' && ` ${t('yearlyLabel')}`}
                        </p>
                    </div>
                </div>
            )}
            {paymentResult === 'failed' && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
                    <XCircle className="h-5 w-5 text-red-400" />
                    <p className="font-semibold text-red-300">{t('paymentFailedBanner')}</p>
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
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                                <Wallet className="h-5 w-5 text-primary-foreground" />
                            </div>
                            {t('title')}
                        </h1>
                        <p className="text-muted-foreground mt-2 text-sm">
                            {t('pageDesc')}
                        </p>
                    </div>

                    {subscription?.isActive && (
                        <div className="flex items-center gap-3">
                            <div className="bg-foreground/[0.04] border border-border rounded-2xl px-5 py-3 flex items-center gap-3">
                                <ShieldCheck className="h-6 w-6 text-emerald-400" />
                                <div>
                                    <p className="text-xs text-muted-foreground">{t('activePlan')}</p>
                                    <p className="text-lg font-bold text-foreground capitalize">
                                        {subscription.planId}
                                        <span className="text-xs font-normal text-muted-foreground ml-2">
                                            ({subscription.billingInterval === 'yearly' ? t('yearly') : t('monthly')})
                                        </span>
                                    </p>
                                </div>
                            </div>
                            {subscription.customerPortalUrl && (
                                <a
                                    href={subscription.customerPortalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2.5 rounded-xl bg-foreground/[0.06] border border-border text-sm text-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors flex items-center gap-2"
                                >
                                    <CreditCard className="h-4 w-4" />
                                    {t('manageSubscription')}
                                </a>
                            )}
                        </div>
                    )}
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 mt-6 bg-foreground/[0.03] border border-border/60 rounded-xl p-1 w-fit">
                    {[
                        { id: 'plans' as const, label: t('tabPlans'), icon: CreditCard },
                        { id: 'usage' as const, label: t('tabUsage'), icon: BarChart3 },
                        { id: 'invoices' as const, label: t('tabInvoices'), icon: Wallet },
                        ...(isSuperAdmin ? [
                            { id: 'pipeline' as const, label: t('tabPipeline'), icon: Volume2 },
                            { id: 'calculator' as const, label: t('tabCalculator'), icon: Calculator },
                        ] : []),
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeTab === tab.id
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                                    : 'text-muted-foreground hover:text-foreground/80 hover:bg-foreground/[0.04]'
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
                        {t('retry')}
                    </button>
                </div>
            )}

            {/* ===================== PLANS TAB ===================== */}
            {activeTab === 'plans' && (
                <div className="space-y-8 animate-fade-in">

                    {/* ── Active Subscription Detail Card ── */}
                    {subscription?.isActive && (
                        <div className="rounded-2xl border border-border bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <ShieldCheck className="h-5 w-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('activeSubscription')}</p>
                                        <p className="text-lg font-bold text-foreground capitalize">
                                            {subscription.planId}
                                            <span className="ml-2 text-xs font-normal bg-foreground/[0.06] px-2 py-0.5 rounded-full text-muted-foreground">
                                                {subscription.billingInterval === 'yearly' ? t('yearly') : t('monthly')}
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
                                            className="px-3 py-2 rounded-lg bg-foreground/[0.04] border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
                                        >
                                            <CreditCard className="h-3.5 w-3.5" />
                                            {t('paymentMethod')}
                                        </a>
                                    )}
                                    {subscription.customerPortalUrl && (
                                        <a
                                            href={subscription.customerPortalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2 rounded-lg bg-foreground/[0.04] border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            {t('customerPortal')}
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Subscription details row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-foreground/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t('statusLabel')}</p>
                                    <p className={`text-sm font-semibold mt-0.5 ${
                                        subscription.status === 'active' ? 'text-emerald-400' :
                                        subscription.status === 'cancelled' ? 'text-amber-400' :
                                        subscription.status === 'past_due' ? 'text-red-400' :
                                        'text-muted-foreground'
                                    }`}>
                                        {subscription.status === 'active' ? t('statusActive') :
                                         subscription.status === 'cancelled' ? t('statusCancelled') :
                                         subscription.status === 'past_due' ? t('statusPastDue') :
                                         subscription.status === 'on_trial' ? t('statusOnTrial') :
                                         subscription.status}
                                    </p>
                                </div>
                                <div className="bg-foreground/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t('renewalDate')}</p>
                                    <p className="text-sm font-semibold text-foreground mt-0.5">
                                        {subscription.currentPeriodEnd
                                            ? new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocaleStr, { day: 'numeric', month: 'long', year: 'numeric' })
                                            : '—'}
                                    </p>
                                </div>
                                <div className="bg-foreground/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t('billingCycle')}</p>
                                    <p className="text-sm font-semibold text-foreground mt-0.5">
                                        {subscription.billingInterval === 'yearly' ? t('yearly') : t('monthly')}
                                    </p>
                                </div>
                                <div className="bg-foreground/[0.03] rounded-xl px-4 py-3">
                                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t('paymentMethod')}</p>
                                    <p className="text-sm font-semibold text-foreground mt-0.5">
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
                                        <p className="text-sm font-semibold text-amber-300">{t('subscriptionCancelled')}</p>
                                        <p className="text-xs text-amber-400/70 mt-1">
                                            {t('cancelledAccessDesc', { date: new Date(subscription.endsAt).toLocaleDateString(dateLocaleStr, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Past due warning */}
                            {subscription.status === 'past_due' && (
                                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-300">{t('paymentOverdue')}</p>
                                        <p className="text-xs text-red-400/70 mt-1">
                                            {t('paymentOverdueDesc')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Billing Interval Toggle ── */}
                    <div className="flex items-center justify-center gap-3">
                        <div className="bg-foreground/[0.03] border border-border/60 rounded-xl p-1 flex items-center">
                            <button
                                onClick={() => setBillingInterval('monthly')}
                                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                                    billingInterval === 'monthly'
                                        ? 'bg-foreground/10 text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-muted-foreground'
                                }`}
                            >
                                {t('monthly')}
                            </button>
                            <button
                                onClick={() => setBillingInterval('yearly')}
                                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                    billingInterval === 'yearly'
                                        ? 'bg-foreground/10 text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-muted-foreground'
                                }`}
                            >
                                {t('yearly')}
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {t('twoMonthsFree')}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Per-call cost info banner — admin/owner only */}
                    {isSuperAdmin && (
                    <div className="bg-gradient-to-r from-primary/10 via-chart-3/10 to-chart-1/10 border border-border rounded-2xl p-5">
                        <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-foreground/90 mb-2">{t('costPerCallFormula')}</p>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg font-mono">
                                        C = Twilio + TTS + LLM
                                    </span>
                                    <span className="text-muted-foreground/70">=</span>
                                    <span className="bg-foreground/[0.06] text-muted-foreground px-2.5 py-1 rounded-lg">{t('costPerMin')}</span>
                                    <span className="text-muted-foreground/70">+</span>
                                    <span className="bg-foreground/[0.06] text-muted-foreground px-2.5 py-1 rounded-lg">{t('costPerKChars')}</span>
                                    <span className="text-muted-foreground/70">+</span>
                                    <span className="bg-foreground/[0.06] text-muted-foreground px-2.5 py-1 rounded-lg">{t('costPerCallFormulaPart')}</span>
                                </div>
                                <p className="text-xs text-muted-foreground/70 mt-2">
                                    {t('avgCallCostNote')} <span className="text-muted-foreground font-semibold">$0.35 – $0.50</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Plan cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((plan, idx) => {
                            const planAction = getPlanAction(plan);
                            const displayPrice = getDisplayPrice(plan);
                            const isPro = plan.id === 'professional';
                            const gradients: Record<string, string> = {
                                starter: 'from-blue-600 to-indigo-700',
                                professional: 'from-primary to-primary/80',
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
                                            ? 'border-primary/40 bg-foreground/[0.04] scale-[1.02] shadow-xl shadow-primary/10'
                                            : 'border-border bg-foreground/[0.02] hover:border-border'
                                    }`}
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                >
                                    {isPro && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-full">
                                            {t('mostPopular')}
                                        </div>
                                    )}

                                    <div className="p-6">
                                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradients[plan.id]} flex items-center justify-center text-white mb-4`}>
                                            {icons[plan.id]}
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">{t(`${plan.id}Name`)}</h3>
                                        <p className="text-muted-foreground text-sm mt-1">{t(`${plan.id}Desc`)}</p>

                                        <div className="mt-4 mb-1">
                                            {billingInterval === 'yearly' && displayPrice.yearlyTotal ? (
                                                <>
                                                    <span className="text-3xl font-bold text-foreground">
                                                        {displayPrice.yearlyTotal.toLocaleString(dateLocaleStr)}
                                                    </span>
                                                    <span className="text-muted-foreground ml-1">₺{t('perYear')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-3xl font-bold text-foreground">
                                                        {displayPrice.price.toLocaleString(dateLocaleStr)}
                                                    </span>
                                                    <span className="text-muted-foreground ml-1">₺{displayPrice.period}</span>
                                                </>
                                            )}
                                        </div>
                                        {billingInterval === 'yearly' && displayPrice.yearlyTotal ? (
                                            <div className="mb-4 space-y-1">
                                                <p className="text-xs text-muted-foreground">
                                                    {t('monthlyPrice', { price: displayPrice.price.toLocaleString(dateLocaleStr) })}
                                                    <span className="text-muted-foreground/70 mx-1">·</span>
                                                    <span className="line-through text-muted-foreground/70">{plan.priceTry.toLocaleString(dateLocaleStr)} ₺</span>
                                                </p>
                                                {displayPrice.savingPercent && displayPrice.savingPercent > 0 && (
                                                    <p className="text-[11px] text-emerald-400 font-semibold">
                                                        {t('savingPercent', { percent: displayPrice.savingPercent, saving: displayPrice.monthlySaving?.toLocaleString(dateLocaleStr) })}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mb-4" />
                                        )}

                                        {/* Quota summary */}
                                        <div className="grid grid-cols-2 gap-3 mb-6">
                                            <div className="bg-foreground/[0.04] rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t('minutes')}</p>
                                                <p className="text-sm font-bold text-foreground">{plan.includedMinutes}</p>
                                            </div>
                                            <div className="bg-foreground/[0.04] rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t('calls')}</p>
                                                <p className="text-sm font-bold text-foreground">{plan.includedCalls.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* Features */}
                                        <div className="space-y-2 mb-6">
                                            {(planFeatureKeys[plan.id] || []).map((key, i) => (
                                                <div key={i} className="flex items-start gap-2 text-sm">
                                                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                                                    <span className="text-muted-foreground">{t(key)}</span>
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
                                                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
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
                                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                                                        : 'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10 hover:text-foreground border border-border'
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
                                <div key={i} className="h-[140px] rounded-2xl bg-foreground/[0.03] border border-border/60 animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <>
                            {/* Usage stat cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <StatCard
                                    icon={Phone}
                                    label={t('totalCalls')}
                                    value={usage?.totalCalls || 0}
                                    suffix=""
                                    color="blue"
                                    percent={limits?.callPercent}
                                    limit={tierInfo?.includedCalls}
                                    limitLabel={t('calls').toLowerCase()}
                                    includedLabel={t('included')}
                                />
                                <StatCard
                                    icon={Activity}
                                    label={t('callDuration')}
                                    value={usage?.totalMinutes || 0}
                                    suffix={t('dk')}
                                    color="emerald"
                                    percent={limits?.usagePercent}
                                    limit={tierInfo?.includedMinutes}
                                    limitLabel={t('dk')}
                                    includedLabel={t('included')}
                                />
                                <StatCard
                                    icon={Volume2}
                                    label={t('ttsChars')}
                                    value={usage?.ttsChars ? Math.round(usage.ttsChars / 1000) : 0}
                                    suffix="K"
                                    color="purple"
                                />
                                <StatCard
                                    icon={Zap}
                                    label={t('llmTokens')}
                                    value={usage?.tokensUsed ? Math.round(usage.tokensUsed / 1000) : 0}
                                    suffix="K"
                                    color="amber"
                                />
                            </div>

                            {/* Cost breakdown — admin/owner only */}
                            {cost && isSuperAdmin && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Per-call breakdown */}
                                    <div className="rounded-2xl bg-foreground/[0.02] border border-border p-6">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-primary" />
                                            {t('avgCallCost')}
                                        </h3>
                                        {perCallCost && (
                                            <div className="space-y-3">
                                                <CostRow label={t('voiceTelecom')} value={perCallCost.voice} color="bg-blue-500" />
                                                <CostRow label="Cartesia (TTS)" value={perCallCost.tts} color="bg-purple-500" />
                                                <CostRow label="Groq/Gemini (LLM)" value={perCallCost.llm} color="bg-amber-500" />
                                                <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-foreground">{t('totalPerCall')}</span>
                                                    <span className="text-lg font-bold text-primary">${perCallCost.total}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Cost distribution bar */}
                                        {perCallCost && perCallCost.total > 0 && (
                                            <div className="mt-4">
                                                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-2">{t('costDistribution')}</p>
                                                <div className="flex h-3 rounded-full overflow-hidden bg-foreground/[0.04]">
                                                    <div
                                                        className="bg-blue-500 transition-all"
                                                        style={{ width: `${(perCallCost.voice / perCallCost.total) * 100}%` }}
                                                        title={t('voiceLabel')}
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
                                                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground/70">
                                                    <span className="flex items-center gap-1">
                                                        <span className="h-2 w-2 rounded-full bg-blue-500" /> {t('voiceLabel')}
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
                                    <div className="rounded-2xl bg-foreground/[0.02] border border-border p-6">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-emerald-400" />
                                            {t('monthlyCostSummary')}
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-muted-foreground">{t('planFee')}</span>
                                                <span className="text-sm font-semibold text-foreground">${cost.baseCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-muted-foreground">{t('infraCost')}</span>
                                                <span className="text-sm font-semibold text-red-400">-${cost.infraCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-muted-foreground">├ Twilio</span>
                                                <span className="text-sm text-muted-foreground">${cost.twilioCost}</span>
                                            </div>
                                            {cost.sipTrunkCost > 0 && (
                                                <div className="flex items-center justify-between py-2">
                                                    <span className="text-sm text-muted-foreground">├ SIP Trunk</span>
                                                    <span className="text-sm text-muted-foreground">${cost.sipTrunkCost}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-muted-foreground">├ Cartesia TTS</span>
                                                <span className="text-sm text-muted-foreground">${cost.ttsCost}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-sm text-muted-foreground">└ LLM (Groq/Gemini)</span>
                                                <span className="text-sm text-muted-foreground">${cost.llmCost}</span>
                                            </div>
                                            <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                                                <span className="text-sm font-semibold text-foreground">{t('margin')}</span>
                                                <span className={`text-lg font-bold ${cost.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    ${cost.margin}
                                                </span>
                                            </div>
                                        </div>

                                        {cost.avgCostPerCall > 0 && (
                                            <div className="mt-4 bg-foreground/[0.04] rounded-xl px-4 py-3 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">{t('avgCallCost')}</span>
                                                <span className="text-sm font-bold text-foreground">${cost.avgCostPerCall}</span>
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
                                        <p className="text-sm font-semibold text-red-300">{t('usageLimitWarning')}</p>
                                        <p className="text-sm text-red-400/70 mt-1">
                                            {limits.minutesExceeded && t('minutesExceeded', { percent: limits.usagePercent })}
                                            {limits.callsExceeded && t('callsExceeded', { percent: limits.callPercent })}
                                            {t('considerUpgrade')}
                                        </p>
                                        <button
                                            onClick={() => setActiveTab('plans')}
                                            className="mt-3 inline-flex items-center gap-1 text-sm text-red-300 hover:text-red-200 transition-colors"
                                        >
                                            {t('viewPlans')} <ArrowRight className="h-3 w-3" />
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

                    {/* Pipeline Latency Breakdown (TTFT + Component Timing) */}
                    <div className="mt-6">
                        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                            <Activity className="h-5 w-5 text-pink-400" />
                            {t('pipelinePerformance')}
                        </h3>
                        <LatencyBreakdownChart days={7} />
                    </div>
                </div>
            )}

            {/* ===================== INVOICES TAB ===================== */}
            {activeTab === 'invoices' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="rounded-2xl bg-foreground/[0.02] border border-border p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-foreground mb-1">{t('invoiceHistory')}</h3>
                                <p className="text-sm text-muted-foreground">{t('invoiceHistoryDesc')}</p>
                            </div>
                            {subscription?.customerPortalUrl && (
                                <a
                                    href={subscription.customerPortalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 rounded-xl bg-foreground/[0.06] border border-border text-sm text-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors flex items-center gap-2"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    {t('paymentPortal')}
                                </a>
                            )}
                        </div>

                        {invoicesLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : invoices.length === 0 ? (
                            <div className="text-center py-12">
                                <Wallet className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm">{t('noPaymentRecords')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {invoices.map((activity) => {
                                    const ts = typeof activity.createdAt === 'string'
                                        ? new Date(activity.createdAt)
                                        : new Date(((activity.createdAt as { _seconds?: number; seconds?: number })?._seconds || (activity.createdAt as { seconds?: number })?.seconds || 0) * 1000);
                                    const typeMap: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
                                        subscription_created: { label: t('subscriptionCreated'), color: 'text-green-400', icon: CheckCircle2 },
                                        subscription_updated: { label: t('subscriptionUpdated'), color: 'text-blue-400', icon: RefreshCw },
                                        subscription_cancelled: { label: t('subscriptionCancelledEvent'), color: 'text-orange-400', icon: XCircle },
                                        subscription_expired: { label: t('subscriptionExpired'), color: 'text-red-400', icon: XCircle },
                                        subscription_paused: { label: t('subscriptionPaused'), color: 'text-yellow-400', icon: Info },
                                        subscription_resumed: { label: t('subscriptionResumed'), color: 'text-green-400', icon: CheckCircle2 },
                                        subscription_unpaused: { label: t('subscriptionResumed'), color: 'text-green-400', icon: CheckCircle2 },
                                        payment_success: { label: t('paymentSuccess'), color: 'text-emerald-400', icon: CheckCircle2 },
                                        payment_failed: { label: t('paymentFailed'), color: 'text-red-400', icon: XCircle },
                                        payment_refunded: { label: t('paymentRefunded'), color: 'text-orange-400', icon: Repeat },
                                        settings_update: { label: t('settingsUpdate'), color: 'text-muted-foreground', icon: Info },
                                    };
                                    const info = typeMap[activity.type] || { label: activity.type, color: 'text-muted-foreground', icon: Info };
                                    const Icon = info.icon;

                                    return (
                                        <div
                                            key={activity.id}
                                            className="flex items-center gap-4 p-4 rounded-xl bg-foreground/[0.02] border border-border/60 hover:bg-foreground/[0.04] transition-colors"
                                        >
                                            <div className={`p-2 rounded-lg bg-foreground/[0.06] ${info.color}`}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium ${info.color}`}>{info.label}</p>
                                                {!!activity.details?.planId && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        Plan: {String(activity.details.planId)}
                                                        {!!activity.details?.status && ` — ${String(activity.details.status)}`}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs text-muted-foreground">
                                                    {ts.toLocaleDateString(dateLocaleStr, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                                <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                    {ts.toLocaleTimeString(dateLocaleStr, { hour: '2-digit', minute: '2-digit' })}
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
            {activeTab === 'calculator' && isSuperAdmin && (
                <div className="space-y-6 animate-fade-in">
                    <div className="rounded-2xl bg-foreground/[0.02] border border-border p-6">
                        <h3 className="text-lg font-bold text-foreground mb-1">{t('scalingCalculator')}</h3>
                        <p className="text-sm text-muted-foreground mb-6">{t('scalingCalculatorDesc')}</p>

                        {/* Sliders */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <SliderInput
                                label={t('userCount')}
                                value={calcUsers}
                                onChange={setCalcUsers}
                                min={1}
                                max={500}
                                step={1}
                                suffix=""
                            />
                            <SliderInput
                                label={t('callsPerUser')}
                                value={calcCallsPerUser}
                                onChange={setCalcCallsPerUser}
                                min={10}
                                max={500}
                                step={10}
                                suffix=""
                            />
                            <SliderInput
                                label={t('avgCallDuration')}
                                value={calcAvgDuration}
                                onChange={setCalcAvgDuration}
                                min={1}
                                max={10}
                                step={1}
                                suffix={t('dk')}
                            />
                        </div>

                        {/* Results */}
                        <div className="border-t border-border/60 pt-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <CalcResult label={t('totalCallsCalc')} value={totalCalls.toLocaleString()} />
                                <CalcResult label={t('totalMinutes')} value={totalMinutes.toLocaleString()} />
                                <CalcResult label={t('perCall')} value={`$${((calcInfra / totalCalls) || 0).toFixed(2)}`} />
                                <CalcResult label={t('monthlyTotal')} value={`$${calcInfra.toFixed(0)}`} highlight />
                            </div>

                            {/* Breakdown bars */}
                            <div className="space-y-3">
                                <CostBar label="Twilio" value={calcTwilio} total={calcInfra} color="bg-blue-500" />
                                <CostBar label="Cartesia TTS" value={calcTts} total={calcInfra} color="bg-purple-500" />
                                <CostBar label="LLM (Groq/Gemini)" value={calcLlm} total={calcInfra} color="bg-amber-500" />
                            </div>

                            {/* Plan recommendation */}
                            <div className="mt-6 bg-foreground/[0.04] rounded-xl p-4">
                                <p className="text-xs text-muted-foreground mb-2">{t('recommendedPlan')}</p>
                                <p className="text-sm font-semibold text-foreground">
                                    {totalMinutes <= 100 ? t('starterPlanRec') :
                                     totalMinutes <= 500 ? t('professionalPlanRec') :
                                     t('enterprisePlanRec')}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    {totalMinutes <= 100 ? t('starterPlanRecDesc') :
                                     totalMinutes <= 500 ? t('professionalPlanRecDesc') :
                                     t('enterprisePlanRecDesc')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Strategy cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <StrategyCard
                            step="01"
                            title={t('strategy01Title')}
                            description={t('strategy01Desc')}
                            color="blue"
                        />
                        <StrategyCard
                            step="02"
                            title={t('strategy02Title')}
                            description={t('strategy02Desc')}
                            color="purple"
                        />
                        <StrategyCard
                            step="03"
                            title={t('strategy03Title')}
                            description={t('strategy03Desc')}
                            color="amber"
                        />
                        <StrategyCard
                            step="04"
                            title={t('strategy04Title')}
                            description={t('strategy04Desc')}
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

function StatCard({ icon: Icon, label, value, suffix, color, percent, limit, limitLabel, includedLabel }: {
    icon: typeof Phone;
    label: string;
    value: number;
    suffix: string;
    color: string;
    percent?: number;
    limit?: number;
    limitLabel?: string;
    includedLabel?: string;
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
        <div className="rounded-2xl bg-foreground/[0.02] border border-border p-5 hover:border-border transition-colors">
            <div className="flex items-center justify-between mb-3">
                <div className={`h-9 w-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${c.text}`} />
                </div>
                {percent !== undefined && (
                    <span className={`text-xs font-mono ${isOver ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {percent}%
                    </span>
                )}
            </div>
            <p className="text-2xl font-bold text-foreground">
                {value.toLocaleString()}{suffix && <span className="text-sm text-muted-foreground ml-1">{suffix}</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
            {limit !== undefined && (
                <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : c.bar}`}
                            style={{ width: `${Math.min(percent || 0, 100)}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {limit.toLocaleString()} {limitLabel} {includedLabel}
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
                <span className="text-sm text-muted-foreground">{label}</span>
            </div>
            <span className="text-sm font-semibold text-foreground">${value.toFixed(3)}</span>
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
                <label className="text-sm text-muted-foreground">{label}</label>
                <span className="text-sm font-bold text-foreground">{value}{suffix}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-2 bg-foreground/[0.06] rounded-full appearance-none cursor-pointer accent-primary
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-lg
                    [&::-webkit-slider-thumb]:shadow-primary/30"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-1">
                <span>{min}{suffix}</span>
                <span>{max}{suffix}</span>
            </div>
        </div>
    );
}

function CalcResult({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`rounded-xl px-4 py-3 ${highlight ? 'bg-primary/10 border border-primary/20' : 'bg-foreground/[0.04]'}`}>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
        </div>
    );
}

function CostBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-foreground/[0.04] overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-20 text-right">${value.toFixed(0)} ({pct.toFixed(0)}%)</span>
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
        <div className="rounded-2xl bg-foreground/[0.02] border border-border p-5 hover:border-border transition-colors">
            <div className="flex items-start gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c}`}>{step}</span>
                <div>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
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
        <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-8">
            <div className="space-y-2">
                <div className="h-9 w-72 rounded-lg bg-foreground/[0.04] animate-pulse" />
                <div className="h-5 w-96 rounded-lg bg-foreground/[0.03] animate-pulse" />
            </div>
            <div className="h-10 w-96 rounded-xl bg-foreground/[0.03] animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[380px] rounded-2xl bg-foreground/[0.03] border border-border/60 animate-pulse" />
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
