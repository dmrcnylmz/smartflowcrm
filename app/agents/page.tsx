'use client';
export const dynamic = 'force-dynamic';

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
import { VoiceTestModal } from '@/components/voice/VoiceTestModal';
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
} from 'lucide-react';

// =============================================
// Types
// =============================================

interface AgentVariable {
    key: string;
    label: string;
    defaultValue: string;
}

interface FallbackRule {
    condition: string;
    action: string;
    value: string;
}

interface VoiceConfig {
    style: string;
    temperature: number;
    maxTokens: number;
    language: string;
}

interface Agent {
    id: string;
    name: string;
    role: string;
    systemPrompt: string;
    variables: AgentVariable[];
    voiceConfig: VoiceConfig;
    fallbackRules: FallbackRule[];
    isActive: boolean;
    createdAt?: { _seconds: number };
}

// =============================================
// Constants
// =============================================

const VOICE_STYLES = [
    { value: 'professional', label: 'Profesyonel' },
    { value: 'friendly', label: 'Samimi' },
    { value: 'formal', label: 'Resmi' },
    { value: 'casual', label: 'Doğal' },
    { value: 'empathetic', label: 'Empatik' },
];

const LANGUAGES = [
    { value: 'tr', label: '🇹🇷 Türkçe' },
    { value: 'en', label: '🇬🇧 English' },
    { value: 'de', label: '🇩🇪 Deutsch' },
    { value: 'ar', label: '🇸🇦 العربية' },
];

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
            { key: 'company_name', label: 'Şirket Adı', defaultValue: 'SmartFlow' },
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
            { key: 'company_name', label: 'Şirket Adı', defaultValue: 'SmartFlow' },
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
            { key: 'company_name', label: 'Şirket Adı', defaultValue: 'SmartFlow' },
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
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Partial<Agent>>(DEFAULT_AGENT);
    const [isNewAgent, setIsNewAgent] = useState(true);
    const [activeTab, setActiveTab] = useState<'prompt' | 'variables' | 'voice' | 'rules'>('prompt');

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
            if (!res.ok) throw new Error('Failed to fetch agents');
            const data = await res.json();
            setAgents(data.agents || []);
        } catch (err) {
            console.error('Agents fetch error:', err);
            setError(err instanceof Error ? err.message : 'Asistanlar yüklenirken bir hata oluştu');
        }
    }, [authFetch]);

    useEffect(() => {
        fetchAgents().finally(() => setLoading(false));
    }, [fetchAgents]);

    // ─────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────

    function handleNew() {
        setEditingAgent({ ...DEFAULT_AGENT });
        setIsNewAgent(true);
        setActiveTab('prompt');
        setEditorOpen(true);
    }

    function handleEdit(agent: Agent) {
        setEditingAgent({ ...agent });
        setIsNewAgent(false);
        setActiveTab('prompt');
        setEditorOpen(true);
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
        if (!editingAgent.name || !editingAgent.systemPrompt) {
            toast({
                title: 'Eksik Bilgi',
                description: 'Agent adı ve sistem promptu zorunludur',
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
                    name: editingAgent.name,
                    role: editingAgent.role,
                    systemPrompt: editingAgent.systemPrompt,
                    variables: editingAgent.variables,
                    voiceConfig: editingAgent.voiceConfig,
                    fallbackRules: editingAgent.fallbackRules,
                    isActive: editingAgent.isActive,
                }),
            });

            if (!res.ok) throw new Error('Save failed');

            toast({
                title: isNewAgent ? 'Oluşturuldu!' : 'Güncellendi!',
                description: `"${editingAgent.name}" başarıyla ${isNewAgent ? 'oluşturuldu' : 'güncellendi'}`,
                variant: 'success',
            });

            setEditorOpen(false);
            await fetchAgents();
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Agent kaydedilirken bir hata oluştu',
                variant: 'error',
            });
            console.error('Save error:', err);
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

            if (!res.ok) throw new Error('Delete failed');

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
            console.error('Delete error:', err);
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
        <div className="p-4 md:p-8">
            {/* Header */}
            <div className="animate-fade-in-down mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Bot className="h-8 w-8 text-violet-500" />
                            Sesli Asistanlar
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Sesli asistan promptlarını ve davranışlarını yapılandırın
                        </p>
                    </div>
                    <Button
                        onClick={handleNew}
                        className="gap-2 bg-violet-600 hover:bg-violet-700"
                    >
                        <Plus className="h-4 w-4" />
                        Yeni Asistan
                    </Button>
                </div>
            </div>

            {/* Agent List */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card
                            key={i}
                            className="animate-fade-in-up opacity-0"
                            style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'forwards' }}
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
                <Card className="animate-fade-in-up border-red-500/20">
                    <CardContent className="text-center py-16">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-500/10 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Yükleme Hatası</h3>
                        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            {error}
                        </p>
                        <Button
                            onClick={() => {
                                setLoading(true);
                                fetchAgents().finally(() => setLoading(false));
                            }}
                            className="gap-2 bg-violet-600 hover:bg-violet-700"
                        >
                            <Zap className="h-4 w-4" />
                            Tekrar Dene
                        </Button>
                    </CardContent>
                </Card>
            ) : agents.length === 0 && !loading ? (
                <div className="text-center py-16">
                    <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">Henüz asistan yok</h3>
                    <p className="text-sm text-muted-foreground/60 mt-1">Bir AI asistanı oluşturun</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agents.map((agent, index) => (
                        <Card
                            key={agent.id}
                            className="animate-fade-in-up opacity-0 cursor-pointer hover:border-violet-500/50 transition-all hover:shadow-lg hover:shadow-violet-500/5"
                            style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
                            onClick={() => handleEdit(agent)}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                            <Bot className="h-5 w-5 text-violet-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">{agent.name}</CardTitle>
                                            <p className="text-xs text-muted-foreground capitalize">{agent.role}</p>
                                        </div>
                                    </div>
                                    <Badge
                                        className={agent.isActive
                                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                            : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                                        }
                                    >
                                        {agent.isActive ? 'Aktif' : 'Pasif'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                    {agent.systemPrompt?.slice(0, 150)}...
                                </p>
                                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                                    {agent.variables && agent.variables.length > 0 && (
                                        <span className="flex items-center gap-1">
                                            <Code2 className="h-3 w-3" />
                                            {agent.variables.length} değişken
                                        </span>
                                    )}
                                    {agent.fallbackRules && agent.fallbackRules.length > 0 && (
                                        <span className="flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            {agent.fallbackRules.length} kural
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                        <Globe className="h-3 w-3" />
                                        {agent.voiceConfig?.language === 'tr' ? 'TR' : agent.voiceConfig?.language?.toUpperCase() || 'TR'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-4">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                                        onClick={(e) => { e.stopPropagation(); setTestingAgent(agent); }}
                                    >
                                        <MessageCircle className="h-3 w-3" />
                                        Test Et
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1"
                                        onClick={(e) => { e.stopPropagation(); handleEdit(agent); }}
                                    >
                                        <Edit3 className="h-3 w-3" />
                                        Düzenle
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-400 hover:text-red-500 hover:bg-red-500/10 gap-1"
                                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(agent.id); }}
                                        disabled={deletingId === agent.id}
                                    >
                                        {deletingId === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        Sil
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
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
                                                            placeholder="SmartFlow"
                                                            className="mt-1 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-1 pt-6">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-400 hover:text-red-500 h-8 w-8"
                                                            onClick={() => removeVariable(i)}
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
                                    <div className="grid grid-cols-2 gap-6">
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
                                className="gap-2 bg-violet-600 hover:bg-violet-700"
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

            {/* Voice Test Modal */}
            <VoiceTestModal
                isOpen={!!testingAgent}
                onClose={() => setTestingAgent(null)}
                tenantId="default"
                agentName={testingAgent?.name || 'SmartFlow AI'}
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
