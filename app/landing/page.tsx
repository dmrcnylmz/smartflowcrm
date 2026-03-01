'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
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
// Landing Page
// =============================================

export default function LandingPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

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
                            <span className="text-xl font-bold">SmartFlow</span>
                        </div>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-sm text-slate-300 hover:text-white transition-colors">Özellikler</a>
                            <a href="#how-it-works" className="text-sm text-slate-300 hover:text-white transition-colors">Nasıl Çalışır</a>
                            <a href="#pricing" className="text-sm text-slate-300 hover:text-white transition-colors">Fiyatlandırma</a>
                            <a href="#faq" className="text-sm text-slate-300 hover:text-white transition-colors">SSS</a>
                        </div>

                        <div className="hidden md:flex items-center gap-3">
                            <Link href="/login">
                                <Button variant="ghost" className="text-slate-300 hover:text-white">
                                    Giriş Yap
                                </Button>
                            </Link>
                            <Link href="/onboarding">
                                <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/20">
                                    Ücretsiz Dene
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
                        <a href="#features" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Özellikler</a>
                        <a href="#how-it-works" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Nasıl Çalışır</a>
                        <a href="#pricing" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Fiyatlandırma</a>
                        <a href="#faq" className="block text-sm text-slate-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>SSS</a>
                        <div className="pt-4 space-y-3 border-t border-white/10">
                            <Link href="/login" className="block">
                                <Button variant="outline" className="w-full border-white/20">Giriş Yap</Button>
                            </Link>
                            <Link href="/onboarding" className="block">
                                <Button className="w-full bg-gradient-to-r from-blue-500 to-indigo-600">Ücretsiz Dene</Button>
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
                        Yapay Zeka Destekli Müşteri Hizmetleri
                    </Badge>

                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
                        Telefonları{' '}
                        <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                            AI Asistanın
                        </span>{' '}
                        Yanıt Versin
                    </h1>

                    <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
                        SmartFlow ile gelen çağrıları yapay zeka otomatik yanıtlar, randevu alır,
                        şikayet kaydeder ve müşteri memnuniyetini arttırır.
                        7/24 kesintisiz hizmet, sıfır bekleme süresi.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/onboarding">
                            <Button size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 text-lg px-8 py-6 rounded-xl">
                                14 Gün Ücretsiz Başlat
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                        <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 text-lg px-8 py-6 rounded-xl">
                            <Play className="mr-2 h-5 w-5" />
                            Demo İzle
                        </Button>
                    </div>

                    {/* Trust badges */}
                    <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span>KVKK Uyumlu</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Globe2 className="h-4 w-4" />
                            <span>Türkiye Lokasyonu</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>7/24 Aktif</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Headphones className="h-4 w-4" />
                            <span>Türkçe Doğal Dil</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Bar */}
            <section className="py-12 border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[
                            { value: '%95', label: 'Çağrı Karşılama Oranı', icon: Phone },
                            { value: '< 2sn', label: 'Ortalama Yanıt Süresi', icon: Zap },
                            { value: '7/24', label: 'Kesintisiz Hizmet', icon: Clock },
                            { value: '%40', label: 'Maliyet Tasarrufu', icon: TrendingUp },
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
                        <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">Özellikler</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">İşletmenize Güç Katan Özellikler</h2>
                        <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
                            SmartFlow, müşteri hizmetlerinizi uçtan uca dijitalleştiren kapsamlı bir platform sunar.
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
                                        <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                                        <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
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
                        <Badge className="mb-4 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">Nasıl Çalışır?</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">3 Adımda Başlatın</h2>
                        <p className="mt-4 text-slate-400">Kurulum 10 dakikadan az sürer. Teknik bilgi gerektirmez.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {steps.map((step, i) => (
                            <AnimateOnScroll key={i} delay={i * 150}>
                                <div className="relative text-center">
                                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
                                        <span className="text-2xl font-bold text-blue-400">{i + 1}</span>
                                    </div>
                                    <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">{step.description}</p>
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
                        <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">Fiyatlandırma</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">İşletmenize Uygun Plan Seçin</h2>
                        <p className="mt-4 text-slate-400">14 gün ücretsiz deneme. Kredi kartı gerekmez.</p>
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
                                        En Popüler
                                    </div>
                                )}
                                <CardContent className="p-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                                            <plan.icon className="h-5 w-5 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold">{plan.name}</h3>
                                        </div>
                                    </div>

                                    <div className="mt-6 mb-8">
                                        <span className="text-5xl font-bold">{plan.price}</span>
                                        <span className="text-slate-400 ml-1">TL/ay</span>
                                    </div>

                                    <div className="space-y-3 mb-8">
                                        {plan.features.map((feature, fi) => (
                                            <div key={fi} className="flex items-start gap-2.5 text-sm">
                                                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                                                <span className="text-slate-300">{feature}</span>
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
                                            Ücretsiz Dene
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
                        <Badge className="mb-4 bg-amber-500/10 text-amber-400 border-amber-500/20">Referanslar</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">Müşterilerimiz Ne Diyor?</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {testimonials.map((t, i) => (
                            <AnimateOnScroll key={i} delay={i * 100}>
                                <Card className="bg-white/[0.03] border-white/5 rounded-2xl h-full">
                                    <CardContent className="p-6">
                                        <div className="flex gap-1 mb-4">
                                            {[...Array(5)].map((_, si) => (
                                                <Star key={si} className="h-4 w-4 fill-amber-400 text-amber-400" />
                                            ))}
                                        </div>
                                        <p className="text-sm text-slate-300 leading-relaxed mb-6">{t.text}</p>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold">
                                                {t.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold">{t.name}</div>
                                                <div className="text-xs text-slate-500">{t.role}</div>
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
                        <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">SSS</Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold">Sık Sorulan Sorular</h2>
                    </div>

                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <AnimateOnScroll key={i} delay={i * 60}>
                                <div className="border border-white/5 rounded-xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                    <button
                                        className="w-full flex items-center justify-between px-6 py-4 text-left"
                                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    >
                                        <span className="font-medium pr-4">{faq.question}</span>
                                        <ChevronDown className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div
                                        className="grid transition-all duration-300 ease-in-out"
                                        style={{ gridTemplateRows: openFaq === i ? '1fr' : '0fr' }}
                                    >
                                        <div className="overflow-hidden">
                                            <div className="px-6 pb-4 text-sm text-slate-400 leading-relaxed">
                                                {faq.answer}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-3xl p-12 sm:p-16 border border-white/5 relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.1),transparent_60%)]" />
                        <div className="relative z-10">
                            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                                Müşteri Hizmetlerinizi Dönüştürmeye Hazır mısınız?
                            </h2>
                            <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
                                14 gün ücretsiz deneyin. Kurulum 10 dakikadan az sürer.
                                Kredi kartı gerekmez, istediğiniz zaman iptal edin.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Link href="/onboarding">
                                    <Button size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 text-lg px-8 py-6 rounded-xl">
                                        Hemen Başlat
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="/login">
                                    <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 text-lg px-8 py-6 rounded-xl">
                                        Giriş Yap
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
                                <span className="text-lg font-bold">SmartFlow</span>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Yapay zeka destekli müşteri hizmetleri ve CRM platformu. Türkiye&apos;nin en gelişmiş AI resepsiyonisti.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-sm">Ürün</h4>
                            <div className="space-y-2 text-sm text-slate-500">
                                <a href="#features" className="block hover:text-white transition-colors">Özellikler</a>
                                <a href="#pricing" className="block hover:text-white transition-colors">Fiyatlandırma</a>
                                <a href="#how-it-works" className="block hover:text-white transition-colors">Nasıl Çalışır</a>
                                <a href="#faq" className="block hover:text-white transition-colors">SSS</a>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-sm">Şirket</h4>
                            <div className="space-y-2 text-sm text-slate-500">
                                <a href="#features" className="block hover:text-white transition-colors">Hakkımızda</a>
                                <a href="#how-it-works" className="block hover:text-white transition-colors">Nasıl Çalışır</a>
                                <a href="#faq" className="block hover:text-white transition-colors">Yardım Merkezi</a>
                                <a href="mailto:info@smartflow.com.tr" className="block hover:text-white transition-colors">İletişim</a>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-sm">Yasal</h4>
                            <div className="space-y-2 text-sm text-slate-500">
                                <Link href="/privacy" className="block hover:text-white transition-colors">Gizlilik Politikası</Link>
                                <Link href="/privacy" className="block hover:text-white transition-colors">Kullanım Şartları</Link>
                                <Link href="/privacy" className="block hover:text-white transition-colors">KVKK Aydınlatma</Link>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-xs text-slate-600">
                            &copy; {new Date().getFullYear()} SmartFlow. Tüm hakları saklıdır.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Shield className="h-3.5 w-3.5" />
                            <span>256-bit SSL | KVKK Uyumlu | ISO 27001</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

// =============================================
// Data
// =============================================

const features = [
    {
        icon: Bot,
        title: 'AI Sesli Asistan',
        description: 'Türkçe doğal dil işleme ile gelen çağrıları otomatik yanıtlar. Müşteri niyetini anlar ve uygun aksiyonu alır.',
        gradient: 'from-blue-500 to-indigo-600',
    },
    {
        icon: Calendar,
        title: 'Otomatik Randevu',
        description: 'AI asistan müşteri taleplerini dinler ve uygun saatlere randevu planlar. Hatırlatma e-postaları otomatik gider.',
        gradient: 'from-purple-500 to-pink-600',
    },
    {
        icon: MessageSquare,
        title: 'Şikayet Yönetimi',
        description: 'Müşteri şikayetlerini kategorize eder, önceliklendirir ve ilgili departmana yönlendirir.',
        gradient: 'from-amber-500 to-orange-600',
    },
    {
        icon: BarChart3,
        title: 'Akıllı Raporlama',
        description: 'Çağrı istatistikleri, müşteri memnuniyeti ve performans metrikleri tek panelde.',
        gradient: 'from-green-500 to-emerald-600',
    },
    {
        icon: Users,
        title: 'CRM Entegrasyonu',
        description: 'Müşteri bilgileri, çağrı geçmişi ve etkileşim kayıtları entegre CRM sisteminde.',
        gradient: 'from-cyan-500 to-blue-600',
    },
    {
        icon: Shield,
        title: 'Güvenlik ve KVKK',
        description: 'Verileriniz Türkiye lokasyonunda, KVKK uyumlu altyapı ile korunur. End-to-end şifreleme.',
        gradient: 'from-rose-500 to-red-600',
    },
];

const steps = [
    {
        title: 'Kayıt Olun',
        description: 'Şirket bilgilerinizi girin, AI asistan kişiliğini ve karşılama mesajını belirleyin. 5 dakikada tamamlanır.',
    },
    {
        title: 'Numaranızı Bağlatın',
        description: 'Size özel bir telefon numarası atanır veya mevcut numaranızı yönlendirin. Entegrasyon otomatiktir.',
    },
    {
        title: 'Çağrıları Karşılayın',
        description: 'AI asistanınız gelen çağrıları yanıtlamaya başlar. Dashboard\'dan canlı takip edin ve raporları inceleyin.',
    },
];

const pricingPlans = [
    {
        name: 'Başlangıç',
        price: '990',
        icon: Sparkles,
        gradient: 'from-blue-500 to-indigo-600',
        popular: false,
        features: [
            'AI Sesli Asistan',
            '100 dakika/ay konuşma',
            'Temel CRM',
            'E-posta bildirimleri',
            '2 eşzamanlı oturum',
            'Standart destek',
        ],
    },
    {
        name: 'Profesyonel',
        price: '2.990',
        icon: Award,
        gradient: 'from-purple-500 to-pink-600',
        popular: true,
        features: [
            'Gelişmiş AI Asistan',
            '500 dakika/ay konuşma',
            'Gelişmiş CRM + Raporlama',
            'Bilgi Bankası (RAG)',
            '5 eşzamanlı oturum',
            'n8n Otomasyon',
            'Öncelikli destek',
        ],
    },
    {
        name: 'Kurumsal',
        price: '7.990',
        icon: Building2,
        gradient: 'from-amber-500 to-orange-600',
        popular: false,
        features: [
            'Tüm Pro özellikleri',
            '2.000 dakika/ay konuşma',
            'Özel AI modeli eğitimi',
            '20 eşzamanlı oturum',
            'API erişimi',
            'SLA garantisi',
            'Özel hesap yöneticisi',
        ],
    },
];

const testimonials = [
    {
        name: 'Ahmet Yılmaz',
        role: 'Kurucu, TechStart',
        text: 'SmartFlow sayesinde kaçırılan çağrı oranı %30\'dan %3\'e düştü. AI asistan müşterilerimizi biz kadar iyi tanıyor.',
    },
    {
        name: 'Zeynep Kara',
        role: 'Operasyon Müdürü, HealthCare Plus',
        text: 'Randevu yönetimi tamamen otomatik hale geldi. Personelimiz artık daha değerli işlere odaklanabiliyor.',
    },
    {
        name: 'Murat Demir',
        role: 'CEO, E-Ticaret Pro',
        text: 'Müşteri memnuniyeti %40 arttı. 7/24 kesintisiz hizmet sunabilmek oyunun kurallarını değiştirdi.',
    },
];

const faqs = [
    {
        question: 'SmartFlow nasıl çalışır?',
        answer: 'SmartFlow, işletmenize özel bir telefon numarası atar. Gelen çağrılar yapay zeka tarafından yanıtlanır, müşteri niyeti anlaşılır ve uygun aksiyonlar (randevu, şikayet kaydı, bilgi verme) otomatik olarak gerçekleştirilir.',
    },
    {
        question: 'Kurulum ne kadar sürer?',
        answer: 'Tipik bir kurulum 10 dakikadan az sürer. Şirket bilgilerinizi ve AI asistan tercihlerinizi girdikten sonra hemen çağrı almaya başlayabilirsiniz.',
    },
    {
        question: 'Türkçe\'yi ne kadar iyi anlıyor?',
        answer: 'SmartFlow, Google ve Deepgram\'in gelişmiş Türkçe doğal dil işleme motorlarını kullanır. Lehçe farklılıkları, argo ve sektöre özel terimleri başarıyla anlar.',
    },
    {
        question: 'Mevcut CRM\'imle entegre olabilir mi?',
        answer: 'Evet! SmartFlow yerleşik CRM sunmanın yanı sıra, n8n otomasyon entegrasyonu ile Salesforce, HubSpot, Zendesk gibi platformlarla da çalışabilir.',
    },
    {
        question: 'Verilerim güvenli mi?',
        answer: 'Evet. Tüm veriler Türkiye lokasyonundaki sunucularda, KVKK uyumlu altyapıda saklanır. End-to-end şifreleme, rol tabanlı erişim kontrolü ve düzenli güvenlik denetimleri uygulanır.',
    },
    {
        question: 'Deneme süresi nasıl işler?',
        answer: '14 gün boyunca seçtiğiniz planı tamamen ücretsiz kullanabilirsiniz. Kredi kartı bilgisi gerekmez. Deneme süresi dolmadan iptal edebilirsiniz.',
    },
];
