/**
 * Voice Pipeline Multi-Language Tests
 *
 * Tests DE/FR support across:
 * - Twilio telephony helpers (TwiML messages)
 * - Gather route (VOICE_MESSAGES, FAREWELL_PATTERNS)
 * - Incoming route (DAY_MAP, greetings, after-hours)
 * - LLM fallback chain (graceful fallback messages)
 * - Tenant API (language validation, defaults)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ─── Telephony TwiML Messages ─────────────────────────────────────────────

describe('Telephony: Multi-language TwiML', () => {
    const content = fs.readFileSync('lib/twilio/telephony.ts', 'utf-8');

    it('TWIML_MESSAGES has all 4 languages', () => {
        expect(content).toContain("'tr-TR'");
        expect(content).toContain("'en-US'");
        expect(content).toContain("'de-DE'");
        expect(content).toContain("'fr-FR'");
    });

    it('each language has all 4 message keys', () => {
        expect(content).toContain('couldNotHear');
        expect(content).toContain('thankYou');
        expect(content).toContain('stillThere');
        expect(content).toContain('goodbye');
    });

    it('default messages are in English (not Turkish)', () => {
        // Defaults should be language-neutral (English) for pre-tenant-resolution errors
        expect(content).toContain("'Our services are currently unavailable");
        expect(content).toContain("'We are currently unavailable");
        expect(content).not.toContain("'Şu anda hizmetlerimiz aktif değil");
        expect(content).not.toContain("'Şu anda müsait değiliz");
    });

    it('buildPhoneTtsUrl supports lang parameter', () => {
        expect(content).toContain('lang: string');
    });
});

// ─── Gather Route Multi-Language ──────────────────────────────────────────

describe('Gather Route: Multi-language', () => {
    const content = fs.readFileSync('app/api/twilio/gather/route.ts', 'utf-8');

    it('defines VoiceLang type with 4 languages', () => {
        expect(content).toContain("type VoiceLang = 'tr' | 'en' | 'de' | 'fr'");
    });

    it('VOICE_MESSAGES has all 4 languages', () => {
        // German messages
        expect(content).toContain('Ich konnte Sie nicht hören');
        expect(content).toContain('Vielen Dank für Ihren Anruf');
        expect(content).toContain('Auf Wiederhören');
        // French messages
        expect(content).toContain("Je n\\'ai pas pu vous entendre");
        expect(content).toContain('Merci de votre appel');
        expect(content).toContain('Bonne journée');
    });

    it('FAREWELL_PATTERNS has all 4 languages', () => {
        expect(content).toContain("'auf wiedersehen'");
        expect(content).toContain("'tschüss'");
        expect(content).toContain("'au revoir'");
        expect(content).toContain("'bonne journée'");
    });

    it('system prompt templates exist for all 4 languages', () => {
        expect(content).toContain('Sprechen Sie natürlich und prägnant');
        expect(content).toContain('Parlez naturellement et de manière concise');
        expect(content).toContain('Sie sind');
        expect(content).toContain('Vous êtes');
    });

    it('phone rules exist for all 4 languages', () => {
        expect(content).toContain('Telefongesprächsregeln');
        expect(content).toContain("Règles d'appel téléphonique");
    });

    it('error messages are not hardcoded Turkish', () => {
        // Pre-tenant-resolution errors should be in English
        expect(content).toContain("'Too many requests. Please wait.'");
        expect(content).toContain("'Unauthorized request.'");
        expect(content).toContain("'System error.'");
        expect(content).toContain("'An error occurred. Please call again.'");
        // Catch block uses VOICE_MESSAGES.en.error
        expect(content).toContain('VOICE_MESSAGES.en.error');
    });

    it('LLM no-response fallback is multi-language', () => {
        expect(content).toContain("'Yanıt oluşturulamadı.'");
        expect(content).toContain("'Could not generate a response.'");
        expect(content).toContain("'Antwort konnte nicht generiert werden.'");
        expect(content).toContain("'Impossible de générer une réponse.'");
    });

    it('uses localeBCP47 for TwiML language attribute', () => {
        expect(content).toContain('localeBCP47[language]');
    });
});

// ─── Incoming Route Multi-Language ────────────────────────────────────────

describe('Incoming Route: Multi-language', () => {
    const content = fs.readFileSync('app/api/twilio/incoming/route.ts', 'utf-8');

    it('DEFAULT_GREETINGS has all 4 languages', () => {
        expect(content).toContain("'Hallo, wie kann ich Ihnen helfen?'");
        expect(content).toContain("'Bonjour, comment puis-je vous aider ?'");
    });

    it('DISABLED_MESSAGES has all 4 languages', () => {
        expect(content).toContain('Unser Assistent ist derzeit nicht verfügbar');
        expect(content).toContain('Notre assistant est actuellement indisponible');
    });

    it('buildAgentGreeting supports DE and FR', () => {
        expect(content).toContain("case 'de':");
        expect(content).toContain("case 'fr':");
        expect(content).toContain('hier ist');
        expect(content).toContain('ici');
    });

    it('after-hours messages are multi-language', () => {
        expect(content).toContain('außerhalb der Geschäftszeiten');
        expect(content).toContain('en dehors des heures de travail');
    });

    it('DAY_MAP includes German and French day names', () => {
        expect(content).toContain("'montag': 1");
        expect(content).toContain("'freitag': 5");
        expect(content).toContain("'lundi': 1");
        expect(content).toContain("'vendredi': 5");
    });

    it('error messages are not hardcoded Turkish', () => {
        expect(content).not.toContain("'Sistem bakımda");
        expect(content).not.toContain("'Bu numara henüz yapılandırılmamış");
        expect(content).not.toContain("'Bu hattın aboneliği sona ermiştir");
        expect(content).not.toContain("'Aylık kullanım limitiniz dolmuştur");
    });
});

// ─── LLM Fallback Chain ──────────────────────────────────────────────────

describe('LLM Fallback Chain: Multi-language', () => {
    const content = fs.readFileSync('lib/ai/llm-fallback-chain.ts', 'utf-8');

    it('has type-safe language parameter', () => {
        expect(content).toContain("language?: 'tr' | 'en' | 'de' | 'fr'");
    });

    it('graceful fallback messages include all 4 languages', () => {
        expect(content).toContain('Ich entschuldige mich');
        expect(content).toContain("Je m\\'excuse");
    });
});

// ─── Tenant API Language Support ──────────────────────────────────────────

describe('Tenant API: Language validation', () => {
    const content = fs.readFileSync('app/api/tenants/route.ts', 'utf-8');

    it('VALID_LANGUAGES includes all 4 + tr-en', () => {
        expect(content).toContain("'tr', 'en', 'de', 'fr', 'tr-en'");
    });

    it('getDefaultAgent has all 4 language cases', () => {
        expect(content).toContain("case 'en':");
        expect(content).toContain("case 'de':");
        expect(content).toContain("case 'fr':");
    });

    it('default agent names are language-specific', () => {
        expect(content).toContain("name: 'Assistent'");   // DE
        expect(content).toContain("role: 'Kundenberater'"); // DE
        expect(content).toContain("role: 'Conseiller clientèle'"); // FR
    });

    it('workingDays defaults are language-aware', () => {
        expect(content).toContain("'Montag-Freitag'");
        expect(content).toContain("'Lundi-Vendredi'");
        expect(content).toContain("'Monday-Friday'");
    });

    it('sttLanguage supports DE and FR', () => {
        expect(content).toContain("'en', 'de', 'fr'");
    });
});

// ─── Onboarding Multi-Language ────────────────────────────────────────────

describe('Onboarding: Multi-language', () => {
    const content = fs.readFileSync('app/onboarding/page.tsx', 'utf-8');

    it('language selector has 4 options', () => {
        expect(content).toContain("id: 'tr'");
        expect(content).toContain("id: 'en'");
        expect(content).toContain("id: 'de'");
        expect(content).toContain("id: 'fr'");
    });

    it('auto-detects browser language', () => {
        expect(content).toContain('navigator.language');
        expect(content).toContain('NEXT_LOCALE');
    });

    it('uses useTranslations for i18n', () => {
        expect(content).toContain("useTranslations('onboarding')");
    });
});

// ─── i18n Config ──────────────────────────────────────────────────────────

describe('i18n Config: localeBCP47', () => {
    const content = fs.readFileSync('lib/i18n/config.ts', 'utf-8');

    it('localeBCP47 maps all 4 languages', () => {
        expect(content).toContain("tr: 'tr-TR'");
        expect(content).toContain("en: 'en-US'");
        expect(content).toContain("de: 'de-DE'");
        expect(content).toContain("fr: 'fr-FR'");
    });
});
