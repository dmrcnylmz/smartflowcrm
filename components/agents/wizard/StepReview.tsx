'use client';

/**
 * Step 4: Review — Summary cards before agent creation
 */

import { Bot, Code2, Sparkles } from 'lucide-react';
import type { AgentVariable, FallbackRule, AgentVoiceConfig } from '@/lib/agents/types';
import { VOICE_STYLES, AGENT_LANGUAGES } from '@/lib/agents/types';
import { getTemplateById } from '@/lib/agents/templates';
import { getVoiceById } from '@/lib/voice/voice-catalog';
import { getIcon, ROLES_MAP } from './wizard-constants';

interface StepReviewProps {
    agentName: string;
    agentRole: string;
    language: string;
    selectedTemplateId: string | null;
    variables: AgentVariable[];
    voiceConfig: AgentVoiceConfig;
    fallbackRules: FallbackRule[];
    resolvedPrompt: string;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className="text-white/30 min-w-[80px] text-xs">{label}:</span>
            <span className="text-white/70 font-medium text-xs">{value}</span>
        </div>
    );
}

export function StepReview({
    agentName, agentRole, language, selectedTemplateId,
    variables, voiceConfig, fallbackRules, resolvedPrompt,
}: StepReviewProps) {
    const template = selectedTemplateId && selectedTemplateId !== 'scratch' ? getTemplateById(selectedTemplateId) : null;

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
                        <h3 className="font-semibold text-white text-sm">Asistan Kimliği</h3>
                        <p className="text-xs text-white/30">Adım 1-3</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <ReviewItem label="Ad" value={agentName} />
                    <ReviewItem label="Rol" value={ROLES_MAP[agentRole] || agentRole} />
                    <ReviewItem label="Dil" value={AGENT_LANGUAGES.find(l => l.value === language)?.label || language} />
                    {template && <ReviewItem label="Şablon" value={template.name} />}
                    <ReviewItem label="Ses Stili" value={VOICE_STYLES.find(s => s.value === voiceConfig.style)?.label || voiceConfig.style} />
                    {voiceConfig.voiceCatalogId && (() => {
                        const cv = getVoiceById(voiceConfig.voiceCatalogId);
                        return cv ? <ReviewItem label="TTS Ses" value={`${cv.name} (${cv.provider})`} /> : null;
                    })()}
                </div>
            </div>

            {/* Variables Summary */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <Code2 className="h-4 w-4 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">Değişkenler & Kurallar</h3>
                        <p className="text-xs text-white/30">{variables.length} değişken, {fallbackRules.length} kural</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    {variables.map((v, i) => (
                        <ReviewItem key={i} label={v.label || v.key} value={v.defaultValue || '(boş)'} />
                    ))}
                    {variables.length === 0 && (
                        <p className="text-xs text-white/20">Değişken tanımlanmadı</p>
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
                        <h3 className="font-semibold text-white text-sm">Sistem Prompt&apos;u</h3>
                        <p className="text-xs text-white/30">{resolvedPrompt.length} karakter</p>
                    </div>
                </div>
                <div className="bg-white/[0.02] rounded-lg border border-white/[0.04] p-4 max-h-40 overflow-y-auto">
                    <pre className="text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed">
                        {resolvedPrompt || 'Prompt henüz yazılmadı'}
                    </pre>
                </div>
            </div>

            {/* Ready Banner */}
            <div className="md:col-span-2 bg-inception-red/5 rounded-xl border border-inception-red/20 p-5">
                <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-inception-red flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-white text-sm font-display tracking-wide">OLUŞTURMAYA HAZIR</h4>
                        <p className="text-xs text-white/40 mt-1">
                            &quot;Asistanı Oluştur&quot; butonuna tıkladığınızda asistanız kaydedilecek ve kullanıma hazır hale gelecek.
                            Oluşturduktan sonra test edebilir ve ayarlarını düzenleyebilirsiniz.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
