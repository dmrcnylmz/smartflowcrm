'use client';

/**
 * Step 2: Customize — Variables, system prompt editor, voice config, fallback rules
 */

import { useState } from 'react';
import {
    ChevronDown, ChevronUp, Volume2, AlertTriangle,
    Plus, X, CheckCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AgentVariable, FallbackRule, AgentVoiceConfig } from '@/lib/agents/types';
import { VOICE_STYLES } from '@/lib/agents/types';
import { VoiceSelector } from '@/components/voice/VoiceSelector';
import { getVoiceById, type VoiceCatalogEntry } from '@/lib/voice/voice-catalog';

interface StepCustomizeProps {
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
    language: string;
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
    isEnterprise: boolean;
}

export function StepCustomize({
    variables, setVariables,
    systemPrompt, setSystemPrompt,
    resolvedPrompt,
    voiceConfig, setVoiceConfig,
    fallbackRules, setFallbackRules,
    showAdvanced, setShowAdvanced,
    isSmartVariable, getSmartValue,
    language, authFetch, isEnterprise,
}: StepCustomizeProps) {
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
                        Değişkenler
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
                        Sistem Prompt&apos;u
                    </h3>
                    <button
                        onClick={() => setShowPrompt(!showPrompt)}
                        className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
                    >
                        {showPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {showPrompt ? 'Gizle' : 'Düzenle'}
                    </button>
                </div>

                {showPrompt ? (
                    <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={12}
                        className="rounded-xl resize-none bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50 text-sm font-mono"
                        placeholder="Asistan için sistem prompt'unu yazın..."
                    />
                ) : (
                    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 max-h-48 overflow-y-auto">
                        <pre className="text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed">
                            {resolvedPrompt || 'Henüz prompt yazılmadı...'}
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
                    Gelişmiş Ayarlar (Ses, Kurallar)
                </button>

                {showAdvanced && (
                    <div className="mt-4 space-y-6 animate-fade-in-up">
                        {/* Voice Config */}
                        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-4">
                            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
                                <Volume2 className="h-3.5 w-3.5" />
                                Ses Ayarları
                            </h4>

                            {/* TTS Voice Selection */}
                            <div>
                                <Label className="text-white/70 text-sm mb-2 block">TTS Ses Seçimi</Label>
                                <p className="text-xs text-white/40 mb-3">
                                    Asistanınızın telefonda kullanacağı sesi seçin. Dinlemek için ▶ tıklayın.
                                </p>

                                {/* Current voice badge */}
                                {voiceConfig.voiceCatalogId && (() => {
                                    const cv = getVoiceById(voiceConfig.voiceCatalogId);
                                    if (!cv) return null;
                                    return (
                                        <div className="mb-3 p-2.5 rounded-lg bg-inception-red/5 border border-inception-red/20 flex items-center gap-2">
                                            <CheckCircle className="h-3.5 w-3.5 text-inception-red" />
                                            <span className="text-sm text-white/90 font-medium">{cv.name}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{cv.provider}</span>
                                            <span className="text-xs text-white/40">{cv.tone}</span>
                                        </div>
                                    );
                                })()}

                                <div className="max-h-[280px] overflow-y-auto rounded-lg border border-white/[0.08] p-2">
                                    <VoiceSelector
                                        selectedVoiceId={voiceConfig.voiceCatalogId}
                                        onSelect={(voice: VoiceCatalogEntry) => setVoiceConfig({
                                            ...voiceConfig,
                                            voiceCatalogId: voice.id,
                                            ttsProvider: voice.provider,
                                        })}
                                        language={(language as 'tr' | 'en') || 'tr'}
                                        authFetch={authFetch}
                                        isEnterprise={isEnterprise}
                                        compact
                                    />
                                </div>
                            </div>

                            {/* Other voice settings */}
                            <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-white/50 text-xs mb-1">Konuşma Stili</Label>
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
                                    <Label className="text-white/50 text-xs mb-1">Sıcaklık ({voiceConfig.temperature})</Label>
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
                                        <Label className="text-white/40 text-[10px]">Koşul</Label>
                                        <Input
                                            value={rule.condition}
                                            onChange={(e) => {
                                                const updated = [...fallbackRules];
                                                updated[i] = { ...updated[i], condition: e.target.value };
                                                setFallbackRules(updated);
                                            }}
                                            className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                            placeholder="örn: Acil durum"
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
                                        <option value="escalate">Yükselt</option>
                                    </select>
                                    <div>
                                        <Label className="text-white/40 text-[10px]">Yanıt</Label>
                                        <Input
                                            value={rule.value}
                                            onChange={(e) => {
                                                const updated = [...fallbackRules];
                                                updated[i] = { ...updated[i], value: e.target.value };
                                                setFallbackRules(updated);
                                            }}
                                            className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                            placeholder="Yanıt mesajı"
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
                                <p className="text-xs text-white/20 text-center py-2">Henüz kural eklenmedi</p>
                            )}
                        </div>

                        {/* Custom Variables (add new) */}
                        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Özel Değişkenler</h4>
                                <button
                                    onClick={addVariable}
                                    className="text-xs text-inception-red hover:text-inception-red-light flex items-center gap-1"
                                >
                                    <Plus className="h-3 w-3" /> Değişken Ekle
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
                                                placeholder="değişken_adı"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-white/40 text-[10px]">Etiket</Label>
                                            <Input
                                                value={v.label}
                                                onChange={(e) => updateVariableField(realIndex, 'label', e.target.value)}
                                                className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                                placeholder="Değişken Etiketi"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-white/40 text-[10px]">Deger</Label>
                                            <Input
                                                value={v.defaultValue}
                                                onChange={(e) => updateVariable(realIndex, e.target.value)}
                                                className="h-8 rounded-lg bg-white/[0.04] border-white/[0.08] text-white text-xs"
                                                placeholder="Varsayılan değer"
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
