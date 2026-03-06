/**
 * Agent Types — Shared type definitions for voice agent system
 *
 * Used by:
 * - app/agents/page.tsx (agent list & editor)
 * - components/agents/AgentCreationWizard.tsx (wizard)
 * - components/agents/AgentTestPanel.tsx (sandbox)
 * - lib/agents/templates.ts (template definitions)
 */

// =============================================
// Core Types
// =============================================

export interface AgentVariable {
    key: string;
    label: string;
    defaultValue: string;
}

export interface FallbackRule {
    condition: string;
    action: string;
    value: string;
}

export interface AgentVoiceConfig {
    style: string;
    temperature: number;
    maxTokens: number;
    language: string;
}

export interface Agent {
    id: string;
    name: string;
    role: string;
    systemPrompt: string;
    variables: AgentVariable[];
    voiceConfig: AgentVoiceConfig;
    fallbackRules: FallbackRule[];
    isActive: boolean;
    templateId?: string;
    templateColor?: string;
    createdAt?: { _seconds: number };
    updatedAt?: { _seconds: number };
}

/** Draft agent — used in wizard before saving (no id/timestamps) */
export type AgentDraft = Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>;

// =============================================
// Template Types
// =============================================

export interface AgentTestScenario {
    label: string;
    message: string;
}

export interface AgentTemplate {
    id: string;
    name: string;
    icon: string;
    color: string;
    borderColor: string;
    glowColor: string;
    description: string;
    features: string[];
    defaultName: string;
    defaultRole: string;
    systemPrompt: string;
    variables: AgentVariable[];
    voiceConfig: AgentVoiceConfig;
    fallbackRules: FallbackRule[];
    scenarios: AgentTestScenario[];
}

// =============================================
// Smart Variable Types
// =============================================

export interface SmartVariableMapping {
    key: string;
    label: string;
    tenantField: string; // dot-notation path in tenant settings
    fallback: string;
}

// =============================================
// Constants
// =============================================

export const VOICE_STYLES = [
    { value: 'professional', label: 'Profesyonel' },
    { value: 'friendly', label: 'Samimi' },
    { value: 'formal', label: 'Resmi' },
    { value: 'casual', label: 'Do\u011fal' },
    { value: 'empathetic', label: 'Empatik' },
] as const;

export const AGENT_LANGUAGES = [
    { value: 'tr', label: '\ud83c\uddf9\ud83c\uddf7 T\u00fcrk\u00e7e', flag: '\ud83c\uddf9\ud83c\uddf7' },
    { value: 'en', label: '\ud83c\uddec\ud83c\udde7 English', flag: '\ud83c\uddec\ud83c\udde7' },
    { value: 'de', label: '\ud83c\udde9\ud83c\uddea Deutsch', flag: '\ud83c\udde9\ud83c\uddea' },
    { value: 'ar', label: '\ud83c\uddf8\ud83c\udde6 \u0627\u0644\u0639\u0631\u0628\u064a\u0629', flag: '\ud83c\uddf8\ud83c\udde6' },
] as const;

export const DEFAULT_VOICE_CONFIG: AgentVoiceConfig = {
    style: 'professional',
    temperature: 0.7,
    maxTokens: 512,
    language: 'tr',
};
