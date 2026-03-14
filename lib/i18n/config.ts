/**
 * i18n Configuration
 *
 * Supports Turkish (primary), English, German and French.
 * Uses next-intl for App Router compatibility.
 */

export const locales = ['tr', 'en', 'de', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'tr';

export const localeNames: Record<Locale, string> = {
    tr: 'Türkçe',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
};

export const localeFlags: Record<Locale, string> = {
    tr: '🇹🇷',
    en: '🇬🇧',
    de: '🇩🇪',
    fr: '🇫🇷',
};

/** BCP 47 locale codes for Twilio Gather STT & TwiML */
export const localeBCP47: Record<Locale, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    de: 'de-DE',
    fr: 'fr-FR',
};

/** Check if a string is a valid supported locale */
export function isValidLocale(value: string): value is Locale {
    return (locales as readonly string[]).includes(value);
}
