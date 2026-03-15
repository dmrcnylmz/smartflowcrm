'use client';

/**
 * AgentActivationFlow — 3-Step Agent Go-Live Modal
 *
 * Step 1: Subscription Check (active plan required)
 * Step 2: Phone Number Selection (existing unassigned or new provisioning)
 * Step 3: Confirmation & Activation
 */

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';
import {
    CheckCircle,
    XCircle,
    Loader2,
    Phone,
    Zap,
    Rocket,
    ArrowRight,
    CreditCard,
    Plus,
    PhoneCall,
    BookOpen,
    AlertTriangle,
} from 'lucide-react';
import { useAgentKBCheck } from '@/lib/hooks/useAgentKBCheck';
import { useTranslations } from 'next-intl';

// =============================================
// Types
// =============================================

interface AgentInfo {
    id: string;
    name: string;
}

interface PhoneNumber {
    phoneNumber: string;
    country: string;
    providerType: string;
    agentId?: string;
}

const PHONE_COUNTRIES_BASE = [
    { code: 'TR', flag: '🇹🇷', nameKey: 'activation.countryTR' as const, descriptionKey: 'activation.sipTrunkFree' as const, hasBadge: true },
    { code: 'US', flag: '🇺🇸', nameKey: 'activation.countryUS' as const, description: '~$1.15/ay', hasBadge: false },
    { code: 'GB', flag: '🇬🇧', nameKey: 'activation.countryGB' as const, description: '~$1.15/ay', hasBadge: false },
    { code: 'DE', flag: '🇩🇪', nameKey: 'activation.countryDE' as const, description: '~$1.15/ay', hasBadge: false },
];

// =============================================
// Component
// =============================================

export function AgentActivationFlow({
    agent,
    open,
    onOpenChange,
    onActivated,
}: {
    agent: AgentInfo;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onActivated: () => void;
}) {
    const [step, setStep] = useState(0);
    const [subscriptionOk, setSubscriptionOk] = useState<boolean | null>(null);
    const [planName, setPlanName] = useState('');
    const [checkingSubscription, setCheckingSubscription] = useState(true);

    // KB check
    const { hasKB, isChecking: checkingKB, documentCount } = useAgentKBCheck(agent.id);
    const [availableNumbers, setAvailableNumbers] = useState<PhoneNumber[]>([]);
    const [loadingNumbers, setLoadingNumbers] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [isNewNumber, setIsNewNumber] = useState(false);
    const [activating, setActivating] = useState(false);
    const [activated, setActivated] = useState(false);

    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const t = useTranslations('agents');

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setStep(0);
            setSubscriptionOk(null);
            setCheckingSubscription(true);
            setAvailableNumbers([]);
            setSelectedNumber(null);
            setSelectedCountry(null);
            setIsNewNumber(false);
            setActivating(false);
            setActivated(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Start subscription check when KB check passes (step 0 → 1)
    useEffect(() => {
        if (open && step === 1) {
            checkSubscription();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, step]);

    // ── Step 1: Subscription Check ─────────────────────────────────────
    async function checkSubscription() {
        setCheckingSubscription(true);
        try {
            const res = await authFetch('/api/billing/subscription');
            if (res.ok) {
                const data = await res.json();
                const isActive = data.status === 'active' || data.status === 'on_trial';
                setSubscriptionOk(isActive);
                setPlanName(data.planName || data.planId || '');
            } else {
                setSubscriptionOk(false);
            }
        } catch {
            setSubscriptionOk(false);
        } finally {
            setCheckingSubscription(false);
        }
    }

    // ── Step 2: Load Available Numbers ─────────────────────────────────
    async function loadAvailableNumbers() {
        setLoadingNumbers(true);
        try {
            const res = await authFetch('/api/phone/numbers?unassigned=true');
            if (res.ok) {
                const data = await res.json();
                setAvailableNumbers(data.numbers || []);
            }
        } catch {
            // Silently handle — user can still provision new number
        } finally {
            setLoadingNumbers(false);
        }
    }

    function goToStep1() {
        setStep(1);
    }

    function goToStep2() {
        setStep(2);
        loadAvailableNumbers();
    }

    function selectExistingNumber(phoneNumber: string) {
        setSelectedNumber(phoneNumber);
        setSelectedCountry(null);
        setIsNewNumber(false);
    }

    function selectNewNumber(country: string) {
        setSelectedNumber(null);
        setSelectedCountry(country);
        setIsNewNumber(true);
    }

    function goToStep3() {
        if (!selectedNumber && !selectedCountry) return;
        setStep(3);
    }

    // ── Step 3: Activate ───────────────────────────────────────────────
    async function handleActivate() {
        setActivating(true);
        try {
            const body: Record<string, string> = { agentId: agent.id };
            if (selectedNumber) {
                body.phoneNumber = selectedNumber;
            } else if (selectedCountry) {
                body.phoneCountry = selectedCountry;
            }

            const res = await authFetch('/api/agents/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || t('activation.activationFailed'));
            }

            setActivated(true);
            toast({
                title: t('activation.agentLive'),
                description: t('activation.agentLiveDesc', { name: agent.name, phone: data.phoneNumber }),
            });

            // Brief delay for animation, then close
            setTimeout(() => {
                onActivated();
                onOpenChange(false);
            }, 2000);

        } catch (err) {
            const msg = err instanceof Error ? err.message : t('activation.activationFailed');
            toast({ title: t('voiceTest.errorLabel'), description: msg, variant: 'error' });
        } finally {
            setActivating(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-violet-500" />
                        {t('activation.goLiveTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('activation.goLiveDesc', { name: agent.name })}
                    </DialogDescription>
                </DialogHeader>

                {/* Step indicators */}
                <div className="flex items-center gap-2 py-2">
                    {[0, 1, 2, 3].map((s) => (
                        <div key={s} className="flex items-center gap-2 flex-1">
                            <div className={`h-2 flex-1 rounded-full transition-colors ${
                                s <= step
                                    ? s < step ? 'bg-emerald-500' : 'bg-violet-500'
                                    : 'bg-muted'
                            }`} />
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="min-h-[200px]">
                    {step === 0 && (
                        <StepKBCheck
                            checkingKB={checkingKB}
                            hasKB={hasKB}
                            documentCount={documentCount}
                            onContinue={goToStep1}
                            t={t}
                        />
                    )}
                    {step === 1 && (
                        <StepSubscriptionCheck
                            checking={checkingSubscription}
                            subscriptionOk={subscriptionOk}
                            planName={planName}
                            onContinue={goToStep2}
                            t={t}
                        />
                    )}
                    {step === 2 && (
                        <StepPhoneSelection
                            loading={loadingNumbers}
                            availableNumbers={availableNumbers}
                            selectedNumber={selectedNumber}
                            selectedCountry={selectedCountry}
                            isNewNumber={isNewNumber}
                            onSelectExisting={selectExistingNumber}
                            onSelectNew={selectNewNumber}
                            onContinue={goToStep3}
                            t={t}
                        />
                    )}
                    {step === 3 && (
                        <StepConfirmation
                            agentName={agent.name}
                            selectedNumber={selectedNumber}
                            selectedCountry={selectedCountry}
                            isNewNumber={isNewNumber}
                            activating={activating}
                            activated={activated}
                            onActivate={handleActivate}
                            t={t}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// =============================================
// Step 0: KB Check
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFunc = (key: string, values?: Record<string, any>) => string;

function StepKBCheck({
    checkingKB,
    hasKB,
    documentCount,
    onContinue,
    t,
}: {
    checkingKB: boolean;
    hasKB: boolean | null;
    documentCount: number;
    onContinue: () => void;
    t: TFunc;
}) {
    if (checkingKB || hasKB === null) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-sm text-muted-foreground">{t('activation.checkingKB')}</p>
            </div>
        );
    }

    if (!hasKB) {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-sm">{t('activation.kbRequired')}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('activation.kbRequiredDesc')}
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button
                        variant="default"
                        onClick={() => window.location.href = '/knowledge'}
                        className="gap-2"
                    >
                        <BookOpen className="h-4 w-4" />
                        {t('activation.addKnowledge')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-sm">{t('activation.kbReady')}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('activation.kbReadyDesc', { count: documentCount })}
                    </p>
                </div>
            </div>
            <div className="flex justify-end">
                <Button onClick={onContinue} className="gap-2">
                    {t('activation.continue')}
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// =============================================
// Step 1: Subscription Check
// =============================================

function StepSubscriptionCheck({
    checking,
    subscriptionOk,
    planName,
    onContinue,
    t,
}: {
    checking: boolean;
    subscriptionOk: boolean | null;
    planName: string;
    onContinue: () => void;
    t: TFunc;
}) {
    if (checking) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-sm text-muted-foreground">{t('activation.checkingSubscription')}</p>
            </div>
        );
    }

    if (!subscriptionOk) {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-sm">{t('activation.subscriptionRequired')}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('activation.subscriptionRequiredDesc')}
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button
                        variant="default"
                        onClick={() => window.location.href = '/billing'}
                        className="gap-2"
                    >
                        <CreditCard className="h-4 w-4" />
                        {t('activation.selectPlan')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-sm">{t('activation.subscriptionActive')}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                        {planName ? t('activation.planLabel', { name: planName }) : t('activation.subscriptionActiveDesc')} — {t('activation.subscriptionReadyDesc')}
                    </p>
                </div>
            </div>
            <div className="flex justify-end">
                <Button onClick={onContinue} className="gap-2">
                    {t('activation.continue')}
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// =============================================
// Step 2: Phone Number Selection
// =============================================

function StepPhoneSelection({
    loading,
    availableNumbers,
    selectedNumber,
    selectedCountry,
    isNewNumber,
    onSelectExisting,
    onSelectNew,
    onContinue,
    t,
}: {
    loading: boolean;
    availableNumbers: PhoneNumber[];
    selectedNumber: string | null;
    selectedCountry: string | null;
    isNewNumber: boolean;
    onSelectExisting: (phone: string) => void;
    onSelectNew: (country: string) => void;
    onContinue: () => void;
    t: TFunc;
}) {
    const canContinue = !!selectedNumber || !!selectedCountry;

    return (
        <div className="space-y-4">
            {/* Existing unassigned numbers */}
            {loading ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">{t('activation.loadingNumbers')}</span>
                </div>
            ) : availableNumbers.length > 0 ? (
                <div className="space-y-2">
                    <label className="text-sm font-medium">{t('activation.existingNumbers')}</label>
                    <p className="text-xs text-muted-foreground">{t('activation.existingNumbersDesc')}</p>
                    <div className="grid gap-2 max-h-[120px] overflow-y-auto">
                        {availableNumbers.map((num) => (
                            <button
                                key={num.phoneNumber}
                                onClick={() => onSelectExisting(num.phoneNumber)}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all text-sm
                                    ${selectedNumber === num.phoneNumber && !isNewNumber
                                        ? 'border-violet-500 bg-violet-500/10'
                                        : 'border-border hover:border-violet-500/50 hover:bg-violet-500/5'
                                    }
                                `}
                            >
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono">{num.phoneNumber}</span>
                                <Badge variant="outline" className="ml-auto text-[10px]">
                                    {num.country}
                                </Badge>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* New number provisioning */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    <label className="text-sm font-medium">{t('activation.getNewNumber')}</label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {PHONE_COUNTRIES_BASE.map((country) => (
                        <button
                            key={country.code}
                            onClick={() => onSelectNew(country.code)}
                            className={`relative flex items-center gap-2.5 p-3 rounded-lg border transition-all text-left
                                ${isNewNumber && selectedCountry === country.code
                                    ? 'border-violet-500 bg-violet-500/10'
                                    : 'border-border hover:border-violet-500/50 hover:bg-violet-500/5'
                                }
                            `}
                        >
                            {country.hasBadge && (
                                <span className="absolute -top-1.5 right-2 bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                    {t('activation.recommended')}
                                </span>
                            )}
                            <span className="text-lg">{country.flag}</span>
                            <div>
                                <div className="text-xs font-medium">{t(country.nameKey)}</div>
                                <div className="text-[10px] text-muted-foreground">{country.descriptionKey ? t(country.descriptionKey) : country.description}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <Button onClick={onContinue} disabled={!canContinue} className="gap-2">
                    {t('activation.continue')}
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// =============================================
// Step 3: Confirmation
// =============================================

function StepConfirmation({
    agentName,
    selectedNumber,
    selectedCountry,
    isNewNumber,
    activating,
    activated,
    onActivate,
    t,
}: {
    agentName: string;
    selectedNumber: string | null;
    selectedCountry: string | null;
    isNewNumber: boolean;
    activating: boolean;
    activated: boolean;
    onActivate: () => void;
    t: TFunc;
}) {
    if (activated) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center animate-in zoom-in-50 duration-500">
                    <CheckCircle className="h-8 w-8 text-emerald-500" />
                </div>
                <div className="text-center">
                    <h3 className="font-bold text-lg">{t('activation.agentLive')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('activation.agentNowLive', { name: agentName })}
                    </p>
                </div>
            </div>
        );
    }

    const countryNameKey = PHONE_COUNTRIES_BASE.find(c => c.code === selectedCountry)?.nameKey;
    const numberDisplay = selectedNumber
        ? selectedNumber
        : isNewNumber && selectedCountry
            ? t('activation.newNumberLabel', { country: countryNameKey ? t(countryNameKey) : selectedCountry })
            : '—';

    return (
        <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-xl border space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-violet-500" />
                    {t('activation.activationSummary')}
                </h4>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('activation.assistant')}</span>
                        <span className="font-medium">{agentName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('activation.phoneNumber')}</span>
                        <span className="font-mono text-xs">{numberDisplay}</span>
                    </div>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                {t('activation.activationNote')}
            </p>

            <div className="flex justify-end">
                <Button
                    onClick={onActivate}
                    disabled={activating}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                    {activating ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('activation.activating')}
                        </>
                    ) : (
                        <>
                            <Rocket className="h-4 w-4" />
                            {t('activation.goLiveBtn')}
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
