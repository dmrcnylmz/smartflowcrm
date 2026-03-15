'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Check, Star, Zap, ArrowRight, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PLANS } from '@/lib/billing/lemonsqueezy';
import { formatPrice, getDefaultCurrency, SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/billing/currency';

// =============================================
// Types
// =============================================

type BillingInterval = 'monthly' | 'yearly';

// =============================================
// Pricing Page (Public — no auth required)
// =============================================

export default function PricingPage() {
    const t = useTranslations('pricing');
    const locale = useLocale();
    const [interval, setInterval] = useState<BillingInterval>('monthly');
    const [currency, setCurrency] = useState<SupportedCurrency>(getDefaultCurrency(locale));
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const planKeys = ['starter', 'professional', 'enterprise'] as const;

    const yearlySavings = (planId: string) => {
        const plan = PLANS[planId];
        if (!plan) return 0;
        const prices = plan.prices[currency];
        if (!prices) return 0;
        const monthlyTotal = prices.monthly * 12;
        const yearlyTotal = prices.yearly;
        return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
    };

    const faqItems = [
        { q: t('faq1q'), a: t('faq1a') },
        { q: t('faq2q'), a: t('faq2a') },
        { q: t('faq3q'), a: t('faq3a') },
        { q: t('faq4q'), a: t('faq4a') },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link href="/landing" className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-bold">Callception</span>
                        </Link>
                        <div className="flex items-center gap-3">
                            <Link href="/login">
                                <Button variant="ghost" className="text-slate-300 hover:text-white">
                                    {t('getStarted')}
                                </Button>
                            </Link>
                            <Link href="/onboarding">
                                <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/20">
                                    {t('getStarted')}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-12 px-4 sm:px-6 lg:px-8 text-center">
                <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20 px-4 py-1.5">
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    {t('title')}
                </Badge>
                <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-indigo-200 mb-4">
                    {t('title')}
                </h1>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
                    {t('subtitle')}
                </p>

                {/* Billing Interval Toggle */}
                <div className="flex items-center justify-center gap-3 mb-6">
                    <button
                        onClick={() => setInterval('monthly')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            interval === 'monthly'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                    >
                        {t('monthly')}
                    </button>
                    <button
                        onClick={() => setInterval('yearly')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            interval === 'yearly'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                    >
                        {t('yearly')}
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                            {t('savings', { percent: yearlySavings('professional') || 20 })}
                        </Badge>
                    </button>
                </div>

                {/* Currency Selector */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
                    {SUPPORTED_CURRENCIES.map((cur) => (
                        <button
                            key={cur}
                            onClick={() => setCurrency(cur)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                currency === cur
                                    ? 'bg-white/10 text-white border border-white/20'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                            }`}
                        >
                            {cur}
                        </button>
                    ))}
                </div>
            </section>

            {/* Plan Cards */}
            <section className="px-4 sm:px-6 lg:px-8 pb-20">
                <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    {planKeys.map((planId) => {
                        const plan = PLANS[planId];
                        if (!plan) return null;
                        const isProfessional = planId === 'professional';
                        const prices = plan.prices[currency];
                        const price = interval === 'yearly' ? prices.yearly : prices.monthly;
                        const savings = yearlySavings(planId);

                        return (
                            <div
                                key={planId}
                                className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                                    isProfessional
                                        ? 'border-blue-500/40 bg-gradient-to-b from-blue-500/10 to-transparent scale-[1.02] shadow-xl shadow-blue-500/10'
                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                            >
                                {isProfessional && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 px-3 py-1">
                                            <Star className="h-3 w-3 mr-1" />
                                            {t('mostPopular')}
                                        </Badge>
                                    </div>
                                )}

                                <div className="mb-4">
                                    <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                                    <p className="text-sm text-slate-400">{plan.description}</p>
                                </div>

                                <div className="mb-6">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold">
                                            {formatPrice(price, currency, locale)}
                                        </span>
                                        <span className="text-slate-400 text-sm">
                                            {interval === 'yearly' ? t('perYear') : t('perMonth')}
                                        </span>
                                    </div>
                                    {interval === 'yearly' && savings > 0 && (
                                        <p className="text-emerald-400 text-xs mt-1">
                                            {t('savings', { percent: savings })}
                                        </p>
                                    )}
                                </div>

                                <div className="mb-6 flex-1">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-medium">
                                        {t('includedFeatures')}
                                    </p>
                                    <ul className="space-y-2.5">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <Link href="/onboarding" className="block">
                                    <Button
                                        className={`w-full ${
                                            isProfessional
                                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/20'
                                                : 'bg-white/10 hover:bg-white/20 border border-white/10'
                                        }`}
                                    >
                                        {planId === 'enterprise' ? t('contactUs') : t('getStarted')}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        );
                    })}
                </div>

                {/* All plans include */}
                <p className="text-center text-sm text-slate-500 mt-8">
                    {t('allPlansInclude')}
                </p>
            </section>

            {/* FAQ Section */}
            <section className="px-4 sm:px-6 lg:px-8 pb-24">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold text-center mb-8">{t('faqTitle')}</h2>
                    <div className="space-y-3">
                        {faqItems.map((item, i) => (
                            <div
                                key={i}
                                className="border border-white/10 rounded-xl overflow-hidden"
                            >
                                <button
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
                                >
                                    <span className="text-sm font-medium">{item.q}</span>
                                    {openFaq === i ? (
                                        <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                    )}
                                </button>
                                {openFaq === i && (
                                    <div className="px-5 pb-4 text-sm text-slate-400">
                                        {item.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
