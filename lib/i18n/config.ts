/**
 * i18n Configuration
 *
 * Supports Turkish (primary) and English.
 * Uses next-intl for App Router compatibility.
 */

export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'tr';

export const localeNames: Record<Locale, string> = {
    tr: 'Türkçe',
    en: 'English',
};
