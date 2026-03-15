/**
 * Multi-Currency Support for Billing
 *
 * Supports TRY, EUR, USD, GBP with locale-aware formatting.
 * Each locale maps to a default currency, but users can override.
 */

// =============================================
// Types
// =============================================

export type SupportedCurrency = 'TRY' | 'EUR' | 'USD' | 'GBP';

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['TRY', 'EUR', 'USD', 'GBP'];

// =============================================
// Locale → Currency Mapping
// =============================================

const LOCALE_CURRENCY_MAP: Record<string, SupportedCurrency> = {
    tr: 'TRY',
    en: 'USD',
    de: 'EUR',
    fr: 'EUR',
};

/**
 * Get the default currency for a given locale.
 * Falls back to USD if locale is unknown.
 */
export function getDefaultCurrency(locale: string): SupportedCurrency {
    return LOCALE_CURRENCY_MAP[locale] || 'USD';
}

// =============================================
// Formatting
// =============================================

/**
 * Format a price amount for display using Intl.NumberFormat.
 *
 * @param amount - The numeric price
 * @param currency - The currency code (TRY, EUR, USD, GBP)
 * @param locale - The locale string (tr, en, de, fr)
 * @returns Formatted price string (e.g., "$26.00", "990,00 TL", "24,00 EUR")
 */
export function formatPrice(amount: number, currency: SupportedCurrency, locale: string): string {
    const localeMap: Record<string, string> = {
        tr: 'tr-TR',
        en: 'en-US',
        de: 'de-DE',
        fr: 'fr-FR',
    };
    const resolvedLocale = localeMap[locale] || locale;

    return new Intl.NumberFormat(resolvedLocale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Get the currency symbol for a supported currency.
 */
export function getCurrencySymbol(currency: SupportedCurrency): string {
    const symbols: Record<SupportedCurrency, string> = {
        TRY: '\u20BA', // ₺
        EUR: '\u20AC', // €
        USD: '$',
        GBP: '\u00A3', // £
    };
    return symbols[currency];
}
