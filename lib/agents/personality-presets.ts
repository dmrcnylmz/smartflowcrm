/**
 * Personality Presets — Dynamic Tone Selection for Voice Agents
 *
 * Provides pre-built personality profiles that modify:
 * - System prompt suffix (tone instructions)
 * - Voice config style
 * - Temperature (creativity level)
 *
 * Presets are applied via `applyPersonalityPreset()` which appends
 * tone-specific instructions to the agent's systemPrompt and updates
 * the voiceConfig accordingly.
 *
 * Used by:
 * - app/api/agents/route.ts (POST with personalityPreset field)
 * - components/agents/PersonalitySelector.tsx (UI preset picker)
 */

import type { Agent, AgentVoiceConfig } from './types';

// =============================================
// Types
// =============================================

export type PersonalityPresetKey = 'formal' | 'friendly' | 'concise' | 'empathetic';

export interface PersonalityPreset {
    key: PersonalityPresetKey;
    label: string;
    labelEn: string;
    description: string;
    descriptionEn: string;
    icon: string;
    /** Example response in this personality for preview */
    example: string;
    /** Appended to systemPrompt to enforce tone */
    systemPromptSuffix: string;
    /** Maps to AgentVoiceConfig.style */
    voiceStyle: string;
    /** Recommended temperature for this tone */
    temperature: number;
}

// =============================================
// Preset Definitions
// =============================================

/** Marker comment injected into systemPrompt for preset detection + removal */
const PRESET_MARKER_START = '\n\n<!-- PERSONALITY_PRESET_START -->';
const PRESET_MARKER_END = '<!-- PERSONALITY_PRESET_END -->';

export const PERSONALITY_PRESETS: Record<PersonalityPresetKey, PersonalityPreset> = {
    formal: {
        key: 'formal',
        label: 'Resmi',
        labelEn: 'Formal',
        description: 'Siz hitabı, profesyonel dil, kısa ve net cümleler.',
        descriptionEn: 'Formal address, professional language, concise sentences.',
        icon: '🏢',
        example: 'Merhaba, size nasıl yardımcı olabilirim? Talebinizi en kısa sürede değerlendireceğiz.',
        systemPromptSuffix:
            'KONUŞMA TONU TALİMATI: Resmi ve profesyonel bir üslup kullan. ' +
            'Müşteriye her zaman "siz" hitabında bulun. Kısa, net ve saygılı cümleler kur. ' +
            'Argo veya günlük dil kullanma. İş diline uygun, güven veren bir ton benimse.',
        voiceStyle: 'formal',
        temperature: 0.3,
    },
    friendly: {
        key: 'friendly',
        label: 'Arkadaş Canlısı',
        labelEn: 'Friendly',
        description: 'Sıcak üslup, samimi yaklaşım, doğal konuşma.',
        descriptionEn: 'Warm tone, approachable, natural conversation.',
        icon: '😊',
        example: 'Merhaba! Nasılsınız? Size yardımcı olmak için buradayım, ne sormak istersiniz?',
        systemPromptSuffix:
            'KONUŞMA TONU TALİMATI: Samimi ve sıcak bir üslup kullan. ' +
            'Müşteriye "siz" veya duruma göre daha samimi bir hitap kullanabilirsin. ' +
            'Doğal, konuşma diline yakın cümleler kur. Müşteriyi rahat hissettir. ' +
            'Yardımsever ve pozitif bir ton benimse.',
        voiceStyle: 'friendly',
        temperature: 0.6,
    },
    concise: {
        key: 'concise',
        label: 'Kısa ve Öz',
        labelEn: 'Concise',
        description: 'Maksimum 2 cümle, gereksiz selamlama yok, direkt bilgi.',
        descriptionEn: 'Max 2 sentences, no unnecessary greetings, direct info.',
        icon: '⚡',
        example: 'İade süresi 14 gündür. Başka sorunuz var mı?',
        systemPromptSuffix:
            'KONUŞMA TONU TALİMATI: Çok kısa ve öz yanıt ver. ' +
            'Her yanıtın MAKSIMUM 2 CÜMLE olsun. Gereksiz selamlama, kibarlık cümleleri veya tekrar yapma. ' +
            'Doğrudan sorulan sorunun cevabını ver. Zaman kaybetme, müşterinin vaktine saygı göster.',
        voiceStyle: 'professional',
        temperature: 0.2,
    },
    empathetic: {
        key: 'empathetic',
        label: 'Empatik',
        labelEn: 'Empathetic',
        description: 'Anlayışlı, müşteriyi dinleyen, çözüm odaklı.',
        descriptionEn: 'Understanding, active listening, solution-focused.',
        icon: '💜',
        example: 'Yaşadığınız sorunu anlıyorum, bu gerçekten can sıkıcı olmuş. Hemen sizin için bir çözüm bulalım.',
        systemPromptSuffix:
            'KONUŞMA TONU TALİMATI: Empatik ve anlayışlı bir üslup kullan. ' +
            'Müşterinin duygularını anladığını göster. "Anlıyorum", "Haklısınız" gibi ifadeler kullan. ' +
            'Sorunu önemsediğini hissettir. Çözüm odaklı ol ama müşteriyi dinlediğini belli et. ' +
            'Sabırlı ve destekleyici bir ton benimse.',
        voiceStyle: 'empathetic',
        temperature: 0.5,
    },
};

// =============================================
// Preset Application
// =============================================

/**
 * Apply a personality preset to an agent's systemPrompt and voiceConfig.
 * Removes any existing preset suffix before applying the new one.
 *
 * Returns the updated fields (systemPrompt + voiceConfig) — does NOT mutate the input.
 */
export function applyPersonalityPreset(
    agent: Pick<Agent, 'systemPrompt' | 'voiceConfig'>,
    presetKey: PersonalityPresetKey,
): { systemPrompt: string; voiceConfig: AgentVoiceConfig; personalityPreset: PersonalityPresetKey } {
    const preset = PERSONALITY_PRESETS[presetKey];
    if (!preset) {
        throw new Error(`Unknown personality preset: ${presetKey}`);
    }

    // Remove existing preset suffix (if any)
    const cleanPrompt = stripPresetSuffix(agent.systemPrompt);

    // Append new preset suffix with markers
    const newPrompt = cleanPrompt +
        PRESET_MARKER_START + '\n' +
        preset.systemPromptSuffix + '\n' +
        PRESET_MARKER_END;

    return {
        systemPrompt: newPrompt,
        voiceConfig: {
            ...agent.voiceConfig,
            style: preset.voiceStyle,
            temperature: preset.temperature,
        },
        personalityPreset: presetKey,
    };
}

/**
 * Remove personality preset suffix from a systemPrompt.
 */
export function stripPresetSuffix(systemPrompt: string): string {
    const startIdx = systemPrompt.indexOf(PRESET_MARKER_START);
    if (startIdx === -1) return systemPrompt;

    const endIdx = systemPrompt.indexOf(PRESET_MARKER_END);
    if (endIdx === -1) return systemPrompt;

    return systemPrompt.slice(0, startIdx) + systemPrompt.slice(endIdx + PRESET_MARKER_END.length);
}

/**
 * Detect which personality preset is currently active on an agent.
 * Returns null if no preset suffix is found.
 */
export function getActivePreset(systemPrompt: string): PersonalityPresetKey | null {
    for (const [key, preset] of Object.entries(PERSONALITY_PRESETS)) {
        if (systemPrompt.includes(preset.systemPromptSuffix)) {
            return key as PersonalityPresetKey;
        }
    }
    return null;
}

/**
 * Get all available personality presets for UI display.
 */
export function getAvailablePresets(): PersonalityPreset[] {
    return Object.values(PERSONALITY_PRESETS);
}
