import { describe, it, expect } from 'vitest';
import {
    applyPersonalityPreset,
    stripPresetSuffix,
    getActivePreset,
    getAvailablePresets,
    PERSONALITY_PRESETS,
    type PersonalityPresetKey,
    type PersonalityPreset,
} from '@/lib/agents/personality-presets';
import type { AgentVoiceConfig } from '@/lib/agents/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal agent-like object accepted by applyPersonalityPreset. */
function makeAgent(overrides?: Partial<{ systemPrompt: string; voiceConfig: AgentVoiceConfig }>) {
    return {
        systemPrompt: overrides?.systemPrompt ?? 'Sen bir müşteri hizmetleri asistanısın.',
        voiceConfig: overrides?.voiceConfig ?? {
            style: 'neutral',
            temperature: 0.4,
            maxTokens: 512,
            language: 'tr-TR',
        },
    };
}

const ALL_PRESET_KEYS: PersonalityPresetKey[] = ['formal', 'friendly', 'concise', 'empathetic'];

// ---------------------------------------------------------------------------
// applyPersonalityPreset
// ---------------------------------------------------------------------------

describe('applyPersonalityPreset', () => {
    it.each(ALL_PRESET_KEYS)(
        'applies the "%s" preset and returns the correct personalityPreset key',
        (key) => {
            const agent = makeAgent();
            const result = applyPersonalityPreset(agent, key);
            expect(result.personalityPreset).toBe(key);
        },
    );

    it('appends the preset suffix wrapped in marker comments', () => {
        const agent = makeAgent();
        const result = applyPersonalityPreset(agent, 'formal');

        expect(result.systemPrompt).toContain('<!-- PERSONALITY_PRESET_START -->');
        expect(result.systemPrompt).toContain('<!-- PERSONALITY_PRESET_END -->');
        expect(result.systemPrompt).toContain(PERSONALITY_PRESETS.formal.systemPromptSuffix);
    });

    it('preserves the original system prompt text before the marker', () => {
        const originalPrompt = 'Custom base prompt for the agent.';
        const agent = makeAgent({ systemPrompt: originalPrompt });
        const result = applyPersonalityPreset(agent, 'friendly');

        expect(result.systemPrompt.startsWith(originalPrompt)).toBe(true);
    });

    it('updates voiceConfig.style to the preset voiceStyle', () => {
        const agent = makeAgent();
        const result = applyPersonalityPreset(agent, 'concise');

        expect(result.voiceConfig.style).toBe(PERSONALITY_PRESETS.concise.voiceStyle);
    });

    it('updates voiceConfig.temperature to the preset temperature', () => {
        const agent = makeAgent();
        const result = applyPersonalityPreset(agent, 'empathetic');

        expect(result.voiceConfig.temperature).toBe(PERSONALITY_PRESETS.empathetic.temperature);
    });

    it('preserves other voiceConfig fields (maxTokens, language)', () => {
        const agent = makeAgent({
            voiceConfig: { style: 'neutral', temperature: 0.4, maxTokens: 1024, language: 'en-US' },
        });
        const result = applyPersonalityPreset(agent, 'formal');

        expect(result.voiceConfig.maxTokens).toBe(1024);
        expect(result.voiceConfig.language).toBe('en-US');
    });

    it('does not mutate the original agent object', () => {
        const agent = makeAgent();
        const originalPrompt = agent.systemPrompt;
        const originalStyle = agent.voiceConfig.style;

        applyPersonalityPreset(agent, 'friendly');

        expect(agent.systemPrompt).toBe(originalPrompt);
        expect(agent.voiceConfig.style).toBe(originalStyle);
    });

    it('throws an Error for an unknown preset key', () => {
        const agent = makeAgent();
        expect(() =>
            applyPersonalityPreset(agent, 'aggressive' as PersonalityPresetKey),
        ).toThrowError('Unknown personality preset: aggressive');
    });

    it('strips an existing preset before applying a new one (no double markers)', () => {
        const agent = makeAgent();
        const first = applyPersonalityPreset(agent, 'formal');

        // Apply a second preset on top of the first result
        const second = applyPersonalityPreset(
            { systemPrompt: first.systemPrompt, voiceConfig: first.voiceConfig },
            'empathetic',
        );

        // There should be exactly ONE start marker and ONE end marker
        const startCount = (second.systemPrompt.match(/<!-- PERSONALITY_PRESET_START -->/g) || []).length;
        const endCount = (second.systemPrompt.match(/<!-- PERSONALITY_PRESET_END -->/g) || []).length;

        expect(startCount).toBe(1);
        expect(endCount).toBe(1);

        // The old preset suffix should be gone, the new one present
        expect(second.systemPrompt).not.toContain(PERSONALITY_PRESETS.formal.systemPromptSuffix);
        expect(second.systemPrompt).toContain(PERSONALITY_PRESETS.empathetic.systemPromptSuffix);
    });

    it('produces correct voiceConfig values for each preset', () => {
        for (const key of ALL_PRESET_KEYS) {
            const result = applyPersonalityPreset(makeAgent(), key);
            const preset = PERSONALITY_PRESETS[key];
            expect(result.voiceConfig.style).toBe(preset.voiceStyle);
            expect(result.voiceConfig.temperature).toBe(preset.temperature);
        }
    });
});

// ---------------------------------------------------------------------------
// stripPresetSuffix
// ---------------------------------------------------------------------------

describe('stripPresetSuffix', () => {
    it('returns the original string when no markers are present', () => {
        const plain = 'Just a regular system prompt.';
        expect(stripPresetSuffix(plain)).toBe(plain);
    });

    it('removes everything between (and including) the markers', () => {
        const agent = makeAgent();
        const applied = applyPersonalityPreset(agent, 'friendly');
        const stripped = stripPresetSuffix(applied.systemPrompt);

        expect(stripped).toBe(agent.systemPrompt);
        expect(stripped).not.toContain('<!-- PERSONALITY_PRESET_START -->');
        expect(stripped).not.toContain('<!-- PERSONALITY_PRESET_END -->');
        expect(stripped).not.toContain(PERSONALITY_PRESETS.friendly.systemPromptSuffix);
    });

    it('handles an empty string without throwing', () => {
        expect(stripPresetSuffix('')).toBe('');
    });

    it('leaves text after the end marker intact', () => {
        // Construct a prompt with extra text appended after the end marker
        const base = 'Base prompt.';
        const extra = '\nExtra content after preset.';
        const withPreset = applyPersonalityPreset(makeAgent({ systemPrompt: base }), 'concise');
        const manuallyAppended = withPreset.systemPrompt + extra;
        const stripped = stripPresetSuffix(manuallyAppended);

        expect(stripped).toBe(base + extra);
    });
});

// ---------------------------------------------------------------------------
// getActivePreset
// ---------------------------------------------------------------------------

describe('getActivePreset', () => {
    it.each(ALL_PRESET_KEYS)(
        'detects the "%s" preset in a system prompt',
        (key) => {
            const result = applyPersonalityPreset(makeAgent(), key);
            expect(getActivePreset(result.systemPrompt)).toBe(key);
        },
    );

    it('returns null for a plain system prompt with no preset', () => {
        expect(getActivePreset('Just a normal prompt without preset instructions.')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(getActivePreset('')).toBeNull();
    });

    it('still detects a preset after stripping and re-applying', () => {
        const applied = applyPersonalityPreset(makeAgent(), 'formal');
        const stripped = stripPresetSuffix(applied.systemPrompt);
        const reApplied = applyPersonalityPreset(
            { systemPrompt: stripped, voiceConfig: applied.voiceConfig },
            'friendly',
        );

        expect(getActivePreset(reApplied.systemPrompt)).toBe('friendly');
    });
});

// ---------------------------------------------------------------------------
// getAvailablePresets
// ---------------------------------------------------------------------------

describe('getAvailablePresets', () => {
    it('returns exactly 4 presets', () => {
        const presets = getAvailablePresets();
        expect(presets).toHaveLength(4);
    });

    it('returns an array (not a plain object)', () => {
        const presets = getAvailablePresets();
        expect(Array.isArray(presets)).toBe(true);
    });

    it('contains all expected preset keys', () => {
        const keys = getAvailablePresets().map((p) => p.key);
        expect(keys).toEqual(expect.arrayContaining(ALL_PRESET_KEYS));
    });

    const requiredFields: (keyof PersonalityPreset)[] = [
        'key',
        'label',
        'labelEn',
        'description',
        'descriptionEn',
        'icon',
        'example',
        'systemPromptSuffix',
        'voiceStyle',
        'temperature',
    ];

    it.each(requiredFields)('every preset has the required field "%s"', (field) => {
        for (const preset of getAvailablePresets()) {
            expect(preset[field]).toBeDefined();
            // String fields should be non-empty; temperature is a number
            if (typeof preset[field] === 'string') {
                expect((preset[field] as string).length).toBeGreaterThan(0);
            }
        }
    });

    it('each preset has a numeric temperature between 0 and 1', () => {
        for (const preset of getAvailablePresets()) {
            expect(typeof preset.temperature).toBe('number');
            expect(preset.temperature).toBeGreaterThanOrEqual(0);
            expect(preset.temperature).toBeLessThanOrEqual(1);
        }
    });
});
