'use client';

/**
 * PhoneManagementTab — Tenant Phone Number Management
 *
 * Features:
 * - List tenant's phone numbers with provider badges
 * - Provision new numbers (country picker → API call)
 * - Porting request form (BYON workflow)
 * - Release number (with confirmation)
 *
 * Used in admin/page.tsx Phone tab (lazy-loaded).
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
    Phone, Plus, Trash2, Loader2, Globe, RefreshCw,
    ArrowRightLeft, CheckCircle, Clock, AlertTriangle, XCircle,
} from 'lucide-react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';

// =============================================
// Types
// =============================================

interface PhoneNumber {
    phoneNumber: string;
    tenantId: string;
    providerType: 'TWILIO_NATIVE' | 'SIP_TRUNK';
    sipCarrier?: string;
    country: string;
    isActive: boolean;
    monthlyRate?: number;
}

interface PortingRequest {
    id: string;
    phoneNumber: string;
    currentCarrier: string;
    targetCarrier: string;
    status: string;
    notes?: string;
    adminNotes?: string;
    estimatedCompletionDate?: string;
}

// =============================================
// Component
// =============================================

export default function PhoneManagementTab() {
    const authFetch = useAuthFetch();
    const { toast } = useToast();

    // State
    const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
    const [portingRequests, setPortingRequests] = useState<PortingRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [provisioning, setProvisioning] = useState(false);
    const [releasing, setReleasing] = useState<string | null>(null);

    // Provision form
    const [showProvisionForm, setShowProvisionForm] = useState(false);
    const [provisionCountry, setProvisionCountry] = useState('TR');

    // Porting form
    const [showPortingForm, setShowPortingForm] = useState(false);
    const [portingPhone, setPortingPhone] = useState('');
    const [portingCarrier, setPortingCarrier] = useState('');
    const [portingTarget, setPortingTarget] = useState<'netgsm' | 'bulutfon'>('netgsm');
    const [portingNotes, setPortingNotes] = useState('');
    const [submittingPorting, setSubmittingPorting] = useState(false);

    // ─── Fetch Data ───
    const fetchData = useCallback(async () => {
        try {
            const [numbersRes, portingRes] = await Promise.all([
                authFetch('/api/phone/numbers'),
                authFetch('/api/phone/porting'),
            ]);

            if (numbersRes.ok) {
                const data = await numbersRes.json();
                setNumbers(data.numbers || []);
            }

            if (portingRes.ok) {
                const data = await portingRes.json();
                setPortingRequests(data.requests || []);
            }
        } catch {
            // Silent
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ─── Provision Number ───
    async function handleProvision() {
        setProvisioning(true);
        try {
            const res = await authFetch('/api/phone/provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: provisionCountry }),
            });

            const data = await res.json();
            if (res.ok) {
                toast({ title: 'Numara Alındı', description: `${data.phoneNumber?.phoneNumber} başarıyla tahsis edildi`, variant: 'success' });
                setShowProvisionForm(false);
                fetchData();
            } else {
                toast({ title: 'Hata', description: data.error || 'Numara alınamadı', variant: 'error' });
            }
        } catch {
            toast({ title: 'Hata', description: 'Numara alınırken bir sorun oluştu', variant: 'error' });
        } finally {
            setProvisioning(false);
        }
    }

    // ─── Release Number ───
    async function handleRelease(phoneNumber: string) {
        if (!confirm(`${phoneNumber} numarasını serbest bırakmak istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;

        setReleasing(phoneNumber);
        try {
            const res = await authFetch('/api/phone/numbers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber }),
            });

            if (res.ok) {
                toast({ title: 'Numara Serbest Bırakıldı', description: `${phoneNumber} başarıyla kaldırıldı`, variant: 'success' });
                fetchData();
            } else {
                const data = await res.json();
                toast({ title: 'Hata', description: data.error || 'Numara serbest bırakılamadı', variant: 'error' });
            }
        } catch {
            toast({ title: 'Hata', description: 'İşlem sırasında bir sorun oluştu', variant: 'error' });
        } finally {
            setReleasing(null);
        }
    }

    // ─── Submit Porting Request ───
    async function handlePortingSubmit() {
        if (!portingPhone || !portingCarrier) return;

        setSubmittingPorting(true);
        try {
            const res = await authFetch('/api/phone/porting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber: portingPhone,
                    currentCarrier: portingCarrier,
                    targetCarrier: portingTarget,
                    notes: portingNotes,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                toast({ title: 'Taşıma Talebi Oluşturuldu', description: 'Numara taşıma talebiniz alındı. Durum güncellemeleri için bu sayfayı takip edin.', variant: 'success' });
                setShowPortingForm(false);
                setPortingPhone('');
                setPortingCarrier('');
                setPortingNotes('');
                fetchData();
            } else {
                toast({ title: 'Hata', description: data.error || 'Taşıma talebi oluşturulamadı', variant: 'error' });
            }
        } catch {
            toast({ title: 'Hata', description: 'İşlem sırasında bir sorun oluştu', variant: 'error' });
        } finally {
            setSubmittingPorting(false);
        }
    }

    // ─── Loading ───
    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-48 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header + Actions */}
            <Card className="rounded-2xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Phone className="h-5 w-5 text-emerald-500" />
                                Telefon Numaraları
                            </CardTitle>
                            <CardDescription>
                                İşletmenize atanmış telefon numaraları ve numara yönetimi
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Yenile
                            </Button>
                            <Button size="sm" onClick={() => setShowProvisionForm(!showProvisionForm)} className="gap-2">
                                <Plus className="h-3.5 w-3.5" />
                                Numara Al
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setShowPortingForm(!showPortingForm)} className="gap-2">
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                Numara Taşı
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Provision Form */}
                    {showProvisionForm && (
                        <div className="border rounded-xl p-4 mb-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                            <h4 className="text-sm font-medium">Yeni Numara Al</h4>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <Label htmlFor="provCountry">Ülke</Label>
                                    <select
                                        id="provCountry"
                                        value={provisionCountry}
                                        onChange={(e) => setProvisionCountry(e.target.value)}
                                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="TR">🇹🇷 Türkiye (+90) — SIP Trunk</option>
                                        <option value="US">🇺🇸 ABD (+1) — Twilio</option>
                                        <option value="GB">🇬🇧 İngiltere (+44) — Twilio</option>
                                        <option value="DE">🇩🇪 Almanya (+49) — Twilio</option>
                                        <option value="NL">🇳🇱 Hollanda (+31) — Twilio</option>
                                    </select>
                                </div>
                                <Button onClick={handleProvision} disabled={provisioning} className="gap-2">
                                    {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {provisionCountry === 'TR' ? 'Havuzdan Al' : 'Satın Al'}
                                </Button>
                                <Button variant="ghost" onClick={() => setShowProvisionForm(false)}>
                                    İptal
                                </Button>
                            </div>
                            {provisionCountry === 'TR' && (
                                <p className="text-xs text-muted-foreground">
                                    Türkiye numaraları önceden satın alınmış havuzdan atanır (SIP Trunk).
                                </p>
                            )}
                        </div>
                    )}

                    {/* Porting Form */}
                    {showPortingForm && (
                        <div className="border rounded-xl p-4 mb-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                            <h4 className="text-sm font-medium">Numara Taşıma (BYON)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="portPhone">Taşınacak Numara</Label>
                                    <Input
                                        id="portPhone"
                                        value={portingPhone}
                                        onChange={(e) => setPortingPhone(e.target.value)}
                                        placeholder="+90 5XX XXX XX XX"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="portCarrier">Mevcut Operatör</Label>
                                    <Input
                                        id="portCarrier"
                                        value={portingCarrier}
                                        onChange={(e) => setPortingCarrier(e.target.value)}
                                        placeholder="Turkcell, Vodafone, vb."
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="portTarget">Hedef Operatör</Label>
                                    <select
                                        id="portTarget"
                                        value={portingTarget}
                                        onChange={(e) => setPortingTarget(e.target.value as 'netgsm' | 'bulutfon')}
                                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1"
                                    >
                                        <option value="netgsm">Netgsm</option>
                                        <option value="bulutfon">Bulutfon</option>
                                    </select>
                                </div>
                                <div>
                                    <Label htmlFor="portNotes">Notlar (opsiyonel)</Label>
                                    <Input
                                        id="portNotes"
                                        value={portingNotes}
                                        onChange={(e) => setPortingNotes(e.target.value)}
                                        placeholder="Ek bilgi..."
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handlePortingSubmit} disabled={submittingPorting || !portingPhone || !portingCarrier} className="gap-2">
                                    {submittingPorting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                                    Taşıma Talebi Oluştur
                                </Button>
                                <Button variant="ghost" onClick={() => setShowPortingForm(false)}>
                                    İptal
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Numbers List */}
                    {numbers.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">Henüz atanmış numara yok</p>
                            <p className="text-xs mt-1">
                                &ldquo;Numara Al&rdquo; butonuyla yeni bir numara edinin
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {numbers.map((num) => (
                                <div key={num.phoneNumber} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                            <Phone className="h-5 w-5 text-emerald-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-mono font-medium">{num.phoneNumber}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <ProviderBadge providerType={num.providerType} sipCarrier={num.sipCarrier} />
                                                <span className="text-xs text-muted-foreground">{num.country}</span>
                                                {num.monthlyRate !== undefined && (
                                                    <span className="text-xs text-muted-foreground">${num.monthlyRate}/ay</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRelease(num.phoneNumber)}
                                        disabled={releasing === num.phoneNumber}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                    >
                                        {releasing === num.phoneNumber
                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : <Trash2 className="h-4 w-4" />
                                        }
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Porting Requests */}
            {portingRequests.length > 0 && (
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ArrowRightLeft className="h-5 w-5 text-blue-500" />
                            Numara Taşıma Talepleri
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="divide-y">
                            {portingRequests.map((req) => (
                                <div key={req.id} className="flex items-center justify-between py-3">
                                    <div>
                                        <p className="text-sm font-mono font-medium">{req.phoneNumber}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {req.currentCarrier} → {req.targetCarrier}
                                        </p>
                                        {req.adminNotes && (
                                            <p className="text-xs text-blue-500 mt-0.5">{req.adminNotes}</p>
                                        )}
                                    </div>
                                    <PortingStatusBadge status={req.status} />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// =============================================
// Sub-components
// =============================================

function ProviderBadge({ providerType, sipCarrier }: { providerType: string; sipCarrier?: string }) {
    if (providerType === 'SIP_TRUNK') {
        return (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">
                SIP {sipCarrier ? `(${sipCarrier})` : ''}
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-600">
            <Globe className="h-2.5 w-2.5 mr-0.5" />
            Twilio
        </Badge>
    );
}

function PortingStatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; icon: React.ElementType; className: string }> = {
        pending: { label: 'Beklemede', icon: Clock, className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
        submitted: { label: 'Gönderildi', icon: CheckCircle, className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
        in_progress: { label: 'İşleniyor', icon: Loader2, className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
        completed: { label: 'Tamamlandı', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
        rejected: { label: 'Reddedildi', icon: XCircle, className: 'bg-red-500/10 text-red-600 border-red-500/20' },
    };

    const c = config[status] || config.pending;
    const Icon = c.icon;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.className}`}>
            <Icon className={`h-3 w-3 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
            {c.label}
        </span>
    );
}
