'use client';
export const dynamic = 'force-dynamic';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import {
    Building2, Mic, FileText, Rocket, ChevronRight, ChevronLeft,
    Check, Loader2, Briefcase, ShoppingBag, HeartPulse, Headphones,
    GraduationCap, Utensils, Home as HomeIcon, Car
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// =============================================
// Types
// =============================================

interface OnboardingData {
    // Step 1: Company Info
    companyName: string;
    sector: string;
    language: string;
    workingHours: string;
    workingDays: string;
    services: string;

    // Step 2: Template Selection
    template: string;

    // Step 3: Voice Agent Config
    agentName: string;
    agentRole: string;
    agentTraits: string[];
    greeting: string;
    farewell: string;
    voiceId: string;
}

const INITIAL_DATA: OnboardingData = {
    companyName: '',
    sector: '',
    language: 'tr',
    workingHours: '09:00-18:00',
    workingDays: 'Pazartesi-Cuma',
    services: '',
    template: '',
    agentName: 'Asistan',
    agentRole: 'Müşteri Temsilcisi',
    agentTraits: ['profesyonel', 'nazik'],
    greeting: '',
    farewell: '',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
};

const STEPS = [
    { id: 'company', label: 'Şirket Bilgileri', icon: Building2, description: 'Temel şirket bilgilerinizi girin' },
    { id: 'template', label: 'Şablon Seçimi', icon: FileText, description: 'Sektörünüze uygun şablonu seçin' },
    { id: 'voice', label: 'Sesli Asistan', icon: Mic, description: 'AI asistanınızı özelleştirin' },
    { id: 'launch', label: 'Başlat', icon: Rocket, description: 'Son kontrol ve başlatma' },
];

const TEMPLATES = [
    {
        id: 'healthcare',
        name: 'Sağlık & Klinik',
        icon: HeartPulse,
        color: 'from-emerald-500 to-teal-600',
        description: 'Randevu alma, doktor bilgileri, acil yönlendirme',
        features: ['Randevu takibi', 'Doktor uygunluk sorgusu', 'Sigorta bilgisi', 'Acil yönlendirme'],
        defaultGreeting: 'Merhaba, kliniğimize hoş geldiniz. Randevu almak veya bilgi almak için yardımcı olabilirim.',
    },
    {
        id: 'ecommerce',
        name: 'E-Ticaret',
        icon: ShoppingBag,
        color: 'from-violet-500 to-purple-600',
        description: 'Sipariş takibi, iade işlemleri, ürün bilgisi',
        features: ['Sipariş durumu', 'İade/değişim', 'Ürün bilgisi', 'Kargo takibi'],
        defaultGreeting: 'Merhaba, mağazamıza hoş geldiniz. Siparişiniz veya ürünlerimiz hakkında yardımcı olabilirim.',
    },
    {
        id: 'insurance',
        name: 'Sigorta',
        icon: Briefcase,
        color: 'from-blue-500 to-indigo-600',
        description: 'Poliçe bilgisi, hasar ihbarı, teklif alma',
        features: ['Poliçe sorgulama', 'Hasar ihbarı', 'Teklif alma', 'Teminat bilgisi'],
        defaultGreeting: 'Merhaba, sigorta şirketimize hoş geldiniz. Poliçeniz veya hasar ihbarı için yardımcı olabilirim.',
    },
    {
        id: 'support',
        name: 'Teknik Destek',
        icon: Headphones,
        color: 'from-orange-500 to-red-500',
        description: 'Sorun giderme, bilet açma, uzman yönlendirme',
        features: ['Sorun tespiti', 'Destek bileti', 'Uzman yönlendirme', 'SLA takibi'],
        defaultGreeting: 'Merhaba, teknik destek hattımıza hoş geldiniz. Sorununuzu çözmek için buradayım.',
    },
    {
        id: 'education',
        name: 'Eğitim',
        icon: GraduationCap,
        color: 'from-amber-500 to-yellow-500',
        description: 'Kayıt bilgisi, ders programı, danışmanlık',
        features: ['Kayıt işlemleri', 'Ders programı', 'Danışman yönlendirme', 'Duyurular'],
        defaultGreeting: 'Merhaba, kurumumuza hoş geldiniz. Kayıt veya eğitim programlarımız hakkında yardımcı olabilirim.',
    },
    {
        id: 'restaurant',
        name: 'Restoran & Otel',
        icon: Utensils,
        color: 'from-rose-500 to-pink-600',
        description: 'Rezervasyon, menü bilgisi, özel istekler',
        features: ['Rezervasyon', 'Menü bilgisi', 'Özel diyet', 'Etkinlik organizasyonu'],
        defaultGreeting: 'Merhaba, restoranımıza hoş geldiniz. Rezervasyon veya menümüz hakkında yardımcı olabilirim.',
    },
    {
        id: 'realestate',
        name: 'Gayrimenkul',
        icon: HomeIcon,
        color: 'from-cyan-500 to-blue-500',
        description: 'İlan bilgisi, gezici randevusu, fiyat teklifi',
        features: ['İlan sorgulama', 'Gezici randevusu', 'Fiyat bilgisi', 'Kredi danışmanlığı'],
        defaultGreeting: 'Merhaba, emlak ofisimize hoş geldiniz. Mülk arama veya randevu almak için yardımcı olabilirim.',
    },
    {
        id: 'automotive',
        name: 'Otomotiv',
        icon: Car,
        color: 'from-gray-600 to-slate-700',
        description: 'Servis randevusu, parça bilgisi, test sürüşü',
        features: ['Servis randevusu', 'Yedek parça', 'Test sürüşü', 'Garanti bilgisi'],
        defaultGreeting: 'Merhaba, bayimize hoş geldiniz. Servis veya araç bilgisi için yardımcı olabilirim.',
    },
];

const VOICE_OPTIONS = [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Kadın', tone: 'Profesyonel & Sıcak' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Kadın', tone: 'Sakin & Güven Veren' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'Erkek', tone: 'Profesyonel & Kararlı' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'Erkek', tone: 'Güçlü & Otoriter' },
];

const TRAIT_OPTIONS = [
    'profesyonel', 'nazik', 'samimi', 'enerjik', 'sakin',
    'çözüm odaklı', 'sabırlı', 'detaycı', 'empatik', 'güler yüzlü'
];

// =============================================
// Main Component
// =============================================

export default function OnboardingPage() {
    const router = useRouter();
    const { user, refreshClaims } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateData = useCallback((updates: Partial<OnboardingData>) => {
        setData(prev => ({ ...prev, ...updates }));
    }, []);

    const nextStep = () => {
        if (currentStep < STEPS.length - 1) setCurrentStep(prev => prev + 1);
    };

    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    };

    const canProceed = useCallback((): boolean => {
        switch (currentStep) {
            case 0: return !!data.companyName && !!data.sector;
            case 1: return !!data.template;
            case 2: return !!data.agentName;
            case 3: return true;
            default: return false;
        }
    }, [currentStep, data]);

    async function handleSubmit() {
        setIsSubmitting(true);
        setError(null);

        try {
            if (!user) {
                setError('Oturum bulunamadı. Lütfen tekrar giriş yapın.');
                setIsSubmitting(false);
                return;
            }
            const token = await user.getIdToken();
            const response = await fetch('/api/tenants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    companyName: data.companyName,
                    sector: data.sector,
                    language: data.language,
                    agent: {
                        name: data.agentName,
                        role: data.agentRole,
                        traits: data.agentTraits,
                        greeting: data.greeting || TEMPLATES.find(t => t.id === data.template)?.defaultGreeting || '',
                        farewell: data.farewell || 'Aradığınız için teşekkür ederiz. İyi günler.',
                    },
                    business: {
                        workingHours: data.workingHours,
                        workingDays: data.workingDays,
                        services: data.services.split(',').map(s => s.trim()).filter(Boolean),
                    },
                    voice: {
                        voiceId: data.voiceId,
                        ttsModel: 'eleven_flash_v2_5',
                        sttLanguage: data.language === 'en' ? 'en' : 'tr',
                        stability: 0.5,
                        similarityBoost: 0.75,
                    },
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Tenant oluşturulamadı');
            }

            await response.json();

            // Force-refresh the Firebase token so the new custom claims
            // (tenantId, role) are included in the JWT immediately.
            // refreshClaims() calls getIdTokenResult(true) and updates
            // the auth context state — without this, ClientLayout would
            // redirect back to /onboarding because tenantId is still null.
            await refreshClaims();

            // Redirect to main dashboard
            router.push('/');
        } catch (err) {
            setError('Kurulum tamamlanamadı. Lütfen tekrar deneyin.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
            {/* Header */}
            <div className="border-b bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                            <span className="text-sm font-bold text-white">SF</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-foreground">SmartFlow</h1>
                            <p className="text-xs text-muted-foreground">Şirket Onboarding</p>
                        </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Adım {currentStep + 1} / {STEPS.length}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="max-w-5xl mx-auto px-6 pt-8">
                <div className="flex items-center gap-2">
                    {STEPS.map((step, index) => {
                        const StepIcon = step.icon;
                        const isComplete = index < currentStep;
                        const isCurrent = index === currentStep;
                        return (
                            <div key={step.id} className="flex-1 flex items-center gap-2 animate-fade-in-down" style={{ animationDelay: `${index * 100}ms` }}>
                                <button
                                    onClick={() => index <= currentStep && setCurrentStep(index)}
                                    disabled={index > currentStep}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 text-sm font-medium w-full
                                        ${isCurrent
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                                            : isComplete
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50'
                                                : 'bg-gray-100 dark:bg-gray-800 text-muted-foreground cursor-not-allowed'
                                        }`}
                                >
                                    {isComplete ? (
                                        <Check className="h-4 w-4 flex-shrink-0" />
                                    ) : (
                                        <StepIcon className="h-4 w-4 flex-shrink-0" />
                                    )}
                                    <span className="hidden md:inline truncate">{step.label}</span>
                                </button>
                                {index < STEPS.length - 1 && (
                                    <ChevronRight className={`h-4 w-4 flex-shrink-0 ${isComplete ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="max-w-5xl mx-auto px-6 py-8">
                <div key={currentStep} className="animate-fade-in-up">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-foreground">{STEPS[currentStep].label}</h2>
                        <p className="text-muted-foreground mt-1">{STEPS[currentStep].description}</p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    {/* Step 1: Company Info */}
                    {currentStep === 0 && (
                        <StepCompanyInfo data={data} updateData={updateData} />
                    )}

                    {/* Step 2: Template Selection */}
                    {currentStep === 1 && (
                        <StepTemplateSelection data={data} updateData={updateData} />
                    )}

                    {/* Step 3: Voice Agent Config */}
                    {currentStep === 2 && (
                        <StepVoiceConfig data={data} updateData={updateData} />
                    )}

                    {/* Step 4: Review & Launch */}
                    {currentStep === 3 && (
                        <StepReview data={data} />
                    )}
                </div>
            </div>

            {/* Navigation Footer */}
            <div className="fixed bottom-0 left-0 right-0 border-t bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <button
                        onClick={prevStep}
                        disabled={currentStep === 0}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all
                            ${currentStep === 0
                                ? 'opacity-0 cursor-default'
                                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-foreground'
                            }`}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Geri
                    </button>

                    {currentStep < STEPS.length - 1 ? (
                        <button
                            onClick={nextStep}
                            disabled={!canProceed()}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all
                                ${canProceed()
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
                                    : 'bg-gray-200 dark:bg-gray-700 text-muted-foreground cursor-not-allowed'
                                }`}
                        >
                            Devam Et
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Oluşturuluyor...
                                </>
                            ) : (
                                <>
                                    <Rocket className="h-4 w-4" />
                                    Şirketi Başlat
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom padding for fixed footer */}
            <div className="h-24" />
        </div>
    );
}

// =============================================
// Step 1: Company Info
// =============================================

function StepCompanyInfo({
    data,
    updateData,
}: {
    data: OnboardingData;
    updateData: (updates: Partial<OnboardingData>) => void;
}) {
    const SECTORS = [
        'Sağlık', 'E-Ticaret', 'Sigorta', 'Teknik Destek', 'Eğitim',
        'Restoran & Otel', 'Gayrimenkul', 'Otomotiv', 'Finans', 'Hukuk', 'Diğer'
    ];

    return (
        <div className="grid md:grid-cols-2 gap-6">
            {/* Company Name */}
            <div className="md:col-span-2">
                <Label className="mb-2">
                    Şirket Adı <span className="text-destructive">*</span>
                </Label>
                <Input
                    value={data.companyName}
                    onChange={(e) => updateData({ companyName: e.target.value })}
                    placeholder="Şirketinizin adını girin"
                    className="h-12 rounded-xl"
                />
            </div>

            {/* Sector */}
            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    Sektör <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {SECTORS.map((sector) => (
                        <button
                            key={sector}
                            onClick={() => updateData({ sector })}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border
                                ${data.sector === sector
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                    : 'bg-white dark:bg-gray-900 border-input hover:border-blue-300 dark:hover:border-blue-700 text-foreground'
                                }`}
                        >
                            {sector}
                        </button>
                    ))}
                </div>
            </div>

            {/* Language & Working Hours */}
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Dil</label>
                    <div className="flex gap-2">
                        {[
                            { id: 'tr', flag: '🇹🇷', name: 'Türkçe' },
                            { id: 'en', flag: '🇬🇧', name: 'English' },
                        ].map(({ id, flag, name }) => (
                            <button
                                key={id}
                                onClick={() => updateData({ language: id })}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border
                                    ${data.language === id
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                        : 'bg-white dark:bg-gray-900 border-input hover:border-blue-300 text-foreground'
                                    }`}
                            >
                                <span className="text-lg">{flag}</span>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <Label className="mb-2">Çalışma Saatleri</Label>
                    <Input
                        value={data.workingHours}
                        onChange={(e) => updateData({ workingHours: e.target.value })}
                        placeholder="09:00-18:00"
                        className="h-12 rounded-xl"
                    />
                </div>

                <div>
                    <Label className="mb-2">Çalışma Günleri</Label>
                    <Input
                        value={data.workingDays}
                        onChange={(e) => updateData({ workingDays: e.target.value })}
                        placeholder="Pazartesi-Cuma"
                        className="h-12 rounded-xl"
                    />
                </div>

                <div>
                    <Label className="mb-2">Hizmetler (virgülle ayırın)</Label>
                    <Input
                        value={data.services}
                        onChange={(e) => updateData({ services: e.target.value })}
                        placeholder="Randevu, Bilgi, Şikayet, Destek"
                        className="h-12 rounded-xl"
                    />
                </div>
            </div>
        </div>
    );
}

// =============================================
// Step 2: Template Selection
// =============================================

function StepTemplateSelection({
    data,
    updateData,
}: {
    data: OnboardingData;
    updateData: (updates: Partial<OnboardingData>) => void;
}) {
    return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEMPLATES.map((template, idx) => {
                const Icon = template.icon;
                const isSelected = data.template === template.id;
                return (
                    <button
                        key={template.id}
                        onClick={() => {
                            updateData({
                                template: template.id,
                                greeting: template.defaultGreeting,
                            });
                        }}
                        style={{ animationDelay: `${idx * 80}ms` }}
                        className={`relative group p-5 rounded-2xl border-2 text-left transition-all duration-300 hover:-translate-y-1 animate-fade-in-up
                            ${isSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-lg shadow-blue-500/10'
                                : 'border-transparent bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 shadow-sm hover:shadow-md'
                            }`}
                    >
                        {/* Selected badge */}
                        {isSelected && (
                            <div className="absolute -top-2 -right-2 h-6 w-6 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                                <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                        )}

                        {/* Icon */}
                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-r ${template.color} flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all`}>
                            <Icon className="h-6 w-6 text-white" />
                        </div>

                        {/* Content */}
                        <h3 className="font-semibold text-foreground text-sm mb-1">{template.name}</h3>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{template.description}</p>

                        {/* Features */}
                        <div className="space-y-1">
                            {template.features.map((feature) => (
                                <div key={feature} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                                    {feature}
                                </div>
                            ))}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

// =============================================
// Step 3: Voice Config
// =============================================

function StepVoiceConfig({
    data,
    updateData,
}: {
    data: OnboardingData;
    updateData: (updates: Partial<OnboardingData>) => void;
}) {
    const toggleTrait = (trait: string) => {
        const current = data.agentTraits;
        if (current.includes(trait)) {
            updateData({ agentTraits: current.filter(t => t !== trait) });
        } else if (current.length < 5) {
            updateData({ agentTraits: [...current, trait] });
        }
    };

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Agent Identity */}
            <div className="space-y-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Mic className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    Asistan Kimliği
                </h3>

                <div>
                    <Label className="mb-2">Asistan Adı</Label>
                    <Input
                        value={data.agentName}
                        onChange={(e) => updateData({ agentName: e.target.value })}
                        placeholder="Asistan"
                        className="h-12 rounded-xl"
                    />
                </div>

                <div>
                    <Label className="mb-2">Rolü</Label>
                    <Input
                        value={data.agentRole}
                        onChange={(e) => updateData({ agentRole: e.target.value })}
                        placeholder="Müşteri Temsilcisi"
                        className="h-12 rounded-xl"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Karakter Özellikleri <span className="text-xs text-muted-foreground">(en fazla 5)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {TRAIT_OPTIONS.map((trait) => (
                            <button
                                key={trait}
                                onClick={() => toggleTrait(trait)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                                    ${data.agentTraits.includes(trait)
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                            >
                                {trait}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Voice & Messages */}
            <div className="space-y-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <FileText className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    Ses & Mesajlar
                </h3>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Ses Seçimi</label>
                    <div className="space-y-2">
                        {VOICE_OPTIONS.map((voice) => (
                            <button
                                key={voice.id}
                                onClick={() => updateData({ voiceId: voice.id })}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                                    ${data.voiceId === voice.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                        : 'border-input bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                                    }`}
                            >
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold
                                    ${voice.gender === 'Kadın'
                                        ? 'bg-gradient-to-r from-pink-400 to-rose-500 text-white'
                                        : 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white'
                                    }`}>
                                    {voice.name[0]}
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-foreground">{voice.name}</div>
                                    <div className="text-xs text-muted-foreground">{voice.gender} · {voice.tone}</div>
                                </div>
                                {data.voiceId === voice.id && (
                                    <Check className="h-4 w-4 text-blue-600" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <Label className="mb-2">Karşılama Mesajı</Label>
                    <Textarea
                        value={data.greeting}
                        onChange={(e) => updateData({ greeting: e.target.value })}
                        placeholder="Merhaba, şirketimize hoş geldiniz..."
                        rows={3}
                        className="rounded-xl resize-none"
                    />
                </div>

                <div>
                    <Label className="mb-2">Veda Mesajı</Label>
                    <Textarea
                        value={data.farewell}
                        onChange={(e) => updateData({ farewell: e.target.value })}
                        placeholder="Aradığınız için teşekkür ederiz. İyi günler."
                        rows={2}
                        className="rounded-xl resize-none"
                    />
                </div>
            </div>
        </div>
    );
}

// =============================================
// Step 4: Review & Launch
// =============================================

function StepReview({ data }: { data: OnboardingData }) {
    const template = TEMPLATES.find(t => t.id === data.template);
    const voice = VOICE_OPTIONS.find(v => v.id === data.voiceId);

    return (
        <div className="grid md:grid-cols-2 gap-6">
            {/* Company Summary */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-input p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Şirket Bilgileri</h3>
                        <p className="text-xs text-muted-foreground">Adım 1</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <ReviewItem label="Şirket" value={data.companyName} />
                    <ReviewItem label="Sektör" value={data.sector} />
                    <ReviewItem label="Dil" value={data.language === 'tr' ? '🇹🇷 Türkçe' : '🇬🇧 English'} />
                    <ReviewItem label="Çalışma" value={`${data.workingDays} ${data.workingHours}`} />
                    {data.services && <ReviewItem label="Hizmetler" value={data.services} />}
                </div>
            </div>

            {/* Template Summary */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-input p-6 space-y-4">
                <div className="flex items-center gap-3">
                    {template && (
                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-r ${template.color} flex items-center justify-center`}>
                            <template.icon className="h-5 w-5 text-white" />
                        </div>
                    )}
                    <div>
                        <h3 className="font-semibold text-foreground">Şablon</h3>
                        <p className="text-xs text-muted-foreground">Adım 2</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <ReviewItem label="Seçilen" value={template?.name || '-'} />
                    <ReviewItem label="Açıklama" value={template?.description || '-'} />
                </div>
            </div>

            {/* Voice Agent Summary */}
            <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-input p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center">
                        <Mic className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Sesli Asistan</h3>
                        <p className="text-xs text-muted-foreground">Adım 3</p>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                        <ReviewItem label="İsim" value={data.agentName} />
                        <ReviewItem label="Rol" value={data.agentRole} />
                        <ReviewItem label="Özellikler" value={data.agentTraits.join(', ')} />
                        <ReviewItem label="Ses" value={voice ? `${voice.name} (${voice.tone})` : '-'} />
                    </div>
                    <div className="space-y-2">
                        <div>
                            <span className="text-muted-foreground">Karşılama:</span>
                            <p className="text-foreground mt-1 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 italic">
                                &ldquo;{data.greeting || '(varsayılan kullanılacak)'}&rdquo;
                            </p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Veda:</span>
                            <p className="text-foreground mt-1 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 italic">
                                &ldquo;{data.farewell || 'Aradığınız için teşekkür ederiz. İyi günler.'}&rdquo;
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Banner */}
            <div className="md:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50 p-5">
                <div className="flex items-start gap-3">
                    <Rocket className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Başlatmaya Hazır!</h4>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            &quot;Şirketi Başlat&quot; butonuna tıkladığınızda, AI sesli asistanınız otomatik olarak yapılandırılacak
                            ve kullanıma hazır hale gelecek. Ayarlarınızı daha sonra istediğiniz zaman değiştirebilirsiniz.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================
// Review Item Helper
// =============================================

function ReviewItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className="text-muted-foreground min-w-[80px]">{label}:</span>
            <span className="text-foreground font-medium">{value}</span>
        </div>
    );
}
