'use client';

/**
 * Step 1: Identity — Agent name, role, language selection with preview
 */

import { Bot, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getTemplateById } from '@/lib/agents/templates';
import { AGENT_LANGUAGES } from '@/lib/agents/types';
import { useTranslations } from 'next-intl';
import { getIcon, ROLES } from './wizard-constants';

interface StepIdentityProps {
    agentName: string;
    setAgentName: (v: string) => void;
    agentRole: string;
    setAgentRole: (v: string) => void;
    language: string;
    setLanguage: (v: string) => void;
    selectedTemplateId: string | null;
}

export function StepIdentity({
    agentName, setAgentName,
    agentRole, setAgentRole,
    language, setLanguage,
    selectedTemplateId,
}: StepIdentityProps) {
    const t = useTranslations('agents');
    const template = selectedTemplateId ? getTemplateById(selectedTemplateId) : null;

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Left: Form */}
            <div className="space-y-6">
                {/* Template badge */}
                {template && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${template.borderColor} bg-white/[0.03]`}>
                        {(() => { const Icon = getIcon(template.icon); return <Icon className="h-3.5 w-3.5 text-white/60" />; })()}
                        <span className="text-xs text-white/60">{template.name} şablonu</span>
                    </div>
                )}

                {/* Agent Name */}
                <div>
                    <Label className="text-white/70 mb-2 text-sm">
                        Asistan Adı <span className="text-inception-red">*</span>
                    </Label>
                    <Input
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder={t('wizard.agentNamePlaceholder')}
                        className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-red/50 focus:ring-inception-red/20"
                    />
                    <p className="text-xs text-white/20 mt-1.5">Müşterilerinizin asistanı tanıyacağı isim</p>
                </div>

                {/* Agent Role */}
                <div>
                    <label className="block text-sm text-white/70 mb-3">Rol</label>
                    <div className="grid grid-cols-2 gap-2">
                        {ROLES.map(r => (
                            <button
                                key={r.value}
                                onClick={() => setAgentRole(r.value)}
                                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border
                                    ${agentRole === r.value
                                        ? 'bg-inception-red/10 text-inception-red border-inception-red/40 shadow-sm shadow-inception-red/10'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/[0.12]'
                                    }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Language */}
                <div>
                    <label className="block text-sm text-white/70 mb-2">Dil</label>
                    <div className="flex gap-2">
                        {AGENT_LANGUAGES.slice(0, 2).map(({ value, label, flag }) => (
                            <button
                                key={value}
                                onClick={() => setLanguage(value)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border
                                    ${language === value
                                        ? 'bg-inception-red/10 text-inception-red border-inception-red/40 shadow-sm'
                                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-white/80'
                                    }`}
                            >
                                <span className="text-lg">{flag}</span>
                                {label.split(' ')[1] || label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Preview */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 flex flex-col items-center justify-center text-center">
                <div className={`h-20 w-20 rounded-2xl flex items-center justify-center mb-4 ${template ? `bg-gradient-to-r ${template.color}` : 'bg-white/[0.06] border border-white/[0.10]'}`}>
                    {template ? (
                        (() => { const Icon = getIcon(template.icon); return <Icon className="h-10 w-10 text-white" />; })()
                    ) : (
                        <Bot className="h-10 w-10 text-white/30" />
                    )}
                </div>
                <h3 className="text-lg font-bold text-white font-display tracking-wide">
                    {agentName || 'Asistan Adı'}
                </h3>
                <p className="text-sm text-white/40 mt-1">
                    {ROLES.find(r => r.value === agentRole)?.label || agentRole}
                </p>
                <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="bg-white/[0.04] border-white/[0.08] text-white/50 text-xs">
                        <Globe className="h-3 w-3 mr-1" />
                        {AGENT_LANGUAGES.find(l => l.value === language)?.flag} {language.toUpperCase()}
                    </Badge>
                    {template && (
                        <Badge variant="outline" className={`${template.borderColor} text-white/50 text-xs`}>
                            {template.name}
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
}
