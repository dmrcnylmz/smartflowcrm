'use client';

/**
 * AgentCreationWizard — 4-Step Agent Creation Wizard
 *
 * Steps:
 * 0: Template Selection (10 industry templates + "Start from Scratch")
 * 1: Identity (name, role, language)
 * 2: Customize (variables with smart auto-fill, prompt preview, advanced settings)
 * 3: Review (summary cards, create button)
 *
 * Pattern: Follows app/onboarding/page.tsx (full-page overlay, progress bar, fixed nav)
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    ChevronRight, ChevronLeft, Check, Loader2, X, Sparkles,
    HeartPulse, ShoppingBag, Briefcase, Headphones, GraduationCap,
    Utensils, Home as HomeIcon, Car, Scale, Shield,
    Bot, Wand2, Globe, Volume2, AlertTriangle, ChevronDown, ChevronUp,
    Code2, Eye, CheckCircle, Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';
import { useTenantSettings } from '@/lib/hooks/useTenantSettings';
import { AgentTestPanel } from '@/components/agents/AgentTestPanel';
import { AGENT_TEMPLATES, getTemplateById } from '@/lib/agents/templates';
import type { AgentVariable, FallbackRule, AgentVoiceConfig, AgentTemplate, AgentDraft } from '@/lib/agents/types';
import { VOICE_STYLES, AGENT_LANGUAGES, DEFAULT_VOICE_CONFIG } from '@/lib/agents/types';

// =============================================
// Icon Map (string → component)
// =============================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    HeartPulse, ShoppingBag, Briefcase, Headphones, GraduationCap,
    Utensils, Home: HomeIcon, Car, Scale, Shield,
};

function getIcon(iconName: string) {
    return ICON_MAP[iconName] || Bot;
}

// =============================================
// Wizard Steps
// =============================================

const WIZARD_STEPS = [
    { id: 'template', label: 'Sablon Secimi', icon: Sparkles, description: 'Sektorunuze uygun sablonu secin' },
    { id: 'identity', label: 'Kimlik', icon: Bot, description: 'Asistanin adi, rolu ve dili' },
    { id: 'customize', label: 'Ozellestir', icon: Wand2, description: 'Degiskenleri doldurun ve prompt\'u onizleyin' },
    { id: 'review', label: 'Inceleme', icon: Eye, description: 'Son kontrol ve olusturma' },
];

// =============================================
// Props
// =============================================

interface AgentCreationWizardProps {
    open: boolean;
    onComplete: (agentId: string) => void;
    onCancel: () => void;
}

// =============================================
// Main Component
// =============================================

export function AgentCreationWizard({ open, onComplete, onCancel }: AgentCreationWizardProps) {
    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const { settings: tenantSettings, resolveSmartVariables, isSmartVariable, getSmartValue } = useTenantSettings();

    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
    const [showTestPanel, setShowTestPanel] = useState(false);

    // Draft state
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [agentName, setAgentName] = useState('');
    const [agentRole, setAgentRole] = useState('assistant');
    const [language, setLanguage] = useState('tr');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [variables, setVariables] = useState<AgentVariable[]>([]);
    const [voiceConfig, setVoiceConfig] = useState<AgentVoiceConfig>(DEFAULT_VOICE_CONFIG);
    const [fallbackRules, setFallbackRules] = useState<FallbackRule[]>([]);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Reset state when opened
    useEffect(() => {
        if (open) {
            setCurrentStep(0);
            setSelectedTemplateId(null);
            setAgentName('');
            setAgentRole('assistant');
            setLanguage('tr');
            setSystemPrompt('');
            setVariables([]);
            setVoiceConfig(DEFAULT_VOICE_CONFIG);
            setFallbackRules([]);
            setShowAdvanced(false);
            setError(null);
            setCreatedAgentId(null);
            setShowTestPanel(false);
        }
    }, [open]);

    // Apply template
    const handleSelectTemplate = useCallback((templateId: string | null) => {
        setSelectedTemplateId(templateId);

        if (!templateId) {
            // "Start from scratch"
            setAgentName('');
            setAgentRole('assistant');
            setSystemPrompt('');
            setVariables([]);
            setFallbackRules([]);
            setVoiceConfig(DEFAULT_VOICE_CONFIG);
            return;
        }

        const template = getTemplateById(templateId);
        if (!template) return;

        setAgentName(template.defaultName);
        setAgentRole(template.defaultRole);
        setSystemPrompt(template.systemPrompt);
        setVoiceConfig(template.voiceConfig);
        setFallbackRules(template.fallbackRules);

        // Auto-fill variables from tenant settings
        const resolved = resolveSmartVariables(template.variables);
        setVariables(resolved);
    }, [resolveSmartVariables]);

    // Build resolved prompt (replace variables)
    const resolvedPrompt = useMemo(() => {
        let prompt = systemPrompt;
        variables.forEach(v => {
            const regex = new RegExp(`\\{${v.key}\\}`, 'g');
            prompt = prompt.replace(regex, v.defaultValue || `{${v.key}}`);
        });
        return prompt;
    }, [systemPrompt, variables]);

    // Can proceed validation
    const canProceed = useCallback((): boolean => {
        switch (currentStep) {
            case 0: return selectedTemplateId !== null; // template selected (null for scratch is allowed via separate button)
            case 1: return !!agentName.trim();
            case 2: return !!systemPrompt.trim();
            case 3: return true;
            default: return false;
        }
    }, [currentStep, selectedTemplateId, agentName, systemPrompt]);

    // Navigation
    const nextStep = () => {
        if (currentStep < WIZARD_STEPS.length - 1) setCurrentStep(prev => prev + 1);
    };
    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    };

    // Submit — create agent
    const handleCreate = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const body = {
                name: agentName.trim(),
                role: agentRole,
                systemPrompt: resolvedPrompt,
                variables,
                voiceConfig: { ...voiceConfig, language },
                fallbackRules,
                isActive: true,
                templateId: selectedTemplateId || undefined,
                templateColor: selectedTemplateId
                    ? getTemplateById(selectedTemplateId)?.color
                    : undefined,
            };

            const response = await authFetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Asistan olusturulamadi.');
            }

            const data = await response.json();
            toast({
                title: 'Asistan Olusturuldu',
                description: `${agentName} basariyla olusturuldu.`,
            });
            setCreatedAgentId(data.id);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
            setError(msg);
            toast({ title: 'Hata', description: msg, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-[#080810] overflow-hidden flex flex-col">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d1a] via-[#080810] to-[#0a0010]" />
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-inception-red/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-inception-teal/5 rounded-full blur-3xl" />
                <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="circuit-wizard" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 40 20 M 40 60 L 40 80 M 0 40 L 20 40 M 60 40 L 80 40" stroke="#dc2626" strokeWidth="0.5" fill="none"/>
                            <circle cx="40" cy="40" r="3" fill="none" stroke="#dc2626" strokeWidth="0.5"/>
                            <circle cx="40" cy="40" r="1" fill="#dc2626"/>
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#circuit-wizard)"/>
                </svg>
            </div>

            {/* Header */}
            <div className="relative border-b border-white/[0.06] bg-[#0a0a14]/90 backdrop-blur-xl">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-inception-red/10 border border-inception-red/30 flex items-center justify-center">
                            <Wand2 className="h-5 w-5 text-inception-red" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-white font-display tracking-wider">ASISTAN SIHIRBAZI</h1>
                            <p className="text-xs text-white/40">Yeni asistan olustur</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-white/40 font-display tabular-nums">
                            {String(currentStep + 1).padStart(2, '0')} / {String(WIZARD_STEPS.length).padStart(2, '0')}
                        </div>
                        <button
                            onClick={onCancel}
                            className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-all"
                        >
                            <X className="h-4 w-4 text-white/50" />
                        </button>
                    </div>
                </div>
                {/* Progress */}
                <div className="h-[1px] bg-white/[0.04]">
                    <div
                        className="h-full bg-inception-red transition-all duration-500"
                        style={{ width: `${((currentStep + 1) / WIZARD_STEPS.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Step Tabs */}
            <div className="relative max-w-5xl mx-auto px-6 pt-4 w-full">
                <div className="flex items-center gap-1.5">
                    {WIZARD_STEPS.map((step, index) => {
                        const StepIcon = step.icon;
                        const isComplete = index < currentStep;
                        const isCurrent = index === currentStep;
                        return (
                            <div key={step.id} className="flex-1 flex items-center gap-1.5">
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
                                    <span className="hidden sm:inline truncate font-display tracking-wide">{step.label}</span>
                                </button>
                                {index < WIZARD_STEPS.length - 1 && (
                                    <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isComplete ? 'text-inception-teal/60' : 'text-white/10'}`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div className="relative flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto px-6 py-6">
                    <div key={currentStep} className="animate-fade-in-up">
                        {/* Step Title */}
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-white font-display tracking-wide">{WIZARD_STEPS[currentStep].label}</h2>
                            <p className="text-white/40 mt-1 text-sm">{WIZARD_STEPS[currentStep].description}</p>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mb-5 p-4 bg-inception-red/10 border border-inception-red/30 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="h-4 w-4 text-inception-red flex-shrink-0 mt-0.5" />
                                <p className="text-inception-red text-sm">{error}</p>
                            </div>
                        )}

                        {/* Step Content */}
                        {currentStep === 0 && (
                            <StepTemplateSelection
                                selectedId={selectedTemplateId}
                                onSelect={handleSelectTemplate}
                            />
                        )}
                        {currentStep === 1 && (
                            <StepIdentity
                                agentName={agentName}
                                setAgentName={setAgentName}
                                agentRole={agentRole}
                                setAgentRole={setAgentRole}
                                language={language}
                                setLanguage={setLanguage}
                                selectedTemplateId={selectedTemplateId}
                            />
                        )}
                        {currentStep === 2 && (
                            <StepCustomize
                                variables={variables}
                                setVariables={setVariables}
                                systemPrompt={systemPrompt}
                                setSystemPrompt={setSystemPrompt}
                                resolvedPrompt={resolvedPrompt}
                                voiceConfig={voiceConfig}
                                setVoiceConfig={setVoiceConfig}
                                fallbackRules={fallbackRules}
                                setFallbackRules={setFallbackRules}
                                showAdvanced={showAdvanced}
                                setShowAdvanced={setShowAdvanced}
                                isSmartVariable={isSmartVariable}
                                getSmartValue={getSmartValue}
                            />
                        )}
                        {currentStep === 3 && !createdAgentId && (
                            <StepReview
                                agentName={agentName}
                                agentRole={agentRole}
                                language={language}
                                selectedTemplateId={selectedTemplateId}
                                variables={variables}
                                voiceConfig={voiceConfig}
                                fallbackRules={fallbackRules}
                                resolvedPrompt={resolvedPrompt}
                            />
                        )}

                        {/* Success Screen (after creation) */}
                        {createdAgentId && !showTestPanel && (
                            <div className="text-center py-8 animate-fade-in-up">
                                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-6">
                                    <Check className="h-10 w-10 text-emerald-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white font-display tracking-wide mb-2">Tebrikler!</h2>
                                <p className="text-white/50 max-w-md mx-auto mb-8">
                                    <span className="text-white font-medium">{agentName}</span> basariyla olusturuldu.
                                    Simdi test ederek dogru calistigini dogrulayabilirsiniz.
                                </p>
                                <div className="flex items-center justify-center gap-4">
                                    <button
                                        onClick={() => setShowTestPanel(true)}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-violet-600 border border-violet-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:bg-violet-500 transition-all font-display tracking-wide"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        Simdi Test Et
                                    </button>
                                    <button
                                        onClick={() => onComplete(createdAgentId)}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-white/70 hover:text-white transition-all"
                                    >
                                        Asistanlar Sayfasina Don
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Test Panel (inline after creation) */}
                        {createdAgentId && showTestPanel && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-white/70">
                                        {agentName} Test Paneli
                                    </h3>
                                    <button
                                        onClick={() => onComplete(createdAgentId)}
                                        className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
                                    >
                                        Asistanlar Sayfasina Don
                                        <ChevronRight className="h-3 w-3" />
                                    </button>
                                </div>
                                <AgentTestPanel
                                    agentId={createdAgentId}
                                    agentName={agentName}
                                    templateId={selectedTemplateId || undefined}
                                    systemPrompt={resolvedPrompt}
                                    inline
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Navigation Footer — hidden after creation */}
            {!createdAgentId && (
                <div className="relative border-t border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl">
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
                            Geri
                        </button>

                        {currentStep < WIZARD_STEPS.length - 1 ? (
                            <button
                                onClick={nextStep}
                                disabled={!canProceed()}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all border font-display tracking-wide
                                    ${canProceed()
                                        ? 'bg-inception-red border-inception-red text-white shadow-lg shadow-inception-red/20 hover:shadow-inception-red/30 hover:bg-inception-red-light'
                                        : 'bg-white/[0.04] border-white/[0.08] text-white/20 cursor-not-allowed'
                                    }`}
                            >
                                Devam Et
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleCreate}
                                disabled={isSubmitting || !canProceed()}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-inception-red border border-inception-red text-white shadow-lg shadow-inception-red/25 hover:shadow-inception-red/40 hover:bg-inception-red-light transition-all disabled:opacity-60 font-display tracking-wide"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Olusturuluyor...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Asistani Olustur
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================
// Step 0: Template Selection
// =============================================

function StepTemplateSelection({
    selectedId,
    onSelect,
}: {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
}) {
    return (
        <div className="space-y-4">
            {/* From Scratch Option */}
            <button
                onClick={() => onSelect('scratch')}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 text-left hover:-translate-y-0.5
                    ${selectedId === 'scratch'
                        ? 'border-white/20 bg-white/[0.06] shadow-lg shadow-white/5'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04]'
                    }`}
            >
                {selectedId === 'scratch' && (
                    <div className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-inception-red rounded-full flex items-center justify-center shadow-md shadow-inception-red/30">
                        <Check className="h-3 w-3 text-white" />
                    </div>
                )}
                <div className="h-12 w-12 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
                    <Code2 className="h-6 w-6 text-white/50" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-sm text-white/80">Sifirdan Olustur</h3>
                    <p className="text-xs text-white/30 mt-0.5">Bos bir sayfa ile baslayip kendi prompt'unuzu yazin</p>
                </div>
                {selectedId === 'scratch' && <CheckCircle className="h-5 w-5 text-inception-red flex-shrink-0" />}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-xs text-white/30 font-display tracking-widest">VEYA SABLON SECIN</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
            </div>

            {/* Template Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {AGENT_TEMPLATES.map((template, idx) => {
                    const Icon = getIcon(template.icon);
                    const isSelected = selectedId === template.id;
                    return (
                        <button
                            key={template.id}
                            onClick={() => onSelect(template.id)}
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
                            <h3 className={`font-semibold text-sm mb-1 ${isSelected ? 'text-white' : 'text-white/70'}`}>{template.name}</h3>
                            <p className="text-xs text-white/30 line-clamp-2 leading-relaxed">{template.description}</p>
                            {/* Features */}
                            <div className="mt-2 flex flex-wrap gap-1">
                                {template.features.slice(0, 2).map(f => (
                                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">{f}</span>
                                ))}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// =============================================
// Step 1: Identity
// =============================================

function StepIdentity({
    agentName, setAgentName,
    agentRole, setAgentRole,
    language, setLanguage,
    selectedTemplateId,
}: {
    agentName: string;
    setAgentName: (v: string) => void;
    agentRole: string;
    setAgentRole: (v: string) => void;
    language: string;
    setLanguage: (v: string) => void;
    selectedTemplateId: string | null;
}) {
    const template = selectedTemplateId ? getTemplateById(selectedTemplateId) : null;

    const ROLES = [
        { value: 'receptionist', label: 'Resepsiyonist' },
        { value: 'support', label: 'Musteri Destek' },
        { value: 'consultant', label: 'Danisman' },
        { value: 'sales', label: 'Satis Temsilcisi' },
        { value: 'assistant', label: 'Genel Asistan' },
    ];

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Left: Form */}
            <div className="space-y-6">
                {/* Template badge */}
                {template && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${template.borderColor} bg-white/[0.03]`}>
                        {(() => { const Icon = getIcon(template.icon); return <Icon className="h-3.5 w-3.5 text-white/60" />; })()}
                        <span className="text-xs text-white/60">{template.name} sablonu</span>
                    </div>
                )}

                {/* Agent Name */}
                <div>
                    <Label className="text-white/70 mb-2 text-sm">
                        Asistan Adi <span className="text-inception-red">*</span>
                    </Label>
                    <Input
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="orn: Ayse, Destek Asistani"
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50 focus:ring-inception-red/20"
                    />
                    <p className="text-xs text-white/20 mt-1.5">Musterilerinizin asistani taniyacagi isim</p>
                </div>

                {/* Agent Role */}
                <div>
                    <label className="block text-sm text-white/70 mb-3">Rol</label>
                    <div className="grid grid-cols-2 gap-2">
                        {ROLES.map(r => (
                            <button
                                key={r.value}
                                onClick={() => setAgentRole(r.value)}
                                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border
                                    ${agentRole === r.value
                                        ? 'bg-inception-red/10 text-inception-red border-inception-red/40 shadow-sm shadow-inception-red/10'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/[0.12]'
                                    }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Language */}
                <div>
                    <label className="block text-sm text-white/70 mb-2">Dil</label>
                    <div className="flex gap-2">
                        {AGENT_LANGUAGES.slice(0, 2).map(({ value, label, flag }) => (
                            <button
                                key={value}
                                onClick={() => setLanguage(value)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border
                                    ${language === value
                                        ? 'bg-inception-red/10 text-inception-red border-inception-red/40 shadow-sm'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-white/80'
                                    }`}
                            >
                                <span className="text-lg">{flag}</span>
                                {label.split(' ')[1] || label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Preview */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 flex flex-col items-center justify-center text-center">
                <div className={`h-20 w-20 rounded-2xl flex items-center justify-center mb-4 ${template ? `bg-gradient-to-r ${template.color}` : 'bg-white/[0.06] border border-white/[0.10]'}`}>
                    {template ? (
                        (() => { const Icon = getIcon(template.icon); return <Icon className="h-10 w-10 text-white" />; })()
                    ) : (
                        <Bot className="h-10 w-10 text-white/30" />
                    )}
                </div>
                <h3 className="text-lg font-bold text-white font-display tracking-wide">
                    {agentName || 'Asistan Adi'}
                </h3>
                <p className="text-sm text-white/40 mt-1">
                    {ROLES.find(r => r.value === agentRole)?.label || agentRole}
                </p>
                <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="bg-white/[0.04] border-white/[0.08] text-white/50 text-xs">
                        <Globe className="h-3 w-3 mr-1" />
                        {AGENT_LANGUAGES.find(l => l.value === language)?.flag} {language.toUpperCase()}
                    </Badge>
                    {template && (
                        <Badge variant="outline" className={`${template.borderColor} text-white/50 text-xs`}>
                            {template.name}
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
}

// =============================================
// Step 2: Customize
// =============================================

function StepCustomize({
    variables, setVariables,
    systemPrompt, setSystemPrompt,
    resolvedPrompt,
    voiceConfig, setVoiceConfig,
    fallbackRules, setFallbackRules,
    showAdvanced, setShowAdvanced,
    isSmartVariable, getSmartValue,
}: {
    variables: AgentVariable[];
    setVariables: (v: AgentVariable[]) => void;
    systemPrompt: string;
    setSystemPrompt: (v: string) => void;
    resolvedPrompt: string;
    voiceConfig: AgentVoiceConfig;
    setVoiceConfig: (v: AgentVoiceConfig) => void;
    fallbackRules: FallbackRule[];
    setFallbackRules: (v: FallbackRule[]) => void;
    showAdvanced: boolean;
    setShowAdvanced: (v: boolean) => void;
    isSmartVariable: (key: string) => boolean;
    getSmartValue: (key: string) => string | null;
}) {
    const [showPrompt, setShowPrompt] = useState(false);

    const updateVariable = (index: number, value: string) => {
        const updated = [...variables];
        updated[index] = { ...updated[index], defaultValue: value };
        setVariables(updated);
    };

    const addVariable = () => {
        setVariables([...variables, { key: '', label: '', defaultValue: '' }]);
    };

    const updateVariableField = (index: number, field: keyof AgentVariable, value: string) => {
        const updated = [...variables];
        updated[index] = { ...updated[index], [field]: value };
        setVariables(updated);
    };

    const removeVariable = (index: number) => {
        setVariables(variables.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-6">
            {/* Variables Section */}
            {variables.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <div className="h-px flex-1 bg-white/[0.06]" />
                        Degiskenler
                        <div className="h-px flex-1 bg-white/[0.06]" />
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {variables.map((v, i) => {
                            const isSmart = isSmartVariable(v.key);
                            const smartValue = isSmart ? getSmartValue(v.key) : null;
                            const autoFilled = isSmart && smartValue && v.defaultValue === smartValue;

                            return (
                                <div key={i} className="relative">
                                    <Label className="text-white/70 mb-1.5 text-sm flex items-center gap-2">
                                        {v.label || v.key}
                                        {autoFilled && (
                                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                <CheckCircle className="h-2.5 w-2.5" />
                                                Otomatik
                                            </span>
                                        )}
                                    </Label>
                                    <Input
                                        value={v.defaultValue}
                                        onChange={(e) => updateVariable(i, e.target.value)}
                                        placeholder={`{${v.key}}`}
                                        className={`h-10 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50 text-sm
                                            ${autoFilled ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Prompt Preview / Editor */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
                        <div className="h-px w-8 bg-white/[0.06]" />
                        Sistem Prompt'u
                    </h3>
                    <button
                        onClick={() => setShowPrompt(!showPrompt)}
                        className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
                    >
                        {showPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {showPrompt ? 'Gizle' : 'Duzenle'}
                    </button>
                </div>

                {showPrompt ? (
                    <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={12}
                        className="rounded-xl resize-none bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50 text-sm font-mono"
                        placeholder="Asistan icin sistem prompt'unu yazin..."
                    />
                ) : (
                    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 max-h-48 overflow-y-auto">
                        <pre className="text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed">
                            {resolvedPrompt || 'Henuz prompt yazilmadi...'}
                        </pre>
                    </div>
                )}
            </div>

            {/* Advanced Settings Toggle */}
            <div>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
                >
                    {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Gelismis Ayarlar (Ses, Kurallar)
                </button>

                {showAdvanced && (
                    <div className="mt-4 space-y-6 animate-fade-in-up">
                        {/* Voice Config */}
                        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-4">
                            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
                                <Volume2 className="h-3.5 w-3.5" />
                                Ses Ayarlari
                            </h4>
                            <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-white/50 text-xs mb-1">Konusma Stili</Label>
                                    <select
                                        value={voiceConfig.style}
                                        onChange={(e) => setVoiceConfig({ ...voiceConfig, style: e.target.value })}
                                        className="w-full h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 focus:outline-none focus:border-inception-red/50"
                                    >
                                        {VOICE_STYLES.map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-white/50 text-xs mb-1">Sicaklik ({voiceConfig.temperature})</Label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={voiceConfig.temperature}
                                        onChange={(e) => setVoiceConfig({ ...voiceConfig, temperature: parseFloat(e.target.value) })}
                                        className="w-full mt-2 accent-inception-red"
                                    />
                                </div>
                                <div>
                                    <Label className="text-white/50 text-xs mb-1">Maks Token</Label>
                                    <Input
                                        type="number"
                                        value={voiceConfig.maxTokens}
                                        onChange={(e) => setVoiceConfig({ ...voiceConfig, maxTokens: parseInt(e.target.value) || 512 })}
                                        className="h-9 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Fallback Rules */}
                        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Yedek Kurallar
                                </h4>
                                <button
                                    onClick={() => setFallbackRules([...fallbackRules, { condition: '', action: 'inform', value: '' }])}
                                    className="text-xs text-inception-red hover:text-inception-red-light flex items-center gap-1"
                                >
                                    <Plus className="h-3 w-3" /> Kural Ekle
                                </button>
                            </div>
                            {fallbackRules.map((rule, i) => (
                                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
                                    <div>
                                        <Label className="text-white/40 text-[10px]">Kosul</Label>
                                        <Input
                                            value={rule.condition}
                                            onChange={(e) => {
                                                const updated = [...fallbackRules];
                                                updated[i] = { ...updated[i], condition: e.target.value };
                                                setFallbackRules(updated);
                                            }}
                                            className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                            placeholder="orn: Acil durum"
                                        />
                                    </div>
                                    <select
                                        value={rule.action}
                                        onChange={(e) => {
                                            const updated = [...fallbackRules];
                                            updated[i] = { ...updated[i], action: e.target.value };
                                            setFallbackRules(updated);
                                        }}
                                        className="h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs px-2"
                                    >
                                        <option value="inform">Bilgilendir</option>
                                        <option value="transfer">Transfer</option>
                                        <option value="escalate">Yukselt</option>
                                    </select>
                                    <div>
                                        <Label className="text-white/40 text-[10px]">Yanit</Label>
                                        <Input
                                            value={rule.value}
                                            onChange={(e) => {
                                                const updated = [...fallbackRules];
                                                updated[i] = { ...updated[i], value: e.target.value };
                                                setFallbackRules(updated);
                                            }}
                                            className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                            placeholder="Yanit mesaji"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setFallbackRules(fallbackRules.filter((_, idx) => idx !== i))}
                                        className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-red-500/10 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {fallbackRules.length === 0 && (
                                <p className="text-xs text-white/20 text-center py-2">Henuz kural eklenmedi</p>
                            )}
                        </div>

                        {/* Custom Variables (add new) */}
                        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Ozel Degiskenler</h4>
                                <button
                                    onClick={addVariable}
                                    className="text-xs text-inception-red hover:text-inception-red-light flex items-center gap-1"
                                >
                                    <Plus className="h-3 w-3" /> Degisken Ekle
                                </button>
                            </div>
                            {variables.filter(v => !isSmartVariable(v.key)).map((v, idx) => {
                                const realIndex = variables.indexOf(v);
                                return (
                                    <div key={realIndex} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                                        <div>
                                            <Label className="text-white/40 text-[10px]">Anahtar</Label>
                                            <Input
                                                value={v.key}
                                                onChange={(e) => updateVariableField(realIndex, 'key', e.target.value)}
                                                className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs font-mono"
                                                placeholder="degisken_adi"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-white/40 text-[10px]">Etiket</Label>
                                            <Input
                                                value={v.label}
                                                onChange={(e) => updateVariableField(realIndex, 'label', e.target.value)}
                                                className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                                placeholder="Degisken Etiketi"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-white/40 text-[10px]">Deger</Label>
                                            <Input
                                                value={v.defaultValue}
                                                onChange={(e) => updateVariable(realIndex, e.target.value)}
                                                className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                                placeholder="Varsayilan deger"
                                            />
                                        </div>
                                        <button
                                            onClick={() => removeVariable(realIndex)}
                                            className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-red-500/10 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================
// Step 3: Review
// =============================================

function StepReview({
    agentName, agentRole, language, selectedTemplateId,
    variables, voiceConfig, fallbackRules, resolvedPrompt,
}: {
    agentName: string;
    agentRole: string;
    language: string;
    selectedTemplateId: string | null;
    variables: AgentVariable[];
    voiceConfig: AgentVoiceConfig;
    fallbackRules: FallbackRule[];
    resolvedPrompt: string;
}) {
    const template = selectedTemplateId && selectedTemplateId !== 'scratch' ? getTemplateById(selectedTemplateId) : null;

    const ROLES: Record<string, string> = {
        receptionist: 'Resepsiyonist',
        support: 'Musteri Destek',
        consultant: 'Danisman',
        sales: 'Satis Temsilcisi',
        assistant: 'Genel Asistan',
    };

    return (
        <div className="grid md:grid-cols-2 gap-4">
            {/* Identity Summary */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${template ? `bg-gradient-to-r ${template.color}` : 'bg-inception-red/10 border border-inception-red/20'}`}>
                        {template ? (
                            (() => { const Icon = getIcon(template.icon); return <Icon className="h-4 w-4 text-white" />; })()
                        ) : (
                            <Bot className="h-4 w-4 text-inception-red" />
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">Asistan Kimli\u011fi</h3>
                        <p className="text-xs text-white/30">Adim 1-2</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <ReviewItem label="Ad" value={agentName} />
                    <ReviewItem label="Rol" value={ROLES[agentRole] || agentRole} />
                    <ReviewItem label="Dil" value={AGENT_LANGUAGES.find(l => l.value === language)?.label || language} />
                    {template && <ReviewItem label="Sablon" value={template.name} />}
                    <ReviewItem label="Ses Stili" value={VOICE_STYLES.find(s => s.value === voiceConfig.style)?.label || voiceConfig.style} />
                </div>
            </div>

            {/* Variables Summary */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <Code2 className="h-4 w-4 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">Degiskenler & Kurallar</h3>
                        <p className="text-xs text-white/30">{variables.length} degisken, {fallbackRules.length} kural</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    {variables.map((v, i) => (
                        <ReviewItem key={i} label={v.label || v.key} value={v.defaultValue || '(bos)'} />
                    ))}
                    {variables.length === 0 && (
                        <p className="text-xs text-white/20">Degisken tanimlanmadi</p>
                    )}
                </div>
            </div>

            {/* Prompt Preview */}
            <div className="md:col-span-2 bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-inception-teal/10 border border-inception-teal/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-inception-teal" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">Sistem Prompt'u</h3>
                        <p className="text-xs text-white/30">{resolvedPrompt.length} karakter</p>
                    </div>
                </div>
                <div className="bg-white/[0.02] rounded-lg border border-white/[0.04] p-4 max-h-40 overflow-y-auto">
                    <pre className="text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed">
                        {resolvedPrompt || 'Prompt henuz yazilmadi'}
                    </pre>
                </div>
            </div>

            {/* Ready Banner */}
            <div className="md:col-span-2 bg-inception-red/5 rounded-xl border border-inception-red/20 p-5">
                <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-inception-red flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-white text-sm font-display tracking-wide">OLUSTURMAYA HAZIR</h4>
                        <p className="text-xs text-white/40 mt-1">
                            &quot;Asistani Olustur&quot; butonuna tikladiginizda asistaniz kaydedilecek ve kullanima hazir hale gelecek.
                            Olusturduktan sonra test edebilir ve ayarlarini duzenleyebilirsiniz.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================
// Helper
// =============================================

function ReviewItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className="text-white/30 min-w-[80px] text-xs">{label}:</span>
            <span className="text-white/70 font-medium text-xs">{value}</span>
        </div>
    );
}
