'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Phone, Bot, Calendar, BarChart3, Shield, Zap,
    CheckCircle2, ArrowRight, Play, Star, ChevronDown,
    Building2, Headphones, Clock, Globe2, MessageSquare,
    Sparkles, Users, TrendingUp, Award, Menu, X
} from 'lucide-react';

// =============================================
// Scroll Animation Hook
// =============================================
function AnimateOnScroll({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(entry.target);
                }
            },
            { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
}

// =============================================
// Lead Capture Form
// =============================================

function LeadCaptureForm() {
    const t = useTranslations('landing');
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;

        setStatus('loading');
        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), source: 'landing_cta' }),
            });

            if (res.ok) {
                setStatus('success');
                setEmail('');
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    };

    if (status === 'success') {
        return (
            <div className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 max-w-md mx-auto">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">{t('leadForm.success')}</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto mb-4">
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('leadForm.placeholder')}
                required
                className="w-full sm:flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
            />
            <Button
                type="submit"
                disabled={status === 'loading'}
                className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 px-6 py-3 rounded-xl whitespace-nowrap"
            >
                {status === 'loading' ? t('leadForm.sending') : t('leadForm.submit')}
            </Button>
            {status === 'error' && (
                <p className="text-xs text-red-400 w-full text-center sm:text-left">{t('leadForm.error')}</p>
            )}
        </form>
    );
}

// =============================================
// Landing Page
// =============================================

export default function LandingPage() {
    const t = useTranslations('landing');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const features = [
        {
            icon: Bot,
            titleKey: 'features.aiAssistantTitle' as const,
            descKey: 'features.aiAssistantDesc' as const,
            gradient: 'from-blue-500 to-indigo-600',
        },
        {
            icon: Calendar,
            titleKey: 'features.appointmentTitle' as const,
            descKey: 'features.appointmentDesc' as const,
            gradient: 'from-purple-500 to-pink-600',
        },
        {
            icon: MessageSquare,
            titleKey: 'features.complaintTitle' as const,
            descKey: 'features.complaintDesc' as const,
            gradient: 'from-amber-500 to-orange-600',
        },
        {
            icon: BarChart3,
            titleKey: 'features.reportingTitle' as const,
            descKey: 'features.reportingDesc' as const,
            gradient: 'from-green-500 to-emerald-600',
        },
        {
            icon: Users,
            titleKey: 'features.crmTitle' as const,
            descKey: 'features.crmDesc' as const,
            gradient: 'from-cyan-500 to-blue-600',
        },
        {
            icon: Shield,
            titleKey: 'features.securityTitle' as const,
            descKey: 'features.securityDesc' as const,
            gradient: 'from-rose-500 to-red-600',
        },
    ];

    const steps = [
        { titleKey: 'howItWorks.step1Title' as const, descKey: 'howItWorks.step1Desc' as const },
        { titleKey: 'howItWorks.step2Title' as const, descKey: 'howItWorks.step2Desc' as const },
        { titleKey: 'howItWorks.step3Title' as const, descKey: 'howItWorks.step3Desc' as const },
    ];

    const pricingPlans = [
        {
            nameKey: 'pricing.starterName' as const,
            price: '990',
            icon: Sparkles,
            gradient: 'from-blue-500 to-indigo-600',
            popular: false,
            featureKeys: [
                'pricing.starterFeature1' as const,
                'pricing.starterFeature2' as const,
                'pricing.starterFeature3' as const,
                'pricing.starterFeature4' as const,
                'pricing.starterFeature5' as const,
                'pricing.starterFeature6' as const,
            ],
        },
        {
            nameKey: 'pricing.proName' as const,
            price: '2.990',
            icon: Award,
            gradient: 'from-purple-500 to-pink-600',
            popular: true,
            featureKeys: [
                'pricing.proFeature1' as const,
                'pricing.proFeature2' as const,
                'pricing.proFeature3' as const,
                'pricing.proFeature4' as const,
                'pricing.proFeature5' as const,
                'pricing.proFeature6' as const,
                'pricing.proFeature7' as const,
            ],
        },
        {
            nameKey: 'pricing.enterpriseName' as const,
            price: '7.990',
            icon: Building2,
            gradient: 'from-amber-500 to-orange-600',
            popular: false,
            featureKeys: [
                'pricing.enterpriseFeature1' as const,
                'pricing.enterpriseFeature2' as const,
                'pricing.enterpriseFeature3' as const,
                'pricing.enterpriseFeature4' as const,
                'pricing.enterpriseFeature5' as const,
                'pricing.enterpriseFeature6' as const,
                'pricing.enterpriseFeature7' as const,
            ],
        },
    ];

    const testimonials = [
        {
            name: 'Ahmet Y\u0131lmaz',
            roleKey: 'testimonials.testimonial1Role' as const,
            textKey: 'testimonials.testimonial1Text' as const,
        },
        {
            name: 'Zeynep Kara',
            roleKey: 'testimonials.testimonial2Role' as const,
            textKey: 'testimonials.testimonial2Text' as const,
        },
        {
            name: 'Murat Demir',
            roleKey: 'testimonials.testimonial3Role' as const,
            textKey: 'testimonials.testimonial3Text' as const,
        },
    ];

    const faqs = [
        { qKey: 'faq.q1' as const, aKey: 'faq.a1' as const },
        { qKey: 'faq.q2' as const, aKey: 'faq.a2' as const },
        { qKey: 'faq.q3' as const, aKey: 'faq.a3' as const },
        { qKey: 'faq.q4' as const, aKey: 'faq.a4' as const },
        { qKey: 'faq.q5' as const, aKey: 'faq.a5' as const },
        { qKey: 'faq.q6' as const, aKey: 'faq.a6' as const },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-bold">Callception</span>
                        </div>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-sm text-slate-300 hover:text-white transition-colors">{t('nav.features')}</a>
                            <a href="#how-it-works" className="text-sm text-slate-300 hover:text-white transition-colors">{t('nav.howItWorks')}</a>
                            <a href="#pricing" className="text-sm text-slate-300 hover:text-white transition-colors">{t('nav.pricing')}</a>
                            <Link href="/pricing" className="text-sm text-slate-300 hover:text-white transition-colors">{t('nav.pricingPage')}</Link>
                            <a href="#faq" className="text-sm text-slate-300 hover:text-white transition-colors">{t('nav.faq')}</a>
                        </div>

                        <div className="hidden md:flex items-center gap-3">
                            <Link href="/login">
                                <Button variant="ghost" className="text-slate-300 hover:text-white">
                                    {t('nav.login')}
                                </Button>
                            </Link>
                            <Link href="/onboarding">
                                <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/20">
                                    {t('nav.freeTrial')}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>

                        {/* Mobile Menu Toggle */}
                        <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <div className="md:hidden bg-slate-900 border-t border-white/5 px-4 py-6 space-y-4">
                        <a href="#features" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>{t('nav.features')}</a>
                        <a href="#how-it-works" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>{t('nav.howItWorks')}</a>
                        <a href="#pricing" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>{t('nav.pricing')}</a>
                        <Link href="/pricing" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>{t('nav.pricingPage')}</Link>
                        <a href="#faq" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>{t('nav.faq')}</a>
                        <div className="pt-4 space-y-3 border-t border-white/10">
                            <Link href="/login" className="block">
                                <Button variant="outline" className="w-full border-white/20">{t('nav.login')}</Button>
                            </Link>
                            <Link href="/onboarding" className="block">
                                <Button className="w-full bg-gradient-to-r from-blue-500 to-indigo-600">{t('nav.freeTrial')}</Button>
                            </Link>
                        </div>
                    </div>
                )}
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15),transparent_70%)]" />
                <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />

                <div className="max-w-5xl mx-auto text-center relative z-10">
                    <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20 px-4 py-1.5 text-sm">
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        {t('hero.badge')}
                    </Badge>

                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
                        {t('hero.titleBefore')}{' '}
                        <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                            {t('hero.titleHighlight')}
                        </span>{' '}
                        {t('hero.titleAfter')}
                    </h1>

                    <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
                        {t('hero.description')}
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/onboarding">
                            <Button size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 text-lg px-8 py-6 rounded-xl">
                                {t('hero.ctaStart')}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                        <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 text-lg px-8 py-6 rounded-xl">
                            <Play className="mr-2 h-5 w-5" />
                            {t('hero.ctaDemo')}
                        </Button>
                    </div>

                    {/* Trust badges */}
                    <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span>{t('trust.kvkk')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Globe2 className="h-4 w-4" />
                            <span>{t('trust.location')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>{t('trust.active247')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Headphones className="h-4 w-4" />
                            <span>{t('trust.naturalLanguage')}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Bar */}
            <section className="py-12 border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[
                            { value: '%95', label: t('stats.callRate'), icon: Phone },
                            { value: '< 2sn', label: t('stats.responseTime'), icon: Zap },
                            { value: '7/24', label: t('stats.nonstopService'), icon: Clock },
                            { value: '%40', label: t('stats.costSaving'), icon: TrendingUp },
                        ].map((stat, i) => (
                            <div key={i} className="space-y-2">
                                <stat.icon className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                                    {stat.value}
                                </div>
                                <div className="text-sm text-slate-400">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">{t('features.badge')}</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">{t('features.title')}</h2>
                        <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
                            {t('features.subtitle')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, i) => (
                            <AnimateOnScroll key={i} delay={i * 100}>
                                <Card className="bg-white/[0.03] border-white/5 hover:border-white/10 transition-all hover:bg-white/[0.05] group rounded-2xl h-full">
                                    <CardContent className="p-6">
                                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                            <feature.icon className="h-6 w-6 text-white" />
                                        </div>
                                        <h3 className="text-lg font-semibold mb-2">{t(feature.titleKey)}</h3>
                                        <p className="text-sm text-slate-400 leading-relaxed">{t(feature.descKey)}</p>
                                    </CardContent>
                                </Card>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 bg-white/[0.02] border-y border-white/5">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <Badge className="mb-4 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">{t('howItWorks.badge')}</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">{t('howItWorks.title')}</h2>
                        <p className="mt-4 text-slate-400">{t('howItWorks.subtitle')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {steps.map((step, i) => (
                            <AnimateOnScroll key={i} delay={i * 150}>
                                <div className="relative text-center">
                                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
                                        <span className="text-2xl font-bold text-blue-400">{i + 1}</span>
                                    </div>
                                    <h3 className="text-xl font-semibold mb-3">{t(step.titleKey)}</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">{t(step.descKey)}</p>
                                    {i < 2 && (
                                        <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] w-[calc(100%-80px)] border-t-2 border-dashed border-blue-500/20" />
                                    )}
                                </div>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">{t('pricing.badge')}</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">{t('pricing.title')}</h2>
                        <p className="mt-4 text-slate-400">{t('pricing.subtitle')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {pricingPlans.map((plan, i) => (
                            <AnimateOnScroll key={i} delay={i * 120}>
                            <Card
                                key={i}
                                className={`rounded-2xl overflow-hidden transition-all hover:scale-[1.02] ${plan.popular
                                    ? 'bg-gradient-to-b from-blue-500/10 to-indigo-500/5 border-blue-500/30 shadow-lg shadow-blue-500/10'
                                    : 'bg-white/[0.03] border-white/5 hover:border-white/10'
                                    }`}
                            >
                                {plan.popular && (
                                    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-center text-xs font-semibold py-1.5 tracking-wider uppercase">
                                        {t('pricing.popular')}
                                    </div>
                                )}
                                <CardContent className="p-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                                            <plan.icon className="h-5 w-5 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold">{t(plan.nameKey)}</h3>
                                        </div>
                                    </div>

                                    <div className="mt-6 mb-8">
                                        <span className="text-5xl font-bold">{plan.price}</span>
                                        <span className="text-slate-400 ml-1">{t('pricing.perMonth')}</span>
                                    </div>

                                    <div className="space-y-3 mb-8">
                                        {plan.featureKeys.map((featureKey, fi) => (
                                            <div key={fi} className="flex items-start gap-2.5 text-sm">
                                                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                                                <span className="text-slate-300">{t(featureKey)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <Link href="/onboarding">
                                        <Button
                                            className={`w-full rounded-xl py-5 ${plan.popular
                                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg'
                                                : 'bg-white/5 hover:bg-white/10 border border-white/10'
                                                }`}
                                        >
                                            {t('pricing.cta')}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white/[0.02] border-y border-white/5">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <Badge className="mb-4 bg-amber-500/10 text-amber-400 border-amber-500/20">{t('testimonials.badge')}</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">{t('testimonials.title')}</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {testimonials.map((tm, i) => (
                            <AnimateOnScroll key={i} delay={i * 100}>
                                <Card className="bg-white/[0.03] border-white/5 rounded-2xl h-full">
                                    <CardContent className="p-6">
                                        <div className="flex gap-1 mb-4">
                                            {[...Array(5)].map((_, si) => (
                                                <Star key={si} className="h-4 w-4 fill-amber-400 text-amber-400" />
                                            ))}
                                        </div>
                                        <p className="text-sm text-slate-300 leading-relaxed mb-6">{t(tm.textKey)}</p>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold">
                                                {tm.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold">{tm.name}</div>
                                                <div className="text-xs text-slate-500">{t(tm.roleKey)}</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-16">
                        <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">{t('faq.badge')}</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">{t('faq.title')}</h2>
                    </div>

                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <AnimateOnScroll key={i} delay={i * 60}>
                                <div className="border border-white/5 rounded-xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                    <button
                                        className="w-full flex items-center justify-between px-6 py-4 text-left"
                                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    >
                                        <span className="font-medium pr-4">{t(faq.qKey)}</span>
                                        <ChevronDown className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div
                                        className="grid transition-all duration-300 ease-in-out"
                                        style={{ gridTemplateRows: openFaq === i ? '1fr' : '0fr' }}
                                    >
                                        <div className="overflow-hidden">
                                            <div className="px-6 pb-4 text-sm text-slate-400 leading-relaxed">
                                                {t(faq.aKey)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section — Lead Capture */}
            <section className="py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-3xl p-12 sm:p-16 border border-white/5 relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.1),transparent_60%)]" />
                        <div className="relative z-10">
                            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                                {t('cta.title')}
                            </h2>
                            <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
                                {t('cta.subtitle')}
                            </p>

                            {/* Lead Capture Form */}
                            <LeadCaptureForm />

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
                                <Link href="/onboarding">
                                    <Button size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 text-lg px-8 py-6 rounded-xl">
                                        {t('cta.startNow')}
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="/login">
                                    <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 text-lg px-8 py-6 rounded-xl">
                                        {t('cta.login')}
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        <div className="md:col-span-1">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                    <Bot className="h-5 w-5 text-white" />
                                </div>
                                <span className="text-lg font-bold">Callception</span>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                {t('footer.description')}
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-sm">{t('footer.product')}</h4>
                            <div className="space-y-2 text-sm text-slate-500">
                                <a href="#features" className="block hover:text-white transition-colors">{t('footer.features')}</a>
                                <a href="#pricing" className="block hover:text-white transition-colors">{t('footer.pricing')}</a>
                                <a href="#how-it-works" className="block hover:text-white transition-colors">{t('footer.howItWorks')}</a>
                                <a href="#faq" className="block hover:text-white transition-colors">{t('footer.faq')}</a>
                                <Link href="/changelog" className="block hover:text-white transition-colors">{t('footer.changelog')}</Link>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-sm">{t('footer.company')}</h4>
                            <div className="space-y-2 text-sm text-slate-500">
                                <a href="#features" className="block hover:text-white transition-colors">{t('footer.about')}</a>
                                <a href="#how-it-works" className="block hover:text-white transition-colors">{t('footer.howItWorks')}</a>
                                <a href="#faq" className="block hover:text-white transition-colors">{t('footer.helpCenter')}</a>
                                <a href="mailto:info@callception.com" className="block hover:text-white transition-colors">{t('footer.contact')}</a>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-sm">{t('footer.legal')}</h4>
                            <div className="space-y-2 text-sm text-slate-500">
                                <Link href="/privacy" className="block hover:text-white transition-colors">{t('footer.privacy')}</Link>
                                <Link href="/terms" className="block hover:text-white transition-colors">{t('footer.terms')}</Link>
                                <Link href="/privacy" className="block hover:text-white transition-colors">{t('footer.kvkk')}</Link>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-xs text-slate-600">
                            &copy; {new Date().getFullYear()} Callception. {t('footer.copyright')}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Shield className="h-3.5 w-3.5" />
                            <span>{t('footer.security')}</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
