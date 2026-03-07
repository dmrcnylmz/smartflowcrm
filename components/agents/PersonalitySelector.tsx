'use client';

/**
 * PersonalitySelector — Visual Preset Picker for Agent Tone
 *
 * Displays 4 personality preset cards (Resmi, Arkadaş Canlısı, Kısa ve Öz, Empatik).
 * Each card shows: icon, label, description, and example response.
 * Selection updates the agent's systemPrompt + voiceConfig via API.
 *
 * Used in agent edit pages to allow admins to quickly set conversation tone.
 */

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    PERSONALITY_PRESETS,
    type PersonalityPresetKey,
} from '@/lib/agents/personality-presets';

// =============================================
// Types
// =============================================

interface PersonalitySelectorProps {
    /** Currently active preset (null if none / custom) */
    activePreset: PersonalityPresetKey | null;
    /** Callback when user selects a preset */
    onSelect: (presetKey: PersonalityPresetKey) => void | Promise<void>;
    /** Disable interactions (e.g., while saving) */
    disabled?: boolean;
}

// =============================================
// Component
// =============================================

export function PersonalitySelector({
    activePreset,
    onSelect,
    disabled = false,
}: PersonalitySelectorProps) {
    const [loading, setLoading] = useState<PersonalityPresetKey | null>(null);
    const presets = Object.values(PERSONALITY_PRESETS);

    const handleSelect = async (key: PersonalityPresetKey) => {
        if (disabled || loading) return;
        if (key === activePreset) return; // Already active

        setLoading(key);
        try {
            await onSelect(key);
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-slate-300">Konuşma Tonu</h3>
                {activePreset && (
                    <Badge variant="outline" className="text-xs">
                        {PERSONALITY_PRESETS[activePreset]?.label || activePreset}
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {presets.map((preset) => {
                    const isActive = activePreset === preset.key;
                    const isLoading = loading === preset.key;

                    return (
                        <button
                            key={preset.key}
                            onClick={() => handleSelect(preset.key)}
                            disabled={disabled || !!loading}
                            className={`
                                relative text-left p-4 rounded-xl border transition-all duration-200
                                ${isActive
                                    ? 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30'
                                    : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50 hover:bg-slate-800/80'
                                }
                                ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {/* Active indicator */}
                            {isActive && (
                                <div className="absolute top-3 right-3">
                                    <Check className="w-4 h-4 text-blue-400" />
                                </div>
                            )}

                            {/* Loading indicator */}
                            {isLoading && (
                                <div className="absolute top-3 right-3">
                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                </div>
                            )}

                            {/* Header */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{preset.icon}</span>
                                <span className="font-medium text-sm text-slate-200">
                                    {preset.label}
                                </span>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                                {preset.description}
                            </p>

                            {/* Example response preview */}
                            <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/30">
                                <p className="text-xs text-slate-500 mb-1 font-medium">Örnek:</p>
                                <p className="text-xs text-slate-300 italic leading-relaxed">
                                    &ldquo;{preset.example}&rdquo;
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
