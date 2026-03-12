'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useTenantSettings } from '@/lib/hooks/useTenantSettings';
import { VoiceTestModal } from '@/components/voice/VoiceTestModal';
import { AgentCreationWizard } from '@/components/agents/AgentCreationWizard';
import {
    Bot,
    Plus,
    Save,
    Trash2,
    Edit3,
    Loader2,
    Sparkles,
    Volume2,
    AlertTriangle,
    MessageCircle,
    Zap,
    Globe,
    Code2,
    CircleDot,
    Wand2,
    Copy,
    CheckCircle,
    XCircle,
    Search,
    ToggleLeft,
    ToggleRight,
    HeartPulse,
    ShoppingBag,
    Briefcase,
    Headphones,
    GraduationCap,
    Utensils,
    Home as HomeIcon,
    Car,
    Scale,
    Shield,
} from 'lucide-react';
import type { Agent, AgentVariable, FallbackRule, AgentVoiceConfig } from '@/lib/agents/types';
import { VOICE_STYLES as SHARED_VOICE_STYLES, AGENT_LANGUAGES } from '@/lib/agents/types';
import { AGENT_TEMPLATES, getTemplateById } from '@/lib/agents/templates';
import { VoiceSelector } from '@/components/voice/VoiceSelector';
import { getVoiceById, type VoiceCatalogEntry } from '@/lib/voice/voice-catalog';

// =============================================
// Icon Map for template colors
// =============================================

const TEMPLATE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    HeartPulse, ShoppingBag, Briefcase, Headphones, GraduationCap,
    Utensils, Home: HomeIcon, Car, Scale, Shield,
};

function getTemplateIcon(iconName: string) {
    return TEMPLATE_ICON_MAP[iconName] || Bot;
}

// Re-export VoiceConfig as alias for backward compat
type VoiceConfig = AgentVoiceConfig;

// =============================================
// Constants — use shared definitions from lib/agents/types
// =============================================

const VOICE_STYLES = SHARED_VOICE_STYLES;
const LANGUAGES = AGENT_LANGUAGES;

const PROMPT_TEMPLATES = [
    {
        name: 'Resepsiyonist',
        role: 'receptionist',
        prompt: `Sen {company_name} şirketinin profesyonel resepsiyonistisin.

Görevlerin:
- Arayanları sıcak bir şekilde karşıla
- Randevu talepleri için bilgileri topla (isim, telefon, tercih edilen tarih/saat)
- Şirket hakkında genel bilgi ver
- Acil durumları tespit edip uygun departmana yönlendir

Davranış Kuralları:
- Her zaman nazik ve profesyonel ol
- Arayanın adını öğrenip kullan
- Kısa ve net cevaplar ver
- Emin olmadığın konularda "Sizi ilgili departmanla bağlayabilirim" de

Çalışma Saatleri: {working_hours}
Adres: {address}`,
        variables: [
            { key: 'company_name', label: 'Şirket Adı', defaultValue: 'Callception' },
            { key: 'working_hours', label: 'Çalışma Saatleri', defaultValue: '09:00-18:00' },
            { key: 'address', label: 'Adres', defaultValue: '' },
        ],
    },
    {
        name: 'Müşteri Destek',
        role: 'support',
        prompt: `Sen {company_name} müşteri destek uzmanısın.

Görevlerin:
- Müşteri sorunlarını dinle ve anla
- Bilinen sorunlar için çözüm öner
- Teknik sorunları kaydet ve ilgili ekibe yönlendir
- Müşteri memnuniyetini ölç

Sorun Çözüm Akışı:
1. Sorunu anla ve tekrarla
2. Bilgi tabanından çözüm ara
3. Çözüm varsa adım adım anlat
4. Çözüm yoksa ticket oluştur ve takip numarası ver

Önemli:
- Müşteriye asla "bilmiyorum" deme, bunun yerine araştıracağını söyle
- Şikayet durumunda empati göster
- Ürün bilgileri: {product_info}`,
        variables: [
            { key: 'company_name', label: 'Şirket Adı', defaultValue: 'Callception' },
            { key: 'product_info', label: 'Ürün Bilgileri', defaultValue: '' },
        ],
    },
    {
        name: 'Satış Danışmanı',
        role: 'sales',
        prompt: `Sen {company_name} satış danışmanısın.

Görevlerin:
- Potansiyel müşterilere ürün/hizmet bilgisi ver
- İhtiyaç analizi yap
- Fiyat bilgisi sun
- Randevu ayarla veya teklif gönder

Satış Tekniği:
1. Arayanın ihtiyacını anla
2. Uygun ürün/hizmeti belirle
3. Faydaları vurgulayarak anlat
4. İtirazları profesyonelce yanıtla
5. Sonraki adımı belirle (teklif, demo, randevu)

Fiyat Listesi: {price_list}
Kampanyalar: {campaigns}`,
        variables: [
            { key: 'company_name', label: 'Şirket Adı', defaultValue: 'Callception' },
            { key: 'price_list', label: 'Fiyat Listesi', defaultValue: '' },
            { key: 'campaigns', label: 'Kampanyalar', defaultValue: '' },
        ],
    },
];

const DEFAULT_AGENT: Omit<Agent, 'id'> = {
    name: '',
    role: 'assistant',
    systemPrompt: '',
    variables: [],
    voiceConfig: {
        style: 'professional',
        temperature: 0.7,
        maxTokens: 256,
        language: 'tr',
    },
    fallbackRules: [],
    isActive: true,
};

// =============================================
// Component
// =============================================

export default function AgentsPage() {
    const { toast } = useToast();
    const authFetch = useAuthFetch();
    const { settings: tenantSettings } = useTenantSettings();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Partial<Agent>>(DEFAULT_AGENT);
    const [isNewAgent, setIsNewAgent] = useState(true);
    const [activeTab, setActiveTab] = useState<'prompt' | 'variables' | 'voice' | 'rules'>('prompt');

    // Wizard state
    const [wizardOpen, setWizardOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [testingAgent, setTestingAgent] = useState<Agent | null>(null);

    // ─────────────────────────────────────────────
    // Data fetching
    // ─────────────────────────────────────────────

    const fetchAgents = useCallback(async () => {
        try {
            setError(null);
            const res = await authFetch('/api/agents');
            if (!res.ok) throw new Error('Asistan verileri yüklenemedi');
            const data = await res.json();
            setAgents(data.agents || []);
        } catch (err) {
            setError('Asistan verileri şu anda yüklenemiyor. Lütfen daha sonra tekrar deneyin.');
        }
    }, [authFetch]);

    useEffect(() => {
        fetchAgents().finally(() => setLoading(false));
    }, [fetchAgents]);

    // ─────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────

    function handleNew() {
        // Open wizard instead of editor for new agents
        setWizardOpen(true);
    }

    function handleWizardComplete(agentId: string) {
        setWizardOpen(false);
        fetchAgents();
    }

    function handleEdit(agent: Agent) {
        setEditingAgent({ ...agent });
        setIsNewAgent(false);
        setActiveTab('prompt');
        setEditorOpen(true);
    }

    async function handleDuplicate(agent: Agent) {
        try {
            const res = await authFetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `${agent.name} (Kopya)`,
                    role: agent.role,
                    systemPrompt: agent.systemPrompt,
                    variables: agent.variables,
                    voiceConfig: agent.voiceConfig,
                    fallbackRules: agent.fallbackRules,
                    isActive: false,
                    templateId: (agent as Agent & { templateId?: string }).templateId,
                    templateColor: (agent as Agent & { templateColor?: string }).templateColor,
                }),
            });
            if (!res.ok) throw new Error('Kopyalanamadi');
            toast({ title: 'Kopyalandi', description: `"${agent.name}" basariyla kopyalandi.` });
            fetchAgents();
        } catch {
            toast({ title: 'Hata', description: 'Asistan kopyalanirken hata olustu.', variant: 'error' });
        }
    }

    async function handleToggleActive(agent: Agent) {
        try {
            const res = await authFetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: agent.id,
                    name: agent.name,
                    systemPrompt: agent.systemPrompt,
                    isActive: !agent.isActive,
                }),
            });
            if (!res.ok) throw new Error('Durum degistirilemedi');

            // Optimistic update
            setAgents(prev => prev.map(a =>
                a.id === agent.id ? { ...a, isActive: !a.isActive } : a
            ));
            toast({
                title: agent.isActive ? 'Pasif yapildi' : 'Aktif yapildi',
                description: `"${agent.name}" ${agent.isActive ? 'pasif' : 'aktif'} duruma getirildi.`,
            });
        } catch {
            toast({ title: 'Hata', description: 'Durum degistirilemedi.', variant: 'error' });
        }
    }

    function handleApplyTemplate(templateIndex: number) {
        const template = PROMPT_TEMPLATES[templateIndex];
        setEditingAgent(prev => ({
            ...prev,
            name: template.name,
            role: template.role,
            systemPrompt: template.prompt,
            variables: template.variables,
        }));
    }

    async function handleSave() {
        const trimmedName = editingAgent.name?.trim() || '';
        const trimmedPrompt = editingAgent.systemPrompt?.trim() || '';

        if (!trimmedName || !trimmedPrompt) {
            toast({
                title: 'Eksik Bilgi',
                description: 'Asistan adı ve sistem prompt\'u zorunludur',
                variant: 'error',
            });
            return;
        }

        if (trimmedName.length < 2) {
            toast({
                title: 'Geçersiz İsim',
                description: 'Asistan adı en az 2 karakter olmalıdır',
                variant: 'error',
            });
            return;
        }

        setSaving(true);
        try {
            const res = await authFetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: isNewAgent ? undefined : editingAgent.id,
                    name: trimmedName,
                    role: editingAgent.role,
                    systemPrompt: trimmedPrompt,
                    variables: editingAgent.variables,
                    voiceConfig: editingAgent.voiceConfig,
                    fallbackRules: editingAgent.fallbackRules,
                    isActive: editingAgent.isActive,
                }),
            });

            if (!res.ok) throw new Error('Asistan kaydedilemedi');

            const result = await res.json();

            // Optimistic update: add new agent to local state immediately
            if (isNewAgent && result.id) {
                const now = { _seconds: Math.floor(Date.now() / 1000) };
                setAgents(prev => [{
                    ...editingAgent,
                    id: result.id,
                    createdAt: now,
                    updatedAt: now,
                } as Agent, ...prev]);
            }

            toast({
                title: isNewAgent ? 'Oluşturuldu!' : 'Güncellendi!',
                description: `"${editingAgent.name}" başarıyla ${isNewAgent ? 'oluşturuldu' : 'güncellendi'}`,
                variant: 'success',
            });

            setEditorOpen(false);

            // Also refetch from server to sync
            fetchAgents();
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Agent kaydedilirken bir hata oluştu',
                variant: 'error',
            });
        } finally {
            setSaving(false);
        }
    }

    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    async function handleDelete(agentId: string) {
        setDeleteConfirmId(null);
        setDeletingId(agentId);
        try {
            const res = await authFetch('/api/agents', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: agentId }),
            });

            if (!res.ok) throw new Error('Asistan silinemedi');

            toast({
                title: 'Silindi',
                description: 'Agent başarıyla silindi',
                variant: 'success',
            });

            await fetchAgents();
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Agent silinirken bir hata oluştu',
                variant: 'error',
            });
        } finally {
            setDeletingId(null);
        }
    }

    // Variable management
    function addVariable() {
        setEditingAgent(prev => ({
            ...prev,
            variables: [...(prev.variables || []), { key: '', label: '', defaultValue: '' }],
        }));
    }

    function updateVariable(index: number, field: keyof AgentVariable, value: string) {
        setEditingAgent(prev => {
            const vars = [...(prev.variables || [])];
            vars[index] = { ...vars[index], [field]: value };
            return { ...prev, variables: vars };
        });
    }

    function removeVariable(index: number) {
        setEditingAgent(prev => ({
            ...prev,
            variables: (prev.variables || []).filter((_, i) => i !== index),
        }));
    }

    // Fallback rule management
    function addFallbackRule() {
        setEditingAgent(prev => ({
            ...prev,
            fallbackRules: [...(prev.fallbackRules || []), { condition: 'confidence < 0.3', action: 'transfer', value: '' }],
        }));
    }

    function updateFallbackRule(index: number, field: keyof FallbackRule, value: string) {
        setEditingAgent(prev => {
            const rules = [...(prev.fallbackRules || [])];
            rules[index] = { ...rules[index], [field]: value };
            return { ...prev, fallbackRules: rules };
        });
    }

    function removeFallbackRule(index: number) {
        setEditingAgent(prev => ({
            ...prev,
            fallbackRules: (prev.fallbackRules || []).filter((_, i) => i !== index),
        }));
    }

    // Preview prompt with resolved variables
    function getResolvedPrompt(): string {
        let prompt = editingAgent.systemPrompt || '';
        for (const v of editingAgent.variables || []) {
            const regex = new RegExp(`\\{${v.key}\\}`, 'g');
            prompt = prompt.replace(regex, v.defaultValue || `{${v.key}}`);
        }
        return prompt;
    }

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    return (
        <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="animate-fade-in-down">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
                            <div className="h-9 w-9 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-violet-400" />
                            </div>
                            Sesli Asistanlar
                            {agents.length > 0 && (
                                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-white/40">{agents.length}</span>
                            )}
                        </h1>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Sesli asistan promptlarini ve davranislarini yapilandirin
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {agents.length > 0 && (
                            <div className="relative">
                                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Asistan ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 w-48 h-9 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-inception-red/40"
                                />
                            </div>
                        )}
                        <Button
                            onClick={handleNew}
                            className="gap-2"
                        >
                            <Wand2 className="h-4 w-4" />
                            Yeni Asistan
                        </Button>
                    </div>
                </div>
            </div>

            {/* Agent List */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card
                            key={i}
                            className="animate-fade-in-up"
                            style={{ animationDelay: `${i * 100}ms` }}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-muted animate-pulse" />
                                        <div className="space-y-2">
                                            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                                            <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="h-5 w-12 bg-muted rounded-full animate-pulse" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="h-3 w-full bg-muted rounded animate-pulse" />
                                    <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
                                    <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                    <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8 text-red-400/60" />
                    </div>
                    <h3 className="text-lg font-semibold text-white/80 mb-2">Bir hata oluştu</h3>
                    <p className="text-sm text-white/40 mb-6 max-w-sm">{error}</p>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setError(null);
                            setLoading(true);
                            fetchAgents().finally(() => setLoading(false));
                        }}
                        className="gap-2"
                    >
                        Tekrar Dene
                    </Button>
                </div>
            ) : agents.length === 0 && !loading ? (
                /* ─── Template-based Empty State ─── */
                <div className="animate-fade-in-up">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-violet-500/10 mb-4">
                            <Wand2 className="h-8 w-8 text-violet-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white/90">İlk Asistanınızı Oluşturun</h3>
                        <p className="text-white/40 mt-1 max-w-md mx-auto">
                            Sektörünüze uygun bir şablon seçin ve adım adım asistanınızı oluşturun
                        </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-4xl mx-auto">
                        {AGENT_TEMPLATES.map((template, idx) => {
                            const Icon = getTemplateIcon(template.icon);
                            return (
                                <button
                                    key={template.id}
                                    onClick={() => setWizardOpen(true)}
                                    style={{ animationDelay: `${idx * 60}ms` }}
                                    className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-violet-500/30 hover:bg-white/[0.04] text-left transition-all duration-200 animate-fade-in-up"
                                >
                                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-r ${template.color} flex items-center justify-center mb-3 shadow-sm`}>
                                        <Icon className="h-5 w-5 text-white" />
                                    </div>
                                    <h4 className="font-semibold text-sm mb-1">{template.name}</h4>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agents
                        .filter(a => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.role.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((agent, index) => {
                        const agentExt = agent as Agent & { templateId?: string; templateColor?: string };
                        const template = agentExt.templateId ? getTemplateById(agentExt.templateId) : null;
                        const TemplateIcon = template ? getTemplateIcon(template.icon) : null;

                        return (
                            <Card
                                key={agent.id}
                                className="animate-fade-in-up cursor-pointer border-white/[0.06] bg-white/[0.02] hover:border-violet-500/30 hover:bg-white/[0.04] transition-all overflow-hidden"
                                style={{ animationDelay: `${index * 80}ms` }}
                                onClick={() => handleEdit(agent)}
                            >
                                {/* Template color strip */}
                                {template && (
                                    <div className={`h-1 bg-gradient-to-r ${template.color}`} />
                                )}
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${template ? `bg-gradient-to-r ${template.color}` : 'bg-violet-500/10'}`}>
                                                {TemplateIcon ? (
                                                    <TemplateIcon className="h-5 w-5 text-white" />
                                                ) : (
                                                    <Bot className="h-5 w-5 text-violet-500" />
                                                )}
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{agent.name}</CardTitle>
                                                <p className="text-xs text-muted-foreground capitalize">{agent.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px] px-1.5">
                                                <Globe className="h-2.5 w-2.5 mr-0.5" />
                                                {agent.voiceConfig?.language === 'tr' ? 'TR' : agent.voiceConfig?.language?.toUpperCase() || 'TR'}
                                            </Badge>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleToggleActive(agent); }}
                                                className="transition-colors"
                                                title={agent.isActive ? 'Pasif yap' : 'Aktif yap'}
                                                aria-label={agent.isActive ? 'Pasif yap' : 'Aktif yap'}
                                            >
                                                {agent.isActive ? (
                                                    <ToggleRight className="h-6 w-6 text-emerald-500" />
                                                ) : (
                                                    <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {agent.systemPrompt?.slice(0, 120)}...
                                    </p>
                                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                                        {agent.variables && agent.variables.length > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Code2 className="h-3 w-3" />
                                                {agent.variables.length} degisken
                                            </span>
                                        )}
                                        {agent.fallbackRules && agent.fallbackRules.length > 0 && (
                                            <span className="flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" />
                                                {agent.fallbackRules.length} kural
                                            </span>
                                        )}
                                        {template && (
                                            <Badge variant="outline" className="text-[10px] px-1.5">
                                                {template.name}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-end gap-1 mt-4">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1 h-7 px-2"
                                            onClick={(e) => { e.stopPropagation(); setTestingAgent(agent); }}
                                        >
                                            <MessageCircle className="h-3 w-3" />
                                            Test
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1 h-7 px-2"
                                            onClick={(e) => { e.stopPropagation(); handleDuplicate(agent); }}
                                        >
                                            <Copy className="h-3 w-3" />
                                            Kopyala
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1 h-7 px-2"
                                            onClick={(e) => { e.stopPropagation(); handleEdit(agent); }}
                                        >
                                            <Edit3 className="h-3 w-3" />
                                            Duzenle
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10 gap-1 h-7 px-2"
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(agent.id); }}
                                            disabled={deletingId === agent.id}
                                            aria-label="Sil"
                                        >
                                            {deletingId === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ─── Agent Editor Dialog ─── */}
            <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-5 w-5 text-violet-500" />
                            {isNewAgent ? 'Yeni Asistan Oluştur' : `"${editingAgent.name}" Düzenle`}
                        </DialogTitle>
                        <DialogDescription>
                            Asistanınızın prompt, değişken, ses ve davranış ayarlarını yapılandırın.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col mt-4">
                        {/* Tabs */}
                        <div className="flex border-b mb-4 gap-1">
                            {[
                                { id: 'prompt', label: 'Prompt', icon: Sparkles },
                                { id: 'variables', label: 'Değişkenler', icon: Code2 },
                                { id: 'voice', label: 'Ses & Dil', icon: Volume2 },
                                { id: 'rules', label: 'Kurallar', icon: AlertTriangle },
                            ].map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.id
                                            ? 'border-violet-500 text-violet-500'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto">
                            {/* --- Prompt Tab --- */}
                            {activeTab === 'prompt' && (
                                <div className="space-y-4">
                                    {/* Templates */}
                                    {isNewAgent && (
                                        <div>
                                            <Label className="text-sm font-medium mb-2 block">Hızlı Şablon</Label>
                                            <div className="flex gap-2 flex-wrap">
                                                {PROMPT_TEMPLATES.map((t, i) => (
                                                    <Button
                                                        key={i}
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleApplyTemplate(i)}
                                                        className="gap-1"
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                        {t.name}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="agent-name">Asistan Adı</Label>
                                            <Input
                                                id="agent-name"
                                                value={editingAgent.name || ''}
                                                onChange={(e) => setEditingAgent(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="Örn: Resepsiyonist, Destek Uzmanı..."
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="agent-role">Rol</Label>
                                            <Select
                                                value={editingAgent.role || 'assistant'}
                                                onValueChange={(v) => setEditingAgent(prev => ({ ...prev, role: v }))}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="receptionist">Resepsiyonist</SelectItem>
                                                    <SelectItem value="support">Müşteri Destek</SelectItem>
                                                    <SelectItem value="sales">Satış Danışmanı</SelectItem>
                                                    <SelectItem value="assistant">Genel Asistan</SelectItem>
                                                    <SelectItem value="custom">Özel</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="system-prompt">Sistem Promptu</Label>
                                        <Textarea
                                            id="system-prompt"
                                            value={editingAgent.systemPrompt || ''}
                                            onChange={(e) => setEditingAgent(prev => ({ ...prev, systemPrompt: e.target.value }))}
                                            placeholder="Asistanınızın davranışını tanımlayan sistem promptunu yazın..."
                                            rows={14}
                                            className="mt-1 font-mono text-sm"
                                        />
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-xs text-muted-foreground">
                                                {editingAgent.systemPrompt?.length || 0} karakter •
                                                Değişkenler: {'{'}değişken_adı{'}'}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <CircleDot className={`h-3 w-3 ${editingAgent.isActive ? 'text-emerald-500' : 'text-gray-400'}`} />
                                                <button
                                                    className="text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => setEditingAgent(prev => ({ ...prev, isActive: !prev.isActive }))}
                                                    aria-label={editingAgent.isActive ? 'Pasif yap' : 'Aktif yap'}
                                                >
                                                    {editingAgent.isActive ? 'Aktif' : 'Pasif'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    {editingAgent.variables && editingAgent.variables.length > 0 && (
                                        <div>
                                            <Label className="text-sm font-medium mb-2 block">Önizleme (değişkenler uygulanmış)</Label>
                                            <div className="p-3 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                                                {getResolvedPrompt()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- Variables Tab --- */}
                            {activeTab === 'variables' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-medium">Değişkenler</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Promptunuzda {'{'}değişken_adı{'}'} formatında kullanabilirsiniz
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={addVariable} className="gap-1">
                                            <Plus className="h-3 w-3" />
                                            Değişken Ekle
                                        </Button>
                                    </div>

                                    {(editingAgent.variables || []).length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Code2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            <p>Henüz değişken eklenmemiş</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {(editingAgent.variables || []).map((v, i) => (
                                                <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg">
                                                    <div className="col-span-3">
                                                        <Label className="text-xs">Anahtar</Label>
                                                        <Input
                                                            value={v.key}
                                                            onChange={(e) => updateVariable(i, 'key', e.target.value)}
                                                            placeholder="company_name"
                                                            className="mt-1 text-sm font-mono"
                                                        />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <Label className="text-xs">Etiket</Label>
                                                        <Input
                                                            value={v.label}
                                                            onChange={(e) => updateVariable(i, 'label', e.target.value)}
                                                            placeholder="Şirket Adı"
                                                            className="mt-1 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-5">
                                                        <Label className="text-xs">Varsayılan Değer</Label>
                                                        <Input
                                                            value={v.defaultValue}
                                                            onChange={(e) => updateVariable(i, 'defaultValue', e.target.value)}
                                                            placeholder="Callception"
                                                            className="mt-1 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-1 pt-6">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-400 hover:text-red-500 h-8 w-8"
                                                            onClick={() => removeVariable(i)}
                                                            aria-label="Değişkeni sil"
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- Voice Tab --- */}
                            {activeTab === 'voice' && (
                                <div className="space-y-6">
                                    {/* TTS Voice Selection */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Volume2 className="h-4 w-4 text-primary" />
                                            <Label className="text-base font-semibold">TTS Ses Seçimi</Label>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-3">
                                            Asistanınızın telefonda konuşacağı sesi seçin. Dinlemek için ▶ butonuna tıklayın.
                                        </p>

                                        {/* Current voice display */}
                                        {editingAgent.voiceConfig?.voiceCatalogId && (() => {
                                            const currentVoice = getVoiceById(editingAgent.voiceConfig.voiceCatalogId);
                                            if (!currentVoice) return null;
                                            return (
                                                <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <CheckCircle className="h-4 w-4 text-primary" />
                                                        <span className="font-medium">Seçili: {currentVoice.name}</span>
                                                        <Badge variant="secondary" className="text-[10px]">{currentVoice.provider}</Badge>
                                                        <span className="text-muted-foreground text-xs">{currentVoice.tone}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <div className="max-h-[320px] overflow-y-auto rounded-lg border p-3">
                                            <VoiceSelector
                                                selectedVoiceId={editingAgent.voiceConfig?.voiceCatalogId}
                                                onSelect={(voice: VoiceCatalogEntry) => setEditingAgent(prev => ({
                                                    ...prev,
                                                    voiceConfig: {
                                                        ...(prev.voiceConfig || {} as VoiceConfig),
                                                        voiceCatalogId: voice.id,
                                                        ttsProvider: voice.provider,
                                                    },
                                                }))}
                                                language={(editingAgent.voiceConfig?.language as 'tr' | 'en') || 'tr'}
                                                authFetch={authFetch}
                                                isEnterprise={tenantSettings?.subscriptionPlan === 'enterprise'}
                                            />
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="flex items-center gap-3">
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-xs text-muted-foreground">Diğer Ayarlar</span>
                                        <div className="h-px flex-1 bg-border" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 sm:gap-6">
                                        <div>
                                            <Label>Konuşma Stili</Label>
                                            <Select
                                                value={editingAgent.voiceConfig?.style || 'professional'}
                                                onValueChange={(v) => setEditingAgent(prev => ({
                                                    ...prev,
                                                    voiceConfig: { ...(prev.voiceConfig || {} as VoiceConfig), style: v },
                                                }))}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {VOICE_STYLES.map(s => (
                                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label>Dil</Label>
                                            <Select
                                                value={editingAgent.voiceConfig?.language || 'tr'}
                                                onValueChange={(v) => setEditingAgent(prev => ({
                                                    ...prev,
                                                    voiceConfig: { ...(prev.voiceConfig || {} as VoiceConfig), language: v },
                                                }))}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {LANGUAGES.map(l => (
                                                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div>
                                        <Label>Yaratıcılık (Temperature): {editingAgent.voiceConfig?.temperature ?? 0.7}</Label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={editingAgent.voiceConfig?.temperature ?? 0.7}
                                            onChange={(e) => setEditingAgent(prev => ({
                                                ...prev,
                                                voiceConfig: { ...(prev.voiceConfig || {} as VoiceConfig), temperature: parseFloat(e.target.value) },
                                            }))}
                                            className="w-full mt-2"
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                            <span>Tutarlı (0)</span>
                                            <span>Yaratıcı (1)</span>
                                        </div>
                                    </div>

                                    <div>
                                        <Label>Maksimum Token: {editingAgent.voiceConfig?.maxTokens ?? 256}</Label>
                                        <input
                                            type="range"
                                            min="64"
                                            max="1024"
                                            step="64"
                                            value={editingAgent.voiceConfig?.maxTokens ?? 256}
                                            onChange={(e) => setEditingAgent(prev => ({
                                                ...prev,
                                                voiceConfig: { ...(prev.voiceConfig || {} as VoiceConfig), maxTokens: parseInt(e.target.value) },
                                            }))}
                                            className="w-full mt-2"
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                            <span>Kısa (64)</span>
                                            <span>Uzun (1024)</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- Rules Tab --- */}
                            {activeTab === 'rules' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-medium">Yönlendirme Kuralları</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Belirli durumlarda asistanın ne yapacağını belirleyin
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={addFallbackRule} className="gap-1">
                                            <Plus className="h-3 w-3" />
                                            Kural Ekle
                                        </Button>
                                    </div>

                                    {(editingAgent.fallbackRules || []).length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            <p>Henüz kural eklenmemiş</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {(editingAgent.fallbackRules || []).map((rule, i) => (
                                                <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg">
                                                    <div className="col-span-4">
                                                        <Label className="text-xs">Koşul</Label>
                                                        <Select
                                                            value={rule.condition}
                                                            onValueChange={(v) => updateFallbackRule(i, 'condition', v)}
                                                        >
                                                            <SelectTrigger className="mt-1 text-sm">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="confidence < 0.3">Düşük güven ({'<'} 0.3)</SelectItem>
                                                                <SelectItem value="sentiment < -0.5">Olumsuz duygu</SelectItem>
                                                                <SelectItem value="topic = billing">Konu: Fatura</SelectItem>
                                                                <SelectItem value="topic = complaint">Konu: Şikayet</SelectItem>
                                                                <SelectItem value="repeat > 2">2+ tekrar</SelectItem>
                                                                <SelectItem value="custom">Özel</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="col-span-3">
                                                        <Label className="text-xs">Aksiyon</Label>
                                                        <Select
                                                            value={rule.action}
                                                            onValueChange={(v) => updateFallbackRule(i, 'action', v)}
                                                        >
                                                            <SelectTrigger className="mt-1 text-sm">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="transfer">İnsana Aktar</SelectItem>
                                                                <SelectItem value="escalate">Yöneticiye Bildir</SelectItem>
                                                                <SelectItem value="message">Mesaj Gönder</SelectItem>
                                                                <SelectItem value="end_call">Aramayı Sonlandır</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="col-span-4">
                                                        <Label className="text-xs">Değer / Açıklama</Label>
                                                        <Input
                                                            value={rule.value}
                                                            onChange={(e) => updateFallbackRule(i, 'value', e.target.value)}
                                                            placeholder="Örn: Fatura departmanı"
                                                            className="mt-1 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-1 pt-6">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-400 hover:text-red-500 h-8 w-8"
                                                            onClick={() => removeFallbackRule(i)}
                                                            aria-label="Kuralı sil"
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                            <Button variant="outline" onClick={() => setEditorOpen(false)}>
                                İptal
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="gap-2"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Kaydediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        {isNewAgent ? 'Oluştur' : 'Güncelle'}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Agent Creation Wizard */}
            <AgentCreationWizard
                open={wizardOpen}
                onComplete={handleWizardComplete}
                onCancel={() => setWizardOpen(false)}
            />

            {/* Voice Test Modal */}
            <VoiceTestModal
                isOpen={!!testingAgent}
                onClose={() => setTestingAgent(null)}
                tenantId="default"
                agentName={testingAgent?.name || 'Callception AI'}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Asistanı Sil
                        </DialogTitle>
                        <DialogDescription>
                            Bu asistanı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                            İptal
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            disabled={!!deletingId}
                            className="gap-2"
                        >
                            {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Sil
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
