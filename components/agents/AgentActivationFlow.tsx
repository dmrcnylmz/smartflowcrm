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
} from 'lucide-react';

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

const PHONE_COUNTRIES = [
    { code: 'TR', flag: '🇹🇷', name: 'Türkiye', description: 'SIP trunk havuzundan (ücretsiz)', badge: 'Önerilen' },
    { code: 'US', flag: '🇺🇸', name: 'ABD', description: '~$1.15/ay', badge: null },
    { code: 'GB', flag: '🇬🇧', name: 'İngiltere', description: '~$1.15/ay', badge: null },
    { code: 'DE', flag: '🇩🇪', name: 'Almanya', description: '~$1.15/ay', badge: null },
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
    const [step, setStep] = useState(1);
    const [subscriptionOk, setSubscriptionOk] = useState<boolean | null>(null);
    const [planName, setPlanName] = useState('');
    const [checkingSubscription, setCheckingSubscription] = useState(true);
    const [availableNumbers, setAvailableNumbers] = useState<PhoneNumber[]>([]);
    const [loadingNumbers, setLoadingNumbers] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [isNewNumber, setIsNewNumber] = useState(false);
    const [activating, setActivating] = useState(false);
    const [activated, setActivated] = useState(false);

    const authFetch = useAuthFetch();
    const { toast } = useToast();

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setStep(1);
            setSubscriptionOk(null);
            setCheckingSubscription(true);
            setAvailableNumbers([]);
            setSelectedNumber(null);
            setSelectedCountry(null);
            setIsNewNumber(false);
            setActivating(false);
            setActivated(false);
            checkSubscription();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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
                throw new Error(data.message || 'Aktivasyon başarısız');
            }

            setActivated(true);
            toast({
                title: 'Asistan Canlıda! 🎉',
                description: `"${agent.name}" artık ${data.phoneNumber} numarasında çağrı yanıtlıyor.`,
            });

            // Brief delay for animation, then close
            setTimeout(() => {
                onActivated();
                onOpenChange(false);
            }, 2000);

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Aktivasyon başarısız';
            toast({ title: 'Hata', description: msg, variant: 'error' });
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
                        Asistanı Canlıya Al
                    </DialogTitle>
                    <DialogDescription>
                        &quot;{agent.name}&quot; asistanını gerçek çağrıları yanıtlamak üzere aktifleştir.
                    </DialogDescription>
                </DialogHeader>

                {/* Step indicators */}
                <div className="flex items-center gap-2 py-2">
                    {[1, 2, 3].map((s) => (
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
                    {step === 1 && (
                        <StepSubscriptionCheck
                            checking={checkingSubscription}
                            subscriptionOk={subscriptionOk}
                            planName={planName}
                            onContinue={goToStep2}
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
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
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
}: {
    checking: boolean;
    subscriptionOk: boolean | null;
    planName: string;
    onContinue: () => void;
}) {
    if (checking) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-sm text-muted-foreground">Abonelik durumu kontrol ediliyor...</p>
            </div>
        );
    }

    if (!subscriptionOk) {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-sm">Aktif Abonelik Gerekli</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            Asistanı canlıya almak için aktif bir ödeme planınız olmalıdır.
                            Asistanı ücretsiz test edebilirsiniz, ancak gerçek çağrıları yanıtlaması için abonelik gereklidir.
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
                        Plan Seçin
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
                    <h4 className="font-semibold text-sm">Abonelik Aktif</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                        {planName ? `Plan: ${planName}` : 'Ödeme planınız aktif.'} — Asistanı canlıya almaya hazırsınız.
                    </p>
                </div>
            </div>
            <div className="flex justify-end">
                <Button onClick={onContinue} className="gap-2">
                    Devam Et
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
}: {
    loading: boolean;
    availableNumbers: PhoneNumber[];
    selectedNumber: string | null;
    selectedCountry: string | null;
    isNewNumber: boolean;
    onSelectExisting: (phone: string) => void;
    onSelectNew: (country: string) => void;
    onContinue: () => void;
}) {
    const canContinue = !!selectedNumber || !!selectedCountry;

    return (
        <div className="space-y-4">
            {/* Existing unassigned numbers */}
            {loading ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Numaralar yükleniyor...</span>
                </div>
            ) : availableNumbers.length > 0 ? (
                <div className="space-y-2">
                    <label className="text-sm font-medium">Mevcut Numaralar</label>
                    <p className="text-xs text-muted-foreground">Atanmamış bir numaranızı kullanabilirsiniz.</p>
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
                    <label className="text-sm font-medium">Yeni Numara Al</label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {PHONE_COUNTRIES.map((country) => (
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
                            {country.badge && (
                                <span className="absolute -top-1.5 right-2 bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                    {country.badge}
                                </span>
                            )}
                            <span className="text-lg">{country.flag}</span>
                            <div>
                                <div className="text-xs font-medium">{country.name}</div>
                                <div className="text-[10px] text-muted-foreground">{country.description}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <Button onClick={onContinue} disabled={!canContinue} className="gap-2">
                    Devam Et
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
}: {
    agentName: string;
    selectedNumber: string | null;
    selectedCountry: string | null;
    isNewNumber: boolean;
    activating: boolean;
    activated: boolean;
    onActivate: () => void;
}) {
    if (activated) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center animate-in zoom-in-50 duration-500">
                    <CheckCircle className="h-8 w-8 text-emerald-500" />
                </div>
                <div className="text-center">
                    <h3 className="font-bold text-lg">Asistan Canlıda! 🎉</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        &quot;{agentName}&quot; artık gerçek çağrıları yanıtlıyor.
                    </p>
                </div>
            </div>
        );
    }

    const numberDisplay = selectedNumber
        ? selectedNumber
        : isNewNumber && selectedCountry
            ? `Yeni ${PHONE_COUNTRIES.find(c => c.code === selectedCountry)?.name || selectedCountry} numarası`
            : '—';

    return (
        <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-xl border space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-violet-500" />
                    Aktivasyon Özeti
                </h4>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Asistan</span>
                        <span className="font-medium">{agentName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Telefon Numarası</span>
                        <span className="font-mono text-xs">{numberDisplay}</span>
                    </div>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Bu asistan, atanan telefon numarasına gelen tüm aramaları yanıtlayacaktır.
                İstediğiniz zaman &quot;Devre Dışı Bırak&quot; ile deaktif edebilirsiniz.
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
                            Aktifleştiriliyor...
                        </>
                    ) : (
                        <>
                            <Rocket className="h-4 w-4" />
                            Canlıya Al
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
