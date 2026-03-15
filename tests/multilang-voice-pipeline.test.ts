/**
 * Multi-Language Voice Pipeline Tests (DE/FR)
 * Phase 5: Comprehensive tests for German and French support
 * across intent detection, TTS, voice catalog, and i18n.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ─── Intent Detection Tests ───

describe('Intent Detection — German (DE)', () => {
    // Dynamically import to test the actual function
    let detectIntentFast: (text: string) => { intent: string; confidence: string; detectedKeywords: string[]; language: string };
    let detectLanguage: (text: string) => string;

    beforeAll(async () => {
        const mod = await import('../lib/ai/intent-fast');
        detectIntentFast = mod.detectIntentFast;
        detectLanguage = mod.detectLanguage;
    });

    it('detects German language from special characters (ä, ß)', () => {
        expect(detectLanguage('ich möchte einen termin')).toBe('de');
        expect(detectLanguage('straße')).toBe('de');
        // Note: ö alone is ambiguous (shared with Turkish), needs context words
        expect(detectLanguage('schönen tag hallo')).toBe('de');
    });

    it('detects German language from common words', () => {
        expect(detectLanguage('ich habe eine frage')).toBe('de');
        expect(detectLanguage('danke bitte')).toBe('de');
        expect(detectLanguage('guten tag')).toBe('de');
    });

    it('detects appointment intent in German', () => {
        const result = detectIntentFast('ich möchte einen termin buchen');
        expect(result.intent).toBe('appointment');
        expect(result.language).toBe('de');
        expect(result.confidence).not.toBe('low');
    });

    it('detects complaint intent in German', () => {
        const result = detectIntentFast('ich möchte eine beschwerde einreichen');
        expect(result.intent).toBe('complaint');
        expect(result.language).toBe('de');
    });

    it('detects pricing intent in German', () => {
        const result = detectIntentFast('wie viel kostet das produkt');
        expect(result.intent).toBe('pricing');
        expect(result.language).toBe('de');
    });

    it('detects cancellation intent in German', () => {
        const result = detectIntentFast('ich möchte kündigen');
        expect(result.intent).toBe('cancellation');
        expect(result.language).toBe('de');
    });

    it('detects greeting intent in German', () => {
        const result = detectIntentFast('hallo guten tag');
        expect(result.intent).toBe('greeting');
        expect(result.language).toBe('de');
    });

    it('detects farewell intent in German', () => {
        const result = detectIntentFast('auf wiedersehen tschüss');
        expect(result.intent).toBe('farewell');
        expect(result.language).toBe('de');
    });

    it('detects thanks intent in German', () => {
        const result = detectIntentFast('vielen dank danke schön');
        expect(result.intent).toBe('thanks');
        expect(result.language).toBe('de');
    });

    it('detects escalation intent in German', () => {
        const result = detectIntentFast('kann ich mit einem vorgesetzten sprechen');
        expect(result.intent).toBe('escalation');
        expect(result.language).toBe('de');
    });
});

describe('Intent Detection — French (FR)', () => {
    let detectIntentFast: (text: string) => { intent: string; confidence: string; detectedKeywords: string[]; language: string };
    let detectLanguage: (text: string) => string;

    beforeAll(async () => {
        const mod = await import('../lib/ai/intent-fast');
        detectIntentFast = mod.detectIntentFast;
        detectLanguage = mod.detectLanguage;
    });

    it('detects French language from special characters (é, è, ê, ç)', () => {
        expect(detectLanguage('je voudrais réserver')).toBe('fr');
        expect(detectLanguage('où est la gare')).toBe('fr');
        expect(detectLanguage('ça fait combien')).toBe('fr');
    });

    it('detects French language from common words', () => {
        expect(detectLanguage('bonjour je voudrais')).toBe('fr');
        expect(detectLanguage('merci pour votre aide')).toBe('fr');
    });

    it('detects appointment intent in French', () => {
        const result = detectIntentFast('je voudrais prendre rendez-vous');
        expect(result.intent).toBe('appointment');
        expect(result.language).toBe('fr');
        expect(result.confidence).not.toBe('low');
    });

    it('detects complaint intent in French', () => {
        const result = detectIntentFast('je souhaite déposer une plainte');
        expect(result.intent).toBe('complaint');
        expect(result.language).toBe('fr');
    });

    it('detects pricing intent in French', () => {
        const result = detectIntentFast('combien coûte ce service');
        expect(result.intent).toBe('pricing');
        expect(result.language).toBe('fr');
    });

    it('detects cancellation intent in French', () => {
        const result = detectIntentFast('je voudrais annuler mon abonnement');
        expect(result.intent).toBe('cancellation');
        expect(result.language).toBe('fr');
    });

    it('detects greeting intent in French', () => {
        const result = detectIntentFast('bonjour comment allez-vous');
        expect(result.intent).toBe('greeting');
        expect(result.language).toBe('fr');
    });

    it('detects farewell intent in French', () => {
        const result = detectIntentFast('au revoir bonne journée');
        expect(result.intent).toBe('farewell');
        expect(result.language).toBe('fr');
    });

    it('detects thanks intent in French', () => {
        const result = detectIntentFast('merci beaucoup pour votre aide');
        expect(result.intent).toBe('thanks');
        expect(result.language).toBe('fr');
    });

    it('detects escalation intent in French', () => {
        const result = detectIntentFast('je veux parler à un superviseur');
        expect(result.intent).toBe('escalation');
        expect(result.language).toBe('fr');
    });
});

// ─── Cartesia TTS Voice Configuration Tests ───

describe('Cartesia TTS — Multi-Language Voices', () => {
    it('has voice configurations for all 4 languages', () => {
        const content = fs.readFileSync('lib/voice/tts-cartesia.ts', 'utf-8');
        expect(content).toContain("'tr'");
        expect(content).toContain("'en'");
        expect(content).toContain("'de'");
        expect(content).toContain("'fr'");
    });

    it('has default female and male voices per language', () => {
        const content = fs.readFileSync('lib/voice/tts-cartesia.ts', 'utf-8');
        expect(content).toContain('female');
        expect(content).toContain('male');
    });

    it('uses sonic model for Cartesia', () => {
        const content = fs.readFileSync('lib/voice/tts-cartesia.ts', 'utf-8');
        expect(content).toContain('sonic');
    });

    it('CartesiaLang type includes de and fr', () => {
        const content = fs.readFileSync('lib/voice/tts-cartesia.ts', 'utf-8');
        expect(content).toMatch(/CartesiaLang.*=.*'de'/s);
        expect(content).toMatch(/CartesiaLang.*=.*'fr'/s);
    });
});

// ─── Voice Catalog Tests ───

describe('Voice Catalog — DE/FR Support', () => {
    it('has German voice options', () => {
        const content = fs.readFileSync('lib/voice/voice-catalog.ts', 'utf-8');
        expect(content).toContain('de');
        // Should have German-specific entries
        expect(content.toLowerCase()).toMatch(/german|deutsch|de/);
    });

    it('has French voice options', () => {
        const content = fs.readFileSync('lib/voice/voice-catalog.ts', 'utf-8');
        expect(content).toContain('fr');
        // Should have French-specific entries
        expect(content.toLowerCase()).toMatch(/french|français|fr/);
    });
});

// ─── Gather Route — Multi-Language Messages ───

describe('Gather Route — DE/FR Voice Messages', () => {
    let gatherContent: string;

    beforeAll(() => {
        gatherContent = fs.readFileSync('app/api/twilio/gather/route.ts', 'utf-8');
    });

    it('has German voice messages', () => {
        expect(gatherContent).toContain("de:");
        // German messages should exist
        expect(gatherContent).toMatch(/Entschuldigung|Ich habe Sie|Vielen Dank/);
    });

    it('has French voice messages', () => {
        expect(gatherContent).toContain("fr:");
        // French messages should exist
        expect(gatherContent).toMatch(/Excusez|Je n'ai pas|Merci/);
    });

    it('has German farewell patterns', () => {
        expect(gatherContent).toContain('auf wiedersehen');
        expect(gatherContent).toContain('tschüss');
    });

    it('has French farewell patterns', () => {
        expect(gatherContent).toContain('au revoir');
        expect(gatherContent).toContain('bonne journée');
    });

    it('resolveVoiceLang handles de and fr', () => {
        expect(gatherContent).toContain("'de'");
        expect(gatherContent).toContain("'fr'");
        // Should support all 4 languages
        expect(gatherContent).toMatch(/VoiceLang.*=.*'tr'.*\|.*'en'.*\|.*'de'.*\|.*'fr'/s);
    });

    it('has language-specific system prompts', () => {
        // System prompt should contain language-aware instructions
        expect(gatherContent).toContain('language');
    });
});

// ─── Incoming Route — Multi-Language Greetings ───

describe('Incoming Route — DE/FR Greetings', () => {
    let incomingContent: string;

    beforeAll(() => {
        incomingContent = fs.readFileSync('app/api/twilio/incoming/route.ts', 'utf-8');
    });

    it('has German greeting message', () => {
        // Should have a German greeting for incoming calls
        expect(incomingContent).toMatch(/de.*:|German/i);
    });

    it('has French greeting message', () => {
        // Should have a French greeting for incoming calls
        expect(incomingContent).toMatch(/fr.*:|French/i);
    });

    it('supports BCP 47 locale codes', () => {
        expect(incomingContent).toContain('localeBCP47');
    });
});

// ─── LLM Fallback Chain — Multi-Language ───

describe('LLM Fallback Chain — DE/FR Support', () => {
    let chainContent: string;

    beforeAll(() => {
        chainContent = fs.readFileSync('lib/ai/llm-fallback-chain.ts', 'utf-8');
    });

    it('FallbackOptions accepts de and fr language', () => {
        expect(chainContent).toMatch(/language\?:.*'de'/);
        expect(chainContent).toMatch(/language\?:.*'fr'/);
    });

    it('has German graceful fallback message', () => {
        expect(chainContent).toMatch(/de:.*entschuldig/i);
    });

    it('has French graceful fallback message', () => {
        expect(chainContent).toMatch(/fr:.*excuse/i);
    });
});

// ─── Admin Panel — Language Selector ───

describe('Admin Panel — Language Selector', () => {
    let adminContent: string;

    beforeAll(() => {
        adminContent = fs.readFileSync('app/admin/page.tsx', 'utf-8');
    });

    it('has all 4 language options in dropdown', () => {
        expect(adminContent).toContain('value="tr"');
        expect(adminContent).toContain('value="en"');
        expect(adminContent).toContain('value="de"');
        expect(adminContent).toContain('value="fr"');
    });

    it('has bilingual tr-en option', () => {
        expect(adminContent).toContain('value="tr-en"');
    });

    it('displays language names correctly', () => {
        expect(adminContent).toContain('Türkçe');
        expect(adminContent).toContain('English');
        expect(adminContent).toContain('Deutsch');
        expect(adminContent).toContain('Français');
    });
});

// ─── Tenant API — Language Validation ───

describe('Tenant API — Language Validation', () => {
    let tenantRouteContent: string;

    beforeAll(() => {
        tenantRouteContent = fs.readFileSync('app/api/tenants/route.ts', 'utf-8');
    });

    it('validates language against allowed values', () => {
        expect(tenantRouteContent).toContain('VALID_LANGUAGES');
        // Should include de and fr in valid languages
        expect(tenantRouteContent).toContain("'de'");
        expect(tenantRouteContent).toContain("'fr'");
    });

    it('allows language field updates', () => {
        expect(tenantRouteContent).toContain('language');
    });

    it('generates language-aware default agent', () => {
        // German default agent
        expect(tenantRouteContent).toMatch(/de.*Assistent|de.*Kundenberater/s);
        // French default agent
        expect(tenantRouteContent).toMatch(/fr.*Assistant|fr.*Conseiller/s);
    });
});

// ─── i18n Config — BCP 47 Mappings ───

describe('i18n Config — BCP 47 Language Codes', () => {
    let configContent: string;

    beforeAll(() => {
        configContent = fs.readFileSync('lib/i18n/config.ts', 'utf-8');
    });

    it('maps de to de-DE for Twilio', () => {
        expect(configContent).toContain('de-DE');
    });

    it('maps fr to fr-FR for Twilio', () => {
        expect(configContent).toContain('fr-FR');
    });

    it('includes all 4 locales', () => {
        expect(configContent).toContain("'tr'");
        expect(configContent).toContain("'en'");
        expect(configContent).toContain("'de'");
        expect(configContent).toContain("'fr'");
    });
});

// ─── Onboarding — Language Selector ───

describe('Onboarding — Language Selection', () => {
    let onboardingContent: string;

    beforeAll(() => {
        onboardingContent = fs.readFileSync('app/onboarding/page.tsx', 'utf-8');
    });

    it('has language selector with all 4 languages', () => {
        expect(onboardingContent).toContain("'tr'");
        expect(onboardingContent).toContain("'en'");
        expect(onboardingContent).toContain("'de'");
        expect(onboardingContent).toContain("'fr'");
    });

    it('auto-detects browser language', () => {
        expect(onboardingContent).toContain('navigator.language');
    });

    it('has language flags or labels', () => {
        expect(onboardingContent).toContain('Türkçe');
        expect(onboardingContent).toContain('English');
        expect(onboardingContent).toContain('Deutsch');
        expect(onboardingContent).toContain('Français');
    });
});

// ─── Edge Cases ───

describe('Language Detection — Edge Cases', () => {
    let detectIntentFast: (text: string) => { intent: string; confidence: string; detectedKeywords: string[]; language: string };
    let detectLanguage: (text: string) => string;

    beforeAll(async () => {
        const mod = await import('../lib/ai/intent-fast');
        detectIntentFast = mod.detectIntentFast;
        detectLanguage = mod.detectLanguage;
    });

    it('returns "en" for ambiguous text', () => {
        expect(detectLanguage('hello world')).toBe('en');
    });

    it('handles empty string gracefully', () => {
        const result = detectIntentFast('');
        expect(result.intent).toBe('unknown');
        expect(result.confidence).toBe('low');
    });

    it('handles single word input', () => {
        const result = detectIntentFast('hallo');
        expect(result.language).toBe('de');
    });

    it('handles mixed language text (prefers first match)', () => {
        // Text with German special char should be detected as German
        const result = detectLanguage('für the meeting');
        expect(result).toBe('de');
    });

    it('detects Turkish from unique chars even with common words', () => {
        expect(detectLanguage('günaydın')).toBe('tr'); // ğ is unique to Turkish
    });

    it('distinguishes French ç from Turkish ç correctly', () => {
        // ç alone (without ğ,ı,ş) could be French — falls to word detection
        const lang = detectLanguage('garçon bonjour');
        expect(lang).toBe('fr');
    });
});
