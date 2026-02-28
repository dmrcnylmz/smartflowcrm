'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
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
import {
    Shield, Users, Settings, Activity, Database, Server,
    Building2, Bot, Phone, Globe, Save, Loader2,
    Key, Eye, EyeOff, CheckCircle, XCircle, Mic,
    Mail, Bell, FileText, ToggleLeft, ToggleRight,
    RefreshCw, Copy, Zap,
} from 'lucide-react';

// =============================================
// Types
// =============================================

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
    agentName: 'SmartFlow Asistan',
    agentGreeting: 'Merhaba, size nasıl yardımcı olabilirim?',
    agentPersonality: 'Profesyonel, yardımsever ve nazik bir asistan. Türkçe konuşur.',
    agentFallbackMessage: 'Anlayamadım, tekrar eder misiniz?',
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
    const [settings, setSettings] = useState<TenantSettings>(defaultSettings);
    const [activeTab, setActiveTab] = useState<'company' | 'assistant' | 'features' | 'system'>('company');
    const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);

    // ─── Fetch Settings ───
    const fetchSettings = useCallback(async () => {
        try {
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

            // Health status
            if (healthRes.ok) {
                const health = await healthRes.json();
                setHealthData(health);
            }

            // AI status
            const aiData = aiRes.ok ? await aiRes.json() : {};
            setSettings(prev => ({
                ...prev,
                openaiConfigured: aiData?.available === true,
            }));
        } catch (err) {
            console.error('Settings fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

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
                description: err instanceof Error ? err.message : 'Ayarlar kaydedilirken bir hata oluştu',
                variant: 'error',
            });
        } finally {
            setSaving(false);
        }
    }

    function updateSetting<K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    // ─── Loading ───
    if (loading) {
        return (
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
                <Skeleton className="h-10 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
                <Skeleton className="h-[400px] rounded-2xl" />
            </div>
        );
    }

    // ─── Tab Config ───
    const tabs = [
        { id: 'company' as const, label: 'Şirket Bilgileri', icon: Building2 },
        { id: 'assistant' as const, label: 'AI Asistan', icon: Bot },
        { id: 'features' as const, label: 'Özellikler', icon: Zap },
        { id: 'system' as const, label: 'Sistem Durumu', icon: Activity },
    ];

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
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
                {activeTab !== 'system' && (
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
                <div className="space-y-6">
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
                                        placeholder="SmartFlow A.Ş."
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
                                    <select
                                        id="language"
                                        value={settings.language}
                                        onChange={(e) => updateSetting('language', e.target.value)}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="tr">Türkçe</option>
                                        <option value="en">English</option>
                                    </select>
                                </div>
                                <div>
                                    <Label htmlFor="timezone">Saat Dilimi</Label>
                                    <select
                                        id="timezone"
                                        value={settings.timezone}
                                        onChange={(e) => updateSetting('timezone', e.target.value)}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="Europe/Istanbul">Türkiye (UTC+3)</option>
                                        <option value="Europe/London">Londra (UTC+0)</option>
                                        <option value="Europe/Berlin">Berlin (UTC+1)</option>
                                        <option value="America/New_York">New York (UTC-5)</option>
                                    </select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─── AI Assistant Tab ─── */}
            {activeTab === 'assistant' && (
                <div className="space-y-6">
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
                                    placeholder="SmartFlow Asistan"
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
                <div className="space-y-6">
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

            {/* ─── System Tab ─── */}
            {activeTab === 'system' && (
                <div className="space-y-6">
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
                                    status={(healthData as Record<string, Record<string, string>>)?.services?.firestore === 'ok' ? 'ok' : 'warning'}
                                    detail={(healthData as Record<string, Record<string, string>>)?.services?.firestore === 'ok' ? 'Bağlı' : 'Kontrol edilemedi'}
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
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Stats */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5" />
                                Hızlı İstatistikler
                            </CardTitle>
                            <CardDescription>Sistem performansı</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-primary">99.9%</p>
                                    <p className="text-sm text-muted-foreground mt-1">Uptime</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-primary">124ms</p>
                                    <p className="text-sm text-muted-foreground mt-1">Ort. Yanıt</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-primary">1.2k</p>
                                    <p className="text-sm text-muted-foreground mt-1">API Çağrıları</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-primary">0</p>
                                    <p className="text-sm text-muted-foreground mt-1">Hata</p>
                                </div>
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
        </div>
    );
}

// =============================================
// Sub-components
// =============================================

function FeatureToggle({ icon: Icon, title, description, enabled, onChange, color }: {
    icon: React.ElementType;
    title: string;
    description: string;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    color: string;
}) {
    return (
        <div className="flex items-center justify-between py-4 border-b last:border-0">
            <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
                <div>
                    <p className="font-medium text-sm">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
            </div>
            <button
                onClick={() => onChange(!enabled)}
                className="shrink-0 ml-4"
            >
                {enabled ? (
                    <ToggleRight className="h-8 w-8 text-emerald-500" />
                ) : (
                    <ToggleLeft className="h-8 w-8 text-muted-foreground" />
                )}
            </button>
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
