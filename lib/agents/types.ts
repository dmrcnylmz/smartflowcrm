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
    /** Selected voice catalog ID (e.g. 'el-yildiz', 'gm-kore', 'kk-af-heart') */
    voiceCatalogId?: string;
    /** TTS provider override (derived from catalog entry) */
    ttsProvider?: 'elevenlabs' | 'google' | 'openai' | 'kokoro';
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
    { value: 'casual', label: 'Doğal' },
    { value: 'empathetic', label: 'Empatik' },
] as const;

export const AGENT_LANGUAGES = [
    { value: 'tr', label: '🇹🇷 Türkçe', flag: '🇹🇷' },
    { value: 'en', label: '🇬🇧 English', flag: '🇬🇧' },
    { value: 'de', label: '🇩🇪 Deutsch', flag: '🇩🇪' },
    { value: 'ar', label: '🇸🇦 العربية', flag: '🇸🇦' },
] as const;

export const DEFAULT_VOICE_CONFIG: AgentVoiceConfig = {
    style: 'professional',
    temperature: 0.7,
    maxTokens: 512,
    language: 'tr',
    voiceCatalogId: 'gm-kore',
    ttsProvider: 'google',
};
