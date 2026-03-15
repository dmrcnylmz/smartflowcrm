'use client';

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Switch } from '@/components/ui/switch';
import {
    Shield, Users, Settings, Activity, Database, Server,
    Building2, Bot, Phone, Globe, Save, Loader2,
    Key, Eye, EyeOff, CheckCircle, XCircle, Mic,
    Mail, Bell, FileText, Palette,
    RefreshCw, Copy, Zap, ChevronDown, Clock, AlertTriangle,
    UserCheck, Crown, UserCog, UserX,
} from 'lucide-react';

// Lazy-loaded components
const PhoneManagementTab = lazy(() => import('@/components/admin/phone-management'));
const ThemeSettingsTab = lazy(() => import('@/components/admin/ThemeSettingsTab'));

// =============================================
// Types
// =============================================

interface TenantMember {
    uid: string;
    role: string;
    email?: string;
    displayName?: string;
    assignedAt?: string;
}

interface TenantSettings {
    companyName: string;
    companyEmail: string;
    companyPhone: string;
    companyWebsite: string;
    language: string;
    timezone: string;
    // AI Assistant
    agentName: string;
    agentGreeting: string;
    agentPersonality: string;
    agentFallbackMessage: string;
    // Settings
    assistantEnabled: boolean;
    callRecording: boolean;
    emailNotifications: boolean;
    autoAppointments: boolean;
    // System
    twilioConfigured: boolean;
    openaiConfigured: boolean;
    subscriptionPlan: string;
    subscriptionStatus: string;
}

const defaultSettings: TenantSettings = {
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyWebsite: '',
    language: 'tr',
    timezone: 'Europe/Istanbul',
    agentName: 'Callception Asistan',
    agentGreeting: 'Merhaba, size nasıl yardımcı olabilirim?',
    agentPersonality: 'Profesyonel, yardımsever ve nazik bir asistan. Türkçe konuşur.',
    agentFallbackMessage: 'Anlayamadım, tekrar eder misiniz?',
    assistantEnabled: false,
    callRecording: false,
    emailNotifications: true,
    autoAppointments: true,
    twilioConfigured: false,
    openaiConfigured: false,
    subscriptionPlan: 'free_trial',
    subscriptionStatus: 'active',
};

// =============================================
// Component
// =============================================

export default function AdminPage() {
    const { user } = useAuth();
    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [settings, setSettings] = useState<TenantSettings>(defaultSettings);
    const [activeTab, setActiveTab] = useState<'company' | 'assistant' | 'features' | 'phone' | 'users' | 'system' | 'theme'>('company');
    const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);
    const [members, setMembers] = useState<TenantMember[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);

    // ─── Fetch Settings ───
    const fetchSettings = useCallback(async () => {
        try {
            setError(null);
            const [settingsRes, healthRes, aiRes] = await Promise.all([
                authFetch('/api/tenant/settings'),
                fetch('/api/health'),
                fetch('/api/ai/status'),
            ]);

            // Load tenant settings
            if (settingsRes.ok) {
                const data = await settingsRes.json();
                if (data.settings) {
                    setSettings(prev => ({ ...prev, ...data.settings }));
                }
            }

            // Health status — parse config flags for integration display
            if (healthRes.ok) {
                const health = await healthRes.json();
                setHealthData(health);
                // Update integration flags from health response
                setSettings(prev => ({
                    ...prev,
                    twilioConfigured: health?.config?.twilio === 'configured',
                    openaiConfigured: health?.config?.openai === 'configured',
                }));
            }

            // AI status — override openai flag if AI endpoint gives more detail
            const aiData = aiRes.ok ? await aiRes.json() : {};
            if (aiData?.available === true) {
                setSettings(prev => ({
                    ...prev,
                    openaiConfigured: true,
                }));
            }
        } catch (err) {
            setError('Ayarlar şu anda yüklenemiyor. Lütfen sayfayı yenileyip tekrar deneyin.');
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // ─── Fetch Members ───
    const fetchMembers = useCallback(async () => {
        setMembersLoading(true);
        try {
            const res = await authFetch('/api/tenants/members');
            if (res.ok) {
                const data = await res.json();
                setMembers(data.members || []);
            }
        } catch {
            // silently fail
        } finally {
            setMembersLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        if (activeTab === 'users') fetchMembers();
    }, [activeTab, fetchMembers]);

    // ─── Save Settings ───
    async function handleSave() {
        setSaving(true);
        try {
            const res = await authFetch('/api/tenant/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName: settings.companyName,
                    companyEmail: settings.companyEmail,
                    companyPhone: settings.companyPhone,
                    companyWebsite: settings.companyWebsite,
                    language: settings.language,
                    timezone: settings.timezone,
                    agentName: settings.agentName,
                    agentGreeting: settings.agentGreeting,
                    agentPersonality: settings.agentPersonality,
                    agentFallbackMessage: settings.agentFallbackMessage,
                    callRecording: settings.callRecording,
                    emailNotifications: settings.emailNotifications,
                    autoAppointments: settings.autoAppointments,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Kayıt başarısız');
            }

            toast({
                title: 'Kaydedildi',
                description: 'Ayarlar başarıyla güncellendi',
                variant: 'success',
            });
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.',
                variant: 'error',
            });
        } finally {
            setSaving(false);
        }
    }

    function updateSetting<K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    const handleAssistantToggle = async (enabled: boolean) => {
        updateSetting('assistantEnabled', enabled);
        // GPU pre-warm: fire-and-forget
        if (enabled) {
            try {
                await authFetch('/api/gpu/warm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'start' }),
                });
            } catch (e) {
                // Non-critical, pod will warm on next call anyway
                console.warn('GPU pre-warm failed:', e);
            }
        }
    };

    // ─── Loading ───
    if (loading) {
        return (
            <div className="p-3 sm:p-4 md:p-8 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                <div className="animate-fade-in-down space-y-2">
                    <Skeleton className="h-10 w-64 rounded-lg" />
                    <Skeleton className="h-4 w-96 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[0, 1, 2, 3].map(i => (
                        <Skeleton
                            key={i}
                            className="h-12 rounded-xl animate-fade-in-up"
                            style={{ animationDelay: `${100 + i * 80}ms` }}
                        />
                    ))}
                </div>
                <Skeleton
                    className="h-[400px] rounded-2xl animate-fade-in-up"
                    style={{ animationDelay: '450ms' }}
                />
            </div>
        );
    }

    // ─── Error ───
    if (error) {
        return (
            <div className="p-3 sm:p-4 md:p-8 max-w-5xl mx-auto">
                <Card className="rounded-2xl border-amber-500/30">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                        <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <AlertTriangle className="h-6 w-6 text-amber-500" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">Ayarlar Yüklenemedi</h3>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Yönetim paneli ayarları şu anda görüntülenemiyor. Lütfen sayfayı yenileyip tekrar deneyin.
                            </p>
                        </div>
                        <Button onClick={() => { setLoading(true); fetchSettings(); }} className="gap-2 mt-2">
                            <RefreshCw className="h-4 w-4" />
                            Tekrar Dene
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── Tab Config ───
    const tabs = [
        { id: 'company' as const, label: 'Şirket Bilgileri', icon: Building2 },
        { id: 'assistant' as const, label: 'AI Asistan', icon: Bot },
        { id: 'features' as const, label: 'Özellikler', icon: Zap },
        { id: 'phone' as const, label: 'Telefon', icon: Phone },
        { id: 'users' as const, label: 'Kullanıcılar', icon: Users },
        { id: 'system' as const, label: 'Sistem Durumu', icon: Activity },
        { id: 'theme' as const, label: 'Görünüm', icon: Palette },
    ];

    return (
        <div className="p-3 sm:p-4 md:p-8 max-w-5xl mx-auto space-y-5 sm:space-y-8">
            {/* Header */}
            <div className="animate-fade-in-down flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Shield className="h-8 w-8 text-primary" />
                        Yönetim Paneli
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Şirket ayarları, AI asistan yapılandırması ve sistem durumu
                    </p>
                </div>
                {activeTab !== 'system' && activeTab !== 'theme' && (
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="gap-2"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Kaydet
                    </Button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b pb-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ─── Company Tab ─── */}
            {activeTab === 'company' && (
                <div key="company" className="space-y-6 animate-fade-in-up">
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-blue-500" />
                                Şirket Bilgileri
                            </CardTitle>
                            <CardDescription>
                                İşletmenizin temel bilgilerini girin. Bu bilgiler AI asistan tarafından kullanılır.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="companyName">Şirket Adı</Label>
                                    <Input
                                        id="companyName"
                                        value={settings.companyName}
                                        onChange={(e) => updateSetting('companyName', e.target.value)}
                                        placeholder="Callception A.Ş."
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="companyEmail">E-posta</Label>
                                    <div className="relative mt-1">
                                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="companyEmail"
                                            type="email"
                                            value={settings.companyEmail}
                                            onChange={(e) => updateSetting('companyEmail', e.target.value)}
                                            placeholder="info@sirket.com"
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="companyPhone">Telefon</Label>
                                    <div className="relative mt-1">
                                        <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="companyPhone"
                                            value={settings.companyPhone}
                                            onChange={(e) => updateSetting('companyPhone', e.target.value)}
                                            placeholder="+90 532 XXX XX XX"
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="companyWebsite">Web Sitesi</Label>
                                    <div className="relative mt-1">
                                        <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="companyWebsite"
                                            type="url"
                                            value={settings.companyWebsite}
                                            onChange={(e) => updateSetting('companyWebsite', e.target.value)}
                                            placeholder="https://www.sirket.com"
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="language">Dil</Label>
                                    <div className="relative mt-1">
                                        <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <select
                                            id="language"
                                            value={settings.language}
                                            onChange={(e) => updateSetting('language', e.target.value)}
                                            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                                        >
                                            <option value="tr">🇹🇷 Türkçe</option>
                                            <option value="en">🇬🇧 English</option>
                                            <option value="de">🇩🇪 Deutsch</option>
                                            <option value="fr">🇫🇷 Français</option>
                                            <option value="tr-en">🇹🇷🇬🇧 Türkçe + English</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="timezone">Saat Dilimi</Label>
                                    <div className="relative mt-1">
                                        <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <select
                                            id="timezone"
                                            value={settings.timezone}
                                            onChange={(e) => updateSetting('timezone', e.target.value)}
                                            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                                        >
                                            <option value="Europe/Istanbul">Türkiye (UTC+3)</option>
                                            <option value="Europe/London">Londra (UTC+0)</option>
                                            <option value="Europe/Berlin">Berlin (UTC+1)</option>
                                            <option value="America/New_York">New York (UTC-5)</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── AI Assistant Tab ─── */}
            {activeTab === 'assistant' && (
                <div key="assistant" className="space-y-6 animate-fade-in-up">
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-purple-500" />
                                AI Asistan Yapılandırması
                            </CardTitle>
                            <CardDescription>
                                Sesli asistanınızın davranışını ve kişiliğini özelleştirin.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="agentName">Asistan Adı</Label>
                                <Input
                                    id="agentName"
                                    value={settings.agentName}
                                    onChange={(e) => updateSetting('agentName', e.target.value)}
                                    placeholder="Callception Asistan"
                                    className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Asistanınızın kendini tanıtırken kullandığı isim
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="agentGreeting">Karşılama Mesajı</Label>
                                <Textarea
                                    id="agentGreeting"
                                    value={settings.agentGreeting}
                                    onChange={(e) => updateSetting('agentGreeting', e.target.value)}
                                    placeholder="Merhaba, size nasıl yardımcı olabilirim?"
                                    rows={3}
                                    className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Gelen çağrılarda ilk söylenen mesaj
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="agentPersonality">Asistan Kişiliği</Label>
                                <Textarea
                                    id="agentPersonality"
                                    value={settings.agentPersonality}
                                    onChange={(e) => updateSetting('agentPersonality', e.target.value)}
                                    placeholder="Profesyonel, yardımsever ve nazik bir asistan..."
                                    rows={4}
                                    className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    AI modelinin sistem prompt&apos;unda kullanılan kişilik tanımı
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="agentFallback">Anlamadığında Mesaj</Label>
                                <Input
                                    id="agentFallback"
                                    value={settings.agentFallbackMessage}
                                    onChange={(e) => updateSetting('agentFallbackMessage', e.target.value)}
                                    placeholder="Anlayamadım, tekrar eder misiniz?"
                                    className="mt-1"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── Features Tab ─── */}
            {activeTab === 'features' && (
                <div key="features" className="space-y-6 animate-fade-in-up">
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5 text-amber-500" />
                                Özellik Ayarları
                            </CardTitle>
                            <CardDescription>
                                Hangi özelliklerin aktif olacağını yapılandırın.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1">
                            {/* AI Assistant */}
                            <FeatureToggle
                                icon={Bot}
                                title="AI Asistan"
                                description="Gelen çağrılarda AI asistanı aktif edin. Enterprise planda GPU ile çalışır."
                                enabled={settings.assistantEnabled}
                                onChange={(v) => handleAssistantToggle(v)}
                                color="text-emerald-500"
                            />

                            {/* Call Recording */}
                            <FeatureToggle
                                icon={Mic}
                                title="Çağrı Kaydı"
                                description="Gelen çağrıları otomatik kaydedin. Kayıtlar Twilio üzerinden saklanır."
                                enabled={settings.callRecording}
                                onChange={(v) => updateSetting('callRecording', v)}
                                color="text-red-500"
                            />

                            {/* Email Notifications */}
                            <FeatureToggle
                                icon={Bell}
                                title="E-posta Bildirimleri"
                                description="Cevapsız çağrı, yeni şikayet ve randevu hatırlatmaları için e-posta gönderin."
                                enabled={settings.emailNotifications}
                                onChange={(v) => updateSetting('emailNotifications', v)}
                                color="text-blue-500"
                            />

                            {/* Auto Appointments */}
                            <FeatureToggle
                                icon={FileText}
                                title="Otomatik Randevu"
                                description="AI asistan müşteri taleplerini algılayarak otomatik randevu oluştursun."
                                enabled={settings.autoAppointments}
                                onChange={(v) => updateSetting('autoAppointments', v)}
                                color="text-emerald-500"
                            />
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── Phone Tab ─── */}
            {activeTab === 'phone' && (
                <div key="phone" className="space-y-6 animate-fade-in-up">
                    <Suspense fallback={<Skeleton className="h-[400px] rounded-2xl" />}>
                        <PhoneManagementTab />
                    </Suspense>
                </div>
            )}

            {/* ─── Users Tab ─── */}
            {activeTab === 'users' && (
                <div key="users" className="space-y-6 animate-fade-in-up">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="rounded-2xl">
                            <CardContent className="pt-5 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                        <Users className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{membersLoading ? '—' : members.length}</p>
                                        <p className="text-xs text-muted-foreground">Toplam Kullanıcı</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl">
                            <CardContent className="pt-5 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                        <Crown className="h-5 w-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{membersLoading ? '—' : members.filter(m => m.role === 'owner').length}</p>
                                        <p className="text-xs text-muted-foreground">Owner</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl">
                            <CardContent className="pt-5 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                        <UserCog className="h-5 w-5 text-purple-500" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{membersLoading ? '—' : members.filter(m => m.role === 'admin').length}</p>
                                        <p className="text-xs text-muted-foreground">Admin</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl">
                            <CardContent className="pt-5 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <UserCheck className="h-5 w-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{membersLoading ? '—' : members.filter(m => m.role === 'agent' || m.role === 'viewer').length}</p>
                                        <p className="text-xs text-muted-foreground">Agent / Viewer</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Member List */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Users className="h-5 w-5 text-blue-500" />
                                        Kayıtlı Kullanıcılar
                                    </CardTitle>
                                    <CardDescription>Bu tenant&apos;a atanmış tüm kullanıcılar</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchMembers} className="gap-2">
                                    <RefreshCw className={`h-3.5 w-3.5 ${membersLoading ? 'animate-spin' : ''}`} />
                                    Yenile
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {membersLoading ? (
                                <div className="space-y-3">
                                    {[0, 1, 2].map(i => (
                                        <Skeleton key={i} className="h-14 rounded-xl" />
                                    ))}
                                </div>
                            ) : members.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">Henüz kullanıcı yok</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {members.map((member) => (
                                        <div key={member.uid} className="flex items-center justify-between py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                                                    {(member.email || member.uid).charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">
                                                        {member.displayName || member.email || member.uid}
                                                    </p>
                                                    {member.email && member.displayName && (
                                                        <p className="text-xs text-muted-foreground">{member.email}</p>
                                                    )}
                                                    {member.assignedAt && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {new Date(member.assignedAt).toLocaleDateString('tr-TR')} tarihinde eklendi
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <RoleBadge role={member.role} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── System Tab ─── */}
            {activeTab === 'system' && (
                <div key="system" className="space-y-6 animate-fade-in-up">
                    {/* System Health */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-emerald-500" />
                                        Sistem Durumu
                                    </CardTitle>
                                    <CardDescription>Bağlı servisler ve sağlık kontrolü</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchSettings} className="gap-2">
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Yenile
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <ServiceStatus
                                    name="API Sunucusu"
                                    status={healthData ? 'ok' : 'error'}
                                    detail={healthData ? 'Çalışıyor' : 'Bağlantı hatası'}
                                />
                                <ServiceStatus
                                    name="Firebase / Firestore"
                                    status={
                                        (healthData as Record<string, Record<string, Record<string, string>>>)?.services?.firestore?.status === 'ok'
                                            ? 'ok'
                                            : healthData ? 'warning' : 'error'
                                    }
                                    detail={
                                        (healthData as Record<string, Record<string, Record<string, string>>>)?.services?.firestore?.status === 'ok'
                                            ? 'Bağlı'
                                            : healthData ? 'Kontrol edilemedi' : 'Bağlantı hatası'
                                    }
                                />
                                <ServiceStatus
                                    name="OpenAI API"
                                    status={settings.openaiConfigured ? 'ok' : 'warning'}
                                    detail={settings.openaiConfigured ? 'Aktif' : 'Yapılandırılmamış'}
                                />
                                <ServiceStatus
                                    name="Twilio Telefon"
                                    status={settings.twilioConfigured ? 'ok' : 'warning'}
                                    detail={settings.twilioConfigured ? 'Bağlı' : 'Yapılandırılmamış'}
                                />
                                <ServiceStatus
                                    name="Deepgram (STT)"
                                    status={(healthData as Record<string, Record<string, string>>)?.config?.deepgram === 'configured' ? 'ok' : 'warning'}
                                    detail={(healthData as Record<string, Record<string, string>>)?.config?.deepgram === 'configured' ? 'Yapılandırılmış' : 'Yapılandırılmamış'}
                                />
                                <ServiceStatus
                                    name="Resend (E-posta)"
                                    status={(healthData as Record<string, Record<string, string>>)?.config?.resend === 'configured' ? 'ok' : 'warning'}
                                    detail={(healthData as Record<string, Record<string, string>>)?.config?.resend === 'configured' ? 'Yapılandırılmış' : 'Yapılandırılmamış'}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Account Info */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5 text-amber-500" />
                                Hesap Bilgileri
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between py-2">
                                <span className="text-sm text-muted-foreground">Kullanıcı</span>
                                <span className="text-sm font-medium">{user?.email || 'Bilinmiyor'}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-sm text-muted-foreground">Plan</span>
                                <Badge>{settings.subscriptionPlan === 'free_trial' ? 'Ücretsiz Deneme' : settings.subscriptionPlan}</Badge>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-sm text-muted-foreground">Durum</span>
                                <Badge variant="success">Aktif</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── Theme Tab ─── */}
            {activeTab === 'theme' && (
                <Suspense fallback={
                    <div className="space-y-4 animate-fade-in-up">
                        <Skeleton className="h-12 w-64" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Skeleton className="h-64 rounded-2xl" />
                            <Skeleton className="h-64 rounded-2xl" />
                            <Skeleton className="h-64 rounded-2xl" />
                        </div>
                    </div>
                }>
                    <ThemeSettingsTab />
                </Suspense>
            )}
        </div>
    );
}

// =============================================
// Sub-components
// =============================================

function RoleBadge({ role }: { role: string }) {
    const config: Record<string, { label: string; className: string }> = {
        owner: { label: 'Owner', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
        admin: { label: 'Admin', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
        agent: { label: 'Agent', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
        viewer: { label: 'Viewer', className: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
    };
    const c = config[role] || { label: role, className: 'bg-gray-100 text-gray-600 border-gray-200' };
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.className}`}>
            {c.label}
        </span>
    );
}

function FeatureToggle({ icon: Icon, title, description, enabled, onChange, color }: {
    icon: React.ElementType;
    title: string;
    description: string;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    color: string;
}) {
    const switchId = `toggle-${title.replace(/\s+/g, '-').toLowerCase()}`;
    return (
        <div className="flex items-center justify-between py-4 border-b last:border-0">
            <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
                <div>
                    <label htmlFor={switchId} className="font-medium text-sm cursor-pointer">{title}</label>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
            </div>
            <Switch
                id={switchId}
                checked={enabled}
                onCheckedChange={onChange}
                aria-label={title}
                className={enabled ? 'bg-emerald-500' : ''}
            />
        </div>
    );
}

function ServiceStatus({ name, status, detail }: {
    name: string;
    status: 'ok' | 'warning' | 'error';
    detail: string;
}) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b last:border-0">
            <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${status === 'ok' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                <span className="text-sm font-medium">{name}</span>
            </div>
            <span className={`text-xs ${status === 'ok' ? 'text-emerald-600' : status === 'warning' ? 'text-amber-600' : 'text-red-600'
                }`}>
                {detail}
            </span>
        </div>
    );
}
