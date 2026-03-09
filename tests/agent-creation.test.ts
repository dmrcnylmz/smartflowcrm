/**
 * Agent Creation Tests — Encoding, Templates, and Types
 *
 * Tests:
 * - Turkish character encoding in types.ts (VOICE_STYLES, AGENT_LANGUAGES)
 * - Template labels use proper Turkish chars (not ASCII approximations)
 * - Smart variable resolution from tenant settings
 * - Template structure completeness
 */

import { describe, it, expect } from 'vitest';
import { VOICE_STYLES, AGENT_LANGUAGES, DEFAULT_VOICE_CONFIG } from '@/lib/agents/types';
import { AGENT_TEMPLATES, SMART_VARIABLE_KEYS, resolveSmartVariable, getTemplateById } from '@/lib/agents/templates';

// =============================================
// Turkish Encoding Tests
// =============================================

describe('Turkish Character Encoding', () => {
    describe('VOICE_STYLES', () => {
        it('should contain 5 styles', () => {
            expect(VOICE_STYLES).toHaveLength(5);
        });

        it('should use native UTF-8 Turkish characters (no Unicode escapes)', () => {
            const labels = VOICE_STYLES.map(s => s.label);
            expect(labels).toContain('Doğal');
            expect(labels).toContain('Profesyonel');
            expect(labels).toContain('Samimi');
            expect(labels).toContain('Resmi');
            expect(labels).toContain('Empatik');
        });

        it('should not contain Unicode escape sequences in labels', () => {
            VOICE_STYLES.forEach(style => {
                expect(style.label).not.toMatch(/\\u[0-9a-fA-F]{4}/);
            });
        });
    });

    describe('AGENT_LANGUAGES', () => {
        it('should contain 4 languages', () => {
            expect(AGENT_LANGUAGES).toHaveLength(4);
        });

        it('should use native UTF-8 Turkish characters', () => {
            const trLang = AGENT_LANGUAGES.find(l => l.value === 'tr');
            expect(trLang).toBeDefined();
            expect(trLang!.label).toContain('Türkçe');
            expect(trLang!.flag).toBe('🇹🇷');
        });

        it('should not contain Unicode escape sequences in labels', () => {
            AGENT_LANGUAGES.forEach(lang => {
                expect(lang.label).not.toMatch(/\\u[0-9a-fA-F]{4}/);
            });
        });
    });

    describe('DEFAULT_VOICE_CONFIG', () => {
        it('should have default Turkish language', () => {
            expect(DEFAULT_VOICE_CONFIG.language).toBe('tr');
        });

        it('should have professional style', () => {
            expect(DEFAULT_VOICE_CONFIG.style).toBe('professional');
        });
    });
});

// =============================================
// Smart Variable Labels — Turkish Characters
// =============================================

describe('SMART_VARIABLE_KEYS', () => {
    it('should have 7 smart variables', () => {
        expect(SMART_VARIABLE_KEYS).toHaveLength(7);
    });

    it('should use proper Turkish characters in labels', () => {
        const labels = SMART_VARIABLE_KEYS.map(v => v.label);
        expect(labels).toContain('Şirket Adı');
        expect(labels).toContain('Çalışma Saatleri');
        expect(labels).toContain('Çalışma Günleri');
    });

    it('should NOT contain ASCII approximations like Sirket, Calisma, Gunleri', () => {
        SMART_VARIABLE_KEYS.forEach(v => {
            expect(v.label).not.toMatch(/^Sirket/);
            expect(v.label).not.toMatch(/^Calisma/);
            expect(v.label).not.toMatch(/Gunleri$/);
        });
    });

    it('should resolve company_name from tenant settings', () => {
        const result = resolveSmartVariable('company_name', { companyName: 'TestCo' });
        expect(result).toBe('TestCo');
    });

    it('should resolve nested working_hours from tenant settings', () => {
        const result = resolveSmartVariable('working_hours', {
            business: { workingHours: '09:00-17:00' },
        });
        expect(result).toBe('09:00-17:00');
    });

    it('should return fallback when tenant field is missing', () => {
        const result = resolveSmartVariable('working_hours', {});
        expect(result).toBe('09:00-18:00');
    });

    it('should return null for unknown variable key', () => {
        const result = resolveSmartVariable('unknown_key', {});
        expect(result).toBeNull();
    });
});

// =============================================
// Template Structure Tests
// =============================================

describe('AGENT_TEMPLATES', () => {
    it('should have exactly 10 templates', () => {
        expect(AGENT_TEMPLATES).toHaveLength(10);
    });

    it('should have unique IDs', () => {
        const ids = AGENT_TEMPLATES.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    const requiredFields = ['id', 'name', 'icon', 'color', 'description', 'features', 'defaultName', 'defaultRole', 'systemPrompt', 'variables', 'voiceConfig', 'fallbackRules', 'scenarios'];

    it.each(AGENT_TEMPLATES.map(t => [t.id, t]))('template "%s" should have all required fields', (_id, template) => {
        requiredFields.forEach(field => {
            expect(template).toHaveProperty(field);
        });
    });

    it.each(AGENT_TEMPLATES.map(t => [t.id, t]))('template "%s" should have at least 1 feature', (_id, template) => {
        expect(template.features.length).toBeGreaterThanOrEqual(1);
    });

    it.each(AGENT_TEMPLATES.map(t => [t.id, t]))('template "%s" should have at least 1 scenario', (_id, template) => {
        expect(template.scenarios.length).toBeGreaterThanOrEqual(1);
    });

    it.each(AGENT_TEMPLATES.map(t => [t.id, t]))('template "%s" should use Turkish characters in name (not ASCII)', (_id, template) => {
        // Check template names don't contain common ASCII Turkish approximations
        expect(template.name).not.toMatch(/\bSaglik\b/);
        expect(template.name).not.toMatch(/\bMagaza\b/);
        expect(template.name).not.toMatch(/\bEgitim\b/);
        expect(template.name).not.toMatch(/\bBurosu\b/);
        expect(template.name).not.toMatch(/\bDanismani\b/);
    });

    it.each(AGENT_TEMPLATES.map(t => [t.id, t]))('template "%s" variable labels should use Turkish characters', (_id, template) => {
        template.variables.forEach(v => {
            expect(v.label).not.toMatch(/^Sirket /);
            expect(v.label).not.toMatch(/^Calisma /);
            expect(v.label).not.toMatch(/Gunleri$/);
        });
    });

    describe('getTemplateById', () => {
        it('should return template when found', () => {
            const template = getTemplateById('healthcare');
            expect(template).toBeDefined();
            expect(template!.name).toContain('Sağlık');
        });

        it('should return undefined for unknown ID', () => {
            const template = getTemplateById('nonexistent');
            expect(template).toBeUndefined();
        });
    });
});

// =============================================
// Template System Prompt — Variable Placeholders
// =============================================

describe('Template System Prompts', () => {
    it.each(AGENT_TEMPLATES.map(t => [t.id, t]))('template "%s" should have matching variable keys in prompt', (_id, template) => {
        const variableKeys = template.variables.map(v => v.key);
        variableKeys.forEach(key => {
            expect(template.systemPrompt).toContain(`{${key}}`);
        });
    });

    it('healthcare template should reference working_hours and working_days', () => {
        const t = getTemplateById('healthcare')!;
        expect(t.systemPrompt).toContain('{working_hours}');
        expect(t.systemPrompt).toContain('{working_days}');
    });
});
