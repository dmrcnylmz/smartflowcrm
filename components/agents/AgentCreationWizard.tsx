'use client';

/**
 * AgentCreationWizard — 5-Step Agent Creation Wizard (Orchestrator)
 *
 * Steps:
 * 0: Template Selection (10 industry templates + "Start from Scratch")
 * 1: Identity (name, role, language)
 * 2: Customize (variables with smart auto-fill, prompt preview, advanced settings)
 * 3: Knowledge Base (optional text/URL knowledge sources)
 * 4: Review (summary cards, create button)
 *
 * Sub-components live in ./wizard/ for maintainability.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, ChevronLeft, Loader2, X, Sparkles,
    Wand2, Check, AlertTriangle, MessageCircle, BookOpen,
} from 'lucide-react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';
import { useTenantSettings } from '@/lib/hooks/useTenantSettings';
import { useAgentKBCheck } from '@/lib/hooks/useAgentKBCheck';
import { useTranslations } from 'next-intl';
import { AgentTestPanel } from '@/components/agents/AgentTestPanel';
import { getTemplateById } from '@/lib/agents/templates';
import type { AgentVariable, FallbackRule, AgentVoiceConfig } from '@/lib/agents/types';
import { DEFAULT_VOICE_CONFIG } from '@/lib/agents/types';

// Wizard sub-components
import {
    StepTemplateSelection,
    StepIdentity,
    StepCustomize,
    StepKnowledgeBase,
    StepReview,
    SuccessScreen,
    WIZARD_STEPS,
    stepTransitionVariants,
} from './wizard';

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
    const t = useTranslations('agents');
    const { settings: tenantSettings, resolveSmartVariables, isSmartVariable, getSmartValue } = useTenantSettings();

    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
    const [showTestPanel, setShowTestPanel] = useState(false);

    // KB document IDs added during wizard (before agent exists)
    const [wizardKbDocIds, setWizardKbDocIds] = useState<string[]>([]);
    // Tenant-level KB check (for SuccessScreen guidance)
    const { hasKB: tenantHasKB } = useAgentKBCheck(undefined);
    // KB skip warning when moving past Step 3 without adding KB
    const [showKBSkipWarning, setShowKBSkipWarning] = useState(false);

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
            setWizardKbDocIds([]);
            setShowKBSkipWarning(false);
        }
    }, [open]);

    // Apply template
    const handleSelectTemplate = useCallback((templateId: string | null) => {
        setSelectedTemplateId(templateId);

        if (!templateId) {
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

    // Track step direction for animation
    const [stepDirection, setStepDirection] = useState(0);

    // Can proceed validation
    const canProceed = useCallback((): boolean => {
        switch (currentStep) {
            case 0: return selectedTemplateId !== null;
            case 1: return !!agentName.trim();
            case 2: return !!systemPrompt.trim();
            case 3: return true; // Knowledge Base is optional
            case 4: return true;
            default: return false;
        }
    }, [currentStep, selectedTemplateId, agentName, systemPrompt]);

    // Navigation
    const nextStep = () => {
        if (currentStep < WIZARD_STEPS.length - 1) {
            // Show KB skip warning when leaving step 3 without KB docs
            if (currentStep === 3 && wizardKbDocIds.length === 0 && !showKBSkipWarning) {
                setShowKBSkipWarning(true);
                return;
            }
            setShowKBSkipWarning(false);
            setStepDirection(1);
            setCurrentStep(prev => prev + 1);
        }
    };
    const prevStep = () => {
        if (currentStep > 0) {
            setShowKBSkipWarning(false);
            setStepDirection(-1);
            setCurrentStep(prev => prev - 1);
        }
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
                throw new Error(data.error || t('wizard.creationFailed'));
            }

            const data = await response.json();

            // Link KB documents added during wizard to the new agent
            if (wizardKbDocIds.length > 0 && data.id) {
                authFetch('/api/knowledge', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ documentIds: wizardKbDocIds, agentId: data.id }),
                }).catch(() => { /* best-effort — docs still accessible tenant-wide */ });
            }

            toast({
                title: t('wizard.agentCreated'),
                description: t('wizard.agentCreatedDesc', { name: agentName }),
            });
            setCreatedAgentId(data.id);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('wizard.unknownError');
            setError(msg);
            toast({ title: t('voiceTest.errorLabel'), description: msg, variant: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!open) return null;

    // ── Render step content ──
    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return <StepTemplateSelection selectedId={selectedTemplateId} onSelect={handleSelectTemplate} />;
            case 1:
                return (
                    <StepIdentity
                        agentName={agentName} setAgentName={setAgentName}
                        agentRole={agentRole} setAgentRole={setAgentRole}
                        language={language} setLanguage={setLanguage}
                        selectedTemplateId={selectedTemplateId}
                    />
                );
            case 2:
                return (
                    <StepCustomize
                        variables={variables} setVariables={setVariables}
                        systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt}
                        resolvedPrompt={resolvedPrompt}
                        voiceConfig={voiceConfig} setVoiceConfig={setVoiceConfig}
                        fallbackRules={fallbackRules} setFallbackRules={setFallbackRules}
                        showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
                        isSmartVariable={isSmartVariable} getSmartValue={getSmartValue}
                        language={language} authFetch={authFetch}
                        isEnterprise={tenantSettings?.subscriptionPlan === 'enterprise'}
                    />
                );
            case 3:
                return (
                    <StepKnowledgeBase
                        agentName={agentName} authFetch={authFetch}
                        onDocumentAdded={(docId) => setWizardKbDocIds(prev => [...prev, docId])}
                    />
                );
            case 4:
                return (
                    <StepReview
                        agentName={agentName} agentRole={agentRole} language={language}
                        selectedTemplateId={selectedTemplateId} variables={variables}
                        voiceConfig={voiceConfig} fallbackRules={fallbackRules}
                        resolvedPrompt={resolvedPrompt}
                    />
                );
            default:
                return null;
        }
    };

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
                            <h1 className="text-base font-bold text-white font-display tracking-wider">{t('wizard.title')}</h1>
                            <p className="text-xs text-white/40">{t('wizard.subtitle')}</p>
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
                {/* Animated Progress Bar */}
                <div className="h-[2px] bg-white/[0.04]">
                    <motion.div
                        className="h-full bg-inception-red"
                        animate={{ width: `${((currentStep + 1) / WIZARD_STEPS.length) * 100}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
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
                    <AnimatePresence mode="wait" custom={stepDirection}>
                        {!createdAgentId ? (
                            <motion.div
                                key={currentStep}
                                custom={stepDirection}
                                variants={stepTransitionVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
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

                                {/* KB Skip Warning */}
                                {showKBSkipWarning && currentStep === 3 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl"
                                    >
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <h4 className="text-sm font-semibold text-amber-300">
                                                    {t('wizard.kbSkipWarningTitle')}
                                                </h4>
                                                <p className="text-xs text-amber-200/60 mt-1 leading-relaxed">
                                                    {t('wizard.kbSkipWarningDesc')}
                                                </p>
                                                <div className="flex items-center gap-3 mt-3">
                                                    <button
                                                        onClick={() => setShowKBSkipWarning(false)}
                                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all"
                                                    >
                                                        <BookOpen className="h-3 w-3" />
                                                        {t('wizard.kbSkipAddKB')}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowKBSkipWarning(false);
                                                            setStepDirection(1);
                                                            setCurrentStep(prev => prev + 1);
                                                        }}
                                                        className="text-xs text-white/40 hover:text-white/60 transition-colors"
                                                    >
                                                        {t('wizard.kbSkipContinue')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Step Content */}
                                {renderStep()}
                            </motion.div>
                        ) : !showTestPanel ? (
                            <SuccessScreen
                                agentName={agentName}
                                onTestClick={() => setShowTestPanel(true)}
                                onDoneClick={() => onComplete(createdAgentId)}
                                hasKB={wizardKbDocIds.length > 0 ? true : tenantHasKB}
                                onAddKBClick={() => {
                                    setShowTestPanel(false);
                                    setCreatedAgentId(null);
                                    setCurrentStep(3);
                                }}
                            />
                        ) : (
                            /* Test Panel (inline after creation) */
                            <motion.div
                                key="test-panel"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-4"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-white/70">
                                        {t('wizard.testPanel', { name: agentName })}
                                    </h3>
                                    <button
                                        onClick={() => onComplete(createdAgentId)}
                                        className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
                                    >
                                        {t('wizard.backToAgents')}
                                        <ChevronRight className="h-3 w-3" />
                                    </button>
                                </div>
                                <AgentTestPanel
                                    agentId={createdAgentId}
                                    agentName={agentName}
                                    templateId={selectedTemplateId || undefined}
                                    systemPrompt={resolvedPrompt}
                                    voiceConfig={{ ...voiceConfig, language }}
                                    inline
                                    onAddKB={() => {
                                        // Navigate back to KB step in wizard
                                        setShowTestPanel(false);
                                        setCreatedAgentId(null);
                                        setCurrentStep(3);
                                    }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
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
                            {t('wizard.back')}
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
                                {t('wizard.continueBtn')}
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
                                        {t('wizard.creating')}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        {t('wizard.createBtn')}
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
