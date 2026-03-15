'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { auth } from '@/lib/firebase/config';
import { useTranslations } from 'next-intl';
import {
    Building2, Mic, FileText, Rocket, ChevronRight, ChevronLeft,
    Check, Loader2, Briefcase, ShoppingBag, HeartPulse, Headphones,
    GraduationCap, Utensils, Home as HomeIcon, Car, AlertCircle,
    Shield, Scale
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// =============================================
// Types
// =============================================

interface OnboardingData {
    companyName: string;
    sector: string;
    language: string;
    workingHours: string;
    workingDays: string;
    services: string;
    template: string;
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
    agentTraits: ['professional', 'polite'],
    greeting: '',
    farewell: '',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
};

const STEP_IDS = ['company', 'template', 'voice', 'launch'] as const;
const STEP_ICONS = [Building2, FileText, Mic, Rocket];

const TEMPLATE_DEFS = [
    { id: 'healthcare', icon: HeartPulse, color: 'from-emerald-500 to-teal-600', borderColor: 'border-emerald-500/40', glowColor: 'shadow-emerald-500/20', featureCount: 4 },
    { id: 'ecommerce', icon: ShoppingBag, color: 'from-violet-500 to-purple-600', borderColor: 'border-violet-500/40', glowColor: 'shadow-violet-500/20', featureCount: 4 },
    { id: 'insurance', icon: Briefcase, color: 'from-blue-500 to-indigo-600', borderColor: 'border-blue-500/40', glowColor: 'shadow-blue-500/20', featureCount: 4 },
    { id: 'support', icon: Headphones, color: 'from-orange-500 to-red-500', borderColor: 'border-orange-500/40', glowColor: 'shadow-orange-500/20', featureCount: 4 },
    { id: 'education', icon: GraduationCap, color: 'from-amber-500 to-yellow-500', borderColor: 'border-amber-500/40', glowColor: 'shadow-amber-500/20', featureCount: 4 },
    { id: 'restaurant', icon: Utensils, color: 'from-rose-500 to-pink-600', borderColor: 'border-rose-500/40', glowColor: 'shadow-rose-500/20', featureCount: 4 },
    { id: 'realestate', icon: HomeIcon, color: 'from-cyan-500 to-blue-500', borderColor: 'border-cyan-500/40', glowColor: 'shadow-cyan-500/20', featureCount: 4 },
    { id: 'automotive', icon: Car, color: 'from-slate-500 to-gray-600', borderColor: 'border-slate-500/40', glowColor: 'shadow-slate-500/20', featureCount: 4 },
    { id: 'finance', icon: Scale, color: 'from-green-500 to-emerald-600', borderColor: 'border-green-500/40', glowColor: 'shadow-green-500/20', featureCount: 4 },
    { id: 'legal', icon: Shield, color: 'from-indigo-500 to-purple-600', borderColor: 'border-indigo-500/40', glowColor: 'shadow-indigo-500/20', featureCount: 4 },
];

const VOICE_OPTIONS = [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', tone: 'Professional & Warm' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', tone: 'Calm & Reassuring' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', tone: 'Professional & Decisive' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', tone: 'Strong & Authoritative' },
];

const TRAIT_KEYS = [
    'professional', 'polite', 'friendly', 'energetic', 'calm',
    'solutionOriented', 'patient', 'detailOriented', 'empathetic', 'cheerful'
];

const SECTOR_KEYS = [
    'healthcare', 'ecommerce', 'insurance', 'support', 'education',
    'restaurant', 'realestate', 'automotive', 'finance', 'legal', 'other'
];

// =============================================
// Main Component
// =============================================

export default function OnboardingPage() {
    const router = useRouter();
    const { user, loading: authLoading, refreshClaims } = useAuth();
    const t = useTranslations('onboarding');
    const [currentStep, setCurrentStep] = useState(0);
    const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!authLoading && !user && !auth.currentUser) {
            router.replace('/login');
        }
    }, [authLoading, user, router]);

    // Auto-detect browser language on mount
    useEffect(() => {
        const cookie = document.cookie.split('; ').find(c => c.startsWith('NEXT_LOCALE='));
        const cookieLang = cookie?.split('=')[1];
        const browserLang = (cookieLang || navigator.language || '').slice(0, 2).toLowerCase();
        const supported = ['tr', 'en', 'de', 'fr'];
        if (supported.includes(browserLang) && browserLang !== data.language) {
            updateData({ language: browserLang });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateData = useCallback((updates: Partial<OnboardingData>) => {
        setData(prev => ({ ...prev, ...updates }));
    }, []);

    const nextStep = () => {
        if (currentStep < STEP_IDS.length - 1) setCurrentStep(prev => prev + 1);
    };

    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    };

    const canProceed = useCallback((): boolean => {
        switch (currentStep) {
            case 0: return !!data.companyName.trim() && !!data.sector;
            case 1: return !!data.template;
            case 2: return !!data.agentName.trim();
            case 3: return true;
            default: return false;
        }
    }, [currentStep, data]);

    async function handleSubmit() {
        setIsSubmitting(true);
        setError(null);

        try {
            const currentUser = user ?? auth.currentUser;
            if (!currentUser) {
                setError(t('sessionNotFound'));
                router.replace('/login');
                setIsSubmitting(false);
                return;
            }

            const token = await currentUser.getIdToken(true);
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
                        greeting: data.greeting || '',
                        farewell: data.farewell || t('farewellDefault'),
                    },
                    business: {
                        workingHours: data.workingHours,
                        workingDays: data.workingDays,
                        services: data.services.split(',').map(s => s.trim()).filter(Boolean),
                    },
                    voice: {
                        voiceId: data.voiceId,
                        ttsModel: 'eleven_flash_v2_5',
                        sttLanguage: data.language,
                        stability: 0.5,
                        similarityBoost: 0.75,
                    },
                }),
                signal: AbortSignal.timeout(30_000),
            });

            const responseData = await response.json();

            if (!response.ok) {
                const errMsg = responseData?.error || responseData?.message || `Error: ${response.status}`;
                throw new Error(errMsg);
            }

            try {
                await refreshClaims();
            } catch {
                await new Promise(r => setTimeout(r, 1000));
                await refreshClaims();
            }

            router.push('/knowledge?setup=true');
        } catch (err) {
            const message = err instanceof Error
                ? err.name === 'TimeoutError'
                    ? t('serverTimeout')
                    : err.message
                : t('unknownError');
            setError(`${t('setupFailed')}: ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    }

    const stepLabels = [
        t('steps.company'), t('steps.template'), t('steps.voice'), t('steps.launch')
    ];
    const stepDescs = [
        t('steps.companyDesc'), t('steps.templateDesc'), t('steps.voiceDesc'), t('steps.launchDesc')
    ];

    return (
        <div className="min-h-screen bg-[#080810]">
            {/* Circuit pattern background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d1a] via-[#080810] to-[#0a0010]" />
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-inception-red/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-inception-teal/5 rounded-full blur-3xl" />
                <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="circuit" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 40 20 M 40 60 L 40 80 M 0 40 L 20 40 M 60 40 L 80 40" stroke="#dc2626" strokeWidth="0.5" fill="none"/>
                            <circle cx="40" cy="40" r="3" fill="none" stroke="#dc2626" strokeWidth="0.5"/>
                            <circle cx="40" cy="40" r="1" fill="#dc2626"/>
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#circuit)"/>
                </svg>
            </div>

            {/* Header */}
            <div className="relative border-b border-white/[0.06] bg-[#0a0a14]/90 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-inception-red/10 border border-inception-red/30 flex items-center justify-center">
                            <span className="text-sm font-bold text-inception-red font-display">C</span>
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-white font-display tracking-wider">CALLCEPTION</h1>
                            <p className="text-xs text-white/40">{t('companySetup')}</p>
                        </div>
                    </div>
                    <div className="text-sm text-white/40 font-display tabular-nums">
                        {String(currentStep + 1).padStart(2, '0')} / {String(STEP_IDS.length).padStart(2, '0')}
                    </div>
                </div>

                {/* Progress line */}
                <div className="h-[1px] bg-white/[0.04]">
                    <div
                        className="h-full bg-inception-red transition-all duration-500"
                        style={{ width: `${((currentStep + 1) / STEP_IDS.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Step Tabs */}
            <div className="relative max-w-5xl mx-auto px-6 pt-6">
                <div className="flex items-center gap-1.5">
                    {STEP_IDS.map((_, index) => {
                        const StepIcon = STEP_ICONS[index];
                        const isComplete = index < currentStep;
                        const isCurrent = index === currentStep;
                        return (
                            <div key={index} className="flex-1 flex items-center gap-1.5">
                                <button
                                    onClick={() => index <= currentStep && setCurrentStep(index)}
                                    disabled={index > currentStep}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 text-xs font-medium w-full border
                                        ${isCurrent
                                            ? 'bg-inception-red/10 border-inception-red/40 text-inception-red shadow-sm shadow-inception-red/10'
                                            : isComplete
                                                ? 'bg-white/[0.04] border-white/[0.08] text-white/60 cursor-pointer hover:bg-white/[0.06]'
                                                : 'bg-transparent border-white/[0.04] text-white/20 cursor-not-allowed'
                                        }`}
                                >
                                    {isComplete ? (
                                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-inception-teal" />
                                    ) : (
                                        <StepIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                    )}
                                    <span className="hidden sm:inline truncate font-display tracking-wide">{stepLabels[index]}</span>
                                </button>
                                {index < STEP_IDS.length - 1 && (
                                    <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isComplete ? 'text-inception-teal/60' : 'text-white/10'}`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="relative max-w-5xl mx-auto px-6 py-6">
                <div key={currentStep} className="animate-fade-in-up">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold text-white font-display tracking-wide">{stepLabels[currentStep]}</h2>
                        <p className="text-white/40 mt-1 text-sm">{stepDescs[currentStep]}</p>
                    </div>

                    {error && (
                        <div className="mb-5 p-4 bg-inception-red/10 border border-inception-red/30 rounded-xl flex items-start gap-3">
                            <AlertCircle className="h-4 w-4 text-inception-red flex-shrink-0 mt-0.5" />
                            <p className="text-inception-red text-sm">{error}</p>
                        </div>
                    )}

                    {currentStep === 0 && <StepCompanyInfo data={data} updateData={updateData} />}
                    {currentStep === 1 && <StepTemplateSelection data={data} updateData={updateData} />}
                    {currentStep === 2 && <StepVoiceConfig data={data} updateData={updateData} />}
                    {currentStep === 3 && <StepReview data={data} />}
                </div>
            </div>

            {/* Navigation Footer */}
            <div className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <button
                        onClick={prevStep}
                        disabled={currentStep === 0}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border
                            ${currentStep === 0
                                ? 'opacity-0 cursor-default border-transparent'
                                : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-white/70 hover:text-white'
                            }`}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        {t('back')}
                    </button>

                    {currentStep < STEP_IDS.length - 1 ? (
                        <button
                            onClick={nextStep}
                            disabled={!canProceed()}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all border font-display tracking-wide
                                ${canProceed()
                                    ? 'bg-inception-red border-inception-red text-white shadow-lg shadow-inception-red/20 hover:shadow-inception-red/30 hover:bg-inception-red-light'
                                    : 'bg-white/[0.04] border-white/[0.08] text-white/20 cursor-not-allowed'
                                }`}
                        >
                            {t('continue')}
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-inception-red border border-inception-red text-white shadow-lg shadow-inception-red/25 hover:shadow-inception-red/40 hover:bg-inception-red-light transition-all disabled:opacity-60 font-display tracking-wide"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('creating')}
                                </>
                            ) : (
                                <>
                                    <Rocket className="h-4 w-4" />
                                    {t('launchCompany')}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

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
    const t = useTranslations('onboarding');

    return (
        <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
                <Label className="text-white/70 mb-2 text-sm">
                    {t('companyName')} <span className="text-inception-red">*</span>
                </Label>
                <Input
                    value={data.companyName}
                    onChange={(e) => updateData({ companyName: e.target.value })}
                    placeholder={t('companyNamePlaceholder')}
                    className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50 focus:ring-inception-red/20"
                />
            </div>

            <div>
                <label className="block text-sm text-white/70 mb-3">
                    {t('sector')} <span className="text-inception-red">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {SECTOR_KEYS.map((sectorKey) => {
                        const sectorName = t(`sectors.${sectorKey}`);
                        return (
                            <button
                                key={sectorKey}
                                onClick={() => updateData({ sector: sectorKey })}
                                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border
                                    ${data.sector === sectorKey
                                        ? 'bg-inception-red/10 text-inception-red border-inception-red/40 shadow-sm shadow-inception-red/10'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/[0.12]'
                                    }`}
                            >
                                {sectorName}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-5">
                <div>
                    <label className="block text-sm text-white/70 mb-2">{t('language')}</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: 'tr', flag: '\u{1F1F9}\u{1F1F7}', name: 'Türkçe' },
                            { id: 'en', flag: '\u{1F1EC}\u{1F1E7}', name: 'English' },
                            { id: 'de', flag: '\u{1F1E9}\u{1F1EA}', name: 'Deutsch' },
                            { id: 'fr', flag: '\u{1F1EB}\u{1F1F7}', name: 'Français' },
                        ].map(({ id, flag, name }) => (
                            <button
                                key={id}
                                onClick={() => updateData({ language: id })}
                                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border
                                    ${data.language === id
                                        ? 'bg-inception-red/10 text-inception-red border-inception-red/40 shadow-sm'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-white/80'
                                    }`}
                            >
                                <span className="text-lg">{flag}</span>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('workingHours')}</Label>
                    <Input
                        value={data.workingHours}
                        onChange={(e) => updateData({ workingHours: e.target.value })}
                        placeholder="09:00-18:00"
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
                    />
                </div>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('workingDays')}</Label>
                    <Input
                        value={data.workingDays}
                        onChange={(e) => updateData({ workingDays: e.target.value })}
                        placeholder="Mon-Fri"
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
                    />
                </div>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('services')} <span className="text-white/30 font-normal">({t('servicesHint')})</span></Label>
                    <Input
                        value={data.services}
                        onChange={(e) => updateData({ services: e.target.value })}
                        placeholder={t('servicesPlaceholder')}
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
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
    const t = useTranslations('onboarding');

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {TEMPLATE_DEFS.map((template, idx) => {
                const Icon = template.icon;
                const isSelected = data.template === template.id;
                const sectorKey = template.id;
                return (
                    <button
                        key={template.id}
                        onClick={() => updateData({ template: template.id })}
                        style={{ animationDelay: `${idx * 50}ms` }}
                        className={`relative group p-4 rounded-xl border text-left transition-all duration-300 hover:-translate-y-0.5 animate-fade-in-up
                            ${isSelected
                                ? `${template.borderColor} bg-white/[0.04] shadow-lg ${template.glowColor}`
                                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04]'
                            }`}
                    >
                        {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-inception-red rounded-full flex items-center justify-center shadow-md shadow-inception-red/30">
                                <Check className="h-3 w-3 text-white" />
                            </div>
                        )}
                        <div className={`h-10 w-10 rounded-lg bg-gradient-to-r ${template.color} flex items-center justify-center mb-3 shadow-sm`}>
                            <Icon className="h-5 w-5 text-white" />
                        </div>
                        <h3 className={`font-semibold text-sm mb-1 ${isSelected ? 'text-white' : 'text-white/70'}`}>
                            {t(`sectors.${sectorKey}`)}
                        </h3>
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
    const t = useTranslations('onboarding');

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
            <div className="space-y-5">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    {t('agentIdentity')}
                    <div className="h-px flex-1 bg-white/[0.06]" />
                </h3>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('agentName')}</Label>
                    <Input
                        value={data.agentName}
                        onChange={(e) => updateData({ agentName: e.target.value })}
                        placeholder={t('agentName')}
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
                    />
                </div>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('agentRole')}</Label>
                    <Input
                        value={data.agentRole}
                        onChange={(e) => updateData({ agentRole: e.target.value })}
                        placeholder={t('agentRolePlaceholder')}
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
                    />
                </div>

                <div>
                    <label className="block text-sm text-white/70 mb-2">
                        {t('traits')} <span className="text-white/30 text-xs">({t('traitsMax')})</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {TRAIT_KEYS.map((traitKey) => (
                            <button
                                key={traitKey}
                                onClick={() => toggleTrait(traitKey)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                                    ${data.agentTraits.includes(traitKey)
                                        ? 'bg-inception-red/10 border-inception-red/40 text-inception-red'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:border-white/[0.12] hover:text-white/70'
                                    }`}
                            >
                                {t(`traits_list.${traitKey}`)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-5">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    {t('voiceMessages')}
                    <div className="h-px flex-1 bg-white/[0.06]" />
                </h3>

                <div>
                    <label className="block text-sm text-white/70 mb-2">{t('voiceSelection')}</label>
                    <div className="space-y-2">
                        {VOICE_OPTIONS.map((voice) => (
                            <button
                                key={voice.id}
                                onClick={() => updateData({ voiceId: voice.id })}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                                    ${data.voiceId === voice.id
                                        ? 'border-inception-red/40 bg-inception-red/5'
                                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04]'
                                    }`}
                            >
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold font-display
                                    ${voice.gender === 'female'
                                        ? 'bg-gradient-to-r from-pink-400 to-rose-500 text-white'
                                        : 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white'
                                    }`}>
                                    {voice.name[0]}
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white/80">{voice.name}</div>
                                    <div className="text-xs text-white/30">
                                        {t(voice.gender === 'female' ? 'female' : 'male')} · {voice.tone}
                                    </div>
                                </div>
                                {data.voiceId === voice.id && (
                                    <Check className="h-4 w-4 text-inception-red" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('greeting')}</Label>
                    <Textarea
                        value={data.greeting}
                        onChange={(e) => updateData({ greeting: e.target.value })}
                        placeholder={t('greetingPlaceholder')}
                        rows={3}
                        className="rounded-xl resize-none bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
                    />
                </div>

                <div>
                    <Label className="text-white/70 mb-2 text-sm">{t('farewell')}</Label>
                    <Textarea
                        value={data.farewell}
                        onChange={(e) => updateData({ farewell: e.target.value })}
                        placeholder={t('farewellPlaceholder')}
                        rows={2}
                        className="rounded-xl resize-none bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50"
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
    const t = useTranslations('onboarding');
    const template = TEMPLATE_DEFS.find(td => td.id === data.template);
    const voice = VOICE_OPTIONS.find(v => v.id === data.voiceId);

    const langDisplay: Record<string, string> = {
        tr: '\u{1F1F9}\u{1F1F7} Türkçe',
        en: '\u{1F1EC}\u{1F1E7} English',
        de: '\u{1F1E9}\u{1F1EA} Deutsch',
        fr: '\u{1F1EB}\u{1F1F7} Français',
    };

    return (
        <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-inception-red/10 border border-inception-red/20 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-inception-red" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">{t('companyInfo')}</h3>
                        <p className="text-xs text-white/30">{t('step')} 1</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <ReviewItem label={t('company')} value={data.companyName} />
                    <ReviewItem label={t('sector')} value={data.sector ? t(`sectors.${data.sector}`) : '-'} />
                    <ReviewItem label={t('language')} value={langDisplay[data.language] || data.language} />
                    <ReviewItem label={t('working')} value={`${data.workingDays} ${data.workingHours}`} />
                    {data.services && <ReviewItem label={t('services')} value={data.services} />}
                </div>
            </div>

            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                    {template && (
                        <div className={`h-9 w-9 rounded-lg bg-gradient-to-r ${template.color} flex items-center justify-center`}>
                            <template.icon className="h-4 w-4 text-white" />
                        </div>
                    )}
                    <div>
                        <h3 className="font-semibold text-white text-sm">{t('templateLabel')}</h3>
                        <p className="text-xs text-white/30">{t('step')} 2</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <ReviewItem label={t('selected')} value={data.template ? t(`sectors.${data.template}`) : '-'} />
                </div>
            </div>

            <div className="md:col-span-2 bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <Mic className="h-4 w-4 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">{t('voiceAssistant')}</h3>
                        <p className="text-xs text-white/30">{t('step')} 3</p>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                        <ReviewItem label={t('name')} value={data.agentName} />
                        <ReviewItem label={t('role')} value={data.agentRole} />
                        <ReviewItem label={t('features')} value={data.agentTraits.map(tk => t(`traits_list.${tk}`)).join(', ')} />
                        <ReviewItem label={t('voice')} value={voice ? `${voice.name} (${voice.tone})` : '-'} />
                    </div>
                    <div className="space-y-3">
                        <div>
                            <span className="text-white/30 text-xs uppercase tracking-wide">{t('greeting')}</span>
                            <p className="text-white/60 mt-1 text-xs bg-white/[0.03] rounded-lg p-3 italic border border-white/[0.05]">
                                &ldquo;{data.greeting || `(${t('defaultWillBeUsed')})`}&rdquo;
                            </p>
                        </div>
                        <div>
                            <span className="text-white/30 text-xs uppercase tracking-wide">{t('farewell')}</span>
                            <p className="text-white/60 mt-1 text-xs bg-white/[0.03] rounded-lg p-3 italic border border-white/[0.05]">
                                &ldquo;{data.farewell || t('farewellDefault')}&rdquo;
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="md:col-span-2 bg-inception-red/5 rounded-xl border border-inception-red/20 p-5">
                <div className="flex items-start gap-3">
                    <Rocket className="h-5 w-5 text-inception-red flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-white text-sm font-display tracking-wide">{t('readyToLaunch')}</h4>
                        <p className="text-xs text-white/40 mt-1">{t('launchDescription')}</p>
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
            <span className="text-white/30 min-w-[70px] text-xs">{label}:</span>
            <span className="text-white/70 font-medium text-xs">{value}</span>
        </div>
    );
}
