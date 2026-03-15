/**
 * Multi-Currency Billing Tests
 *
 * Tests currency formatting, locale-default mapping,
 * plan pricing structure, and checkout currency param.
 */

import { describe, it, expect } from 'vitest';
import {
    formatPrice,
    getDefaultCurrency,
    getCurrencySymbol,
    SUPPORTED_CURRENCIES,
    type SupportedCurrency,
} from '@/lib/billing/currency';
import { PLANS, getPriceForCurrency, getVariantForCurrency } from '@/lib/billing/lemonsqueezy';

// =============================================
// formatPrice
// =============================================

describe('formatPrice', () => {
    it('formats TRY prices for Turkish locale', () => {
        const result = formatPrice(990, 'TRY', 'tr');
        // Should contain the number and currency indicator
        expect(result).toContain('990');
    });

    it('formats EUR prices for German locale', () => {
        const result = formatPrice(24, 'EUR', 'de');
        expect(result).toContain('24');
    });

    it('formats USD prices for English locale', () => {
        const result = formatPrice(26, 'USD', 'en');
        expect(result).toContain('26');
        expect(result).toContain('$');
    });

    it('formats GBP prices for English locale', () => {
        const result = formatPrice(21, 'GBP', 'en');
        expect(result).toContain('21');
    });

    it('formats EUR prices for French locale', () => {
        const result = formatPrice(24, 'EUR', 'fr');
        expect(result).toContain('24');
    });

    it('handles zero amounts', () => {
        const result = formatPrice(0, 'USD', 'en');
        expect(result).toContain('0');
    });

    it('handles large amounts', () => {
        const result = formatPrice(76590, 'TRY', 'tr');
        expect(result).toBeTruthy();
    });
});

// =============================================
// getDefaultCurrency
// =============================================

describe('getDefaultCurrency', () => {
    it('returns TRY for Turkish locale', () => {
        expect(getDefaultCurrency('tr')).toBe('TRY');
    });

    it('returns USD for English locale', () => {
        expect(getDefaultCurrency('en')).toBe('USD');
    });

    it('returns EUR for German locale', () => {
        expect(getDefaultCurrency('de')).toBe('EUR');
    });

    it('returns EUR for French locale', () => {
        expect(getDefaultCurrency('fr')).toBe('EUR');
    });

    it('falls back to USD for unknown locales', () => {
        expect(getDefaultCurrency('ja')).toBe('USD');
        expect(getDefaultCurrency('zh')).toBe('USD');
        expect(getDefaultCurrency('')).toBe('USD');
    });
});

// =============================================
// getCurrencySymbol
// =============================================

describe('getCurrencySymbol', () => {
    it('returns correct symbols for all currencies', () => {
        expect(getCurrencySymbol('TRY')).toBe('\u20BA');
        expect(getCurrencySymbol('EUR')).toBe('\u20AC');
        expect(getCurrencySymbol('USD')).toBe('$');
        expect(getCurrencySymbol('GBP')).toBe('\u00A3');
    });
});

// =============================================
// SUPPORTED_CURRENCIES
// =============================================

describe('SUPPORTED_CURRENCIES', () => {
    it('contains all 4 currencies', () => {
        expect(SUPPORTED_CURRENCIES).toEqual(['TRY', 'EUR', 'USD', 'GBP']);
    });
});

// =============================================
// PLANS multi-currency prices
// =============================================

describe('PLANS multi-currency prices', () => {
    const planIds = ['starter', 'professional', 'enterprise'];

    it('all plans exist', () => {
        for (const id of planIds) {
            expect(PLANS[id]).toBeDefined();
        }
    });

    it('all plans have prices for all supported currencies', () => {
        for (const id of planIds) {
            const plan = PLANS[id];
            for (const currency of SUPPORTED_CURRENCIES) {
                expect(plan.prices[currency]).toBeDefined();
                expect(plan.prices[currency].monthly).toBeGreaterThan(0);
                expect(plan.prices[currency].yearly).toBeGreaterThan(0);
            }
        }
    });

    it('yearly prices are greater than monthly prices for all currencies', () => {
        for (const id of planIds) {
            const plan = PLANS[id];
            for (const currency of SUPPORTED_CURRENCIES) {
                expect(plan.prices[currency].yearly).toBeGreaterThan(plan.prices[currency].monthly);
            }
        }
    });

    it('starter TRY price matches expected values', () => {
        expect(PLANS.starter.prices.TRY.monthly).toBe(990);
        expect(PLANS.starter.prices.EUR.monthly).toBe(24);
        expect(PLANS.starter.prices.USD.monthly).toBe(26);
        expect(PLANS.starter.prices.GBP.monthly).toBe(21);
    });

    it('professional prices match expected values', () => {
        expect(PLANS.professional.prices.TRY.monthly).toBe(2990);
        expect(PLANS.professional.prices.EUR.monthly).toBe(69);
        expect(PLANS.professional.prices.USD.monthly).toBe(75);
        expect(PLANS.professional.prices.GBP.monthly).toBe(59);
    });

    it('enterprise prices match expected values', () => {
        expect(PLANS.enterprise.prices.TRY.monthly).toBe(7990);
        expect(PLANS.enterprise.prices.EUR.monthly).toBe(179);
        expect(PLANS.enterprise.prices.USD.monthly).toBe(195);
        expect(PLANS.enterprise.prices.GBP.monthly).toBe(155);
    });

    it('backward-compat priceTry fields still present', () => {
        expect(PLANS.starter.priceTry).toBe(990);
        expect(PLANS.professional.priceTry).toBe(2990);
        expect(PLANS.enterprise.priceTry).toBe(7990);
    });
});

// =============================================
// getPriceForCurrency
// =============================================

describe('getPriceForCurrency', () => {
    it('returns correct monthly price for a plan/currency', () => {
        expect(getPriceForCurrency('starter', 'USD', 'monthly')).toBe(26);
        expect(getPriceForCurrency('professional', 'EUR', 'monthly')).toBe(69);
        expect(getPriceForCurrency('enterprise', 'GBP', 'monthly')).toBe(155);
    });

    it('returns correct yearly price for a plan/currency', () => {
        expect(getPriceForCurrency('starter', 'TRY', 'yearly')).toBe(9490);
    });

    it('returns null for unknown plan', () => {
        expect(getPriceForCurrency('nonexistent', 'USD')).toBeNull();
    });
});

// =============================================
// getVariantForCurrency
// =============================================

describe('getVariantForCurrency', () => {
    it('returns same variant regardless of currency (currently currency-agnostic)', () => {
        // All currencies share the same LS variant — currency is display-only
        const usd = getVariantForCurrency('starter', 'USD', 'monthly');
        const eur = getVariantForCurrency('starter', 'EUR', 'monthly');
        const gbp = getVariantForCurrency('starter', 'GBP', 'monthly');
        const tryVar = getVariantForCurrency('starter', 'TRY', 'monthly');
        // All should return the same value (either a variant ID or null)
        expect(usd).toBe(eur);
        expect(eur).toBe(gbp);
        expect(gbp).toBe(tryVar);
    });

    it('returns null for unknown plan', () => {
        expect(getVariantForCurrency('nonexistent', 'USD')).toBeNull();
    });
});

// =============================================
// Checkout currency param (structural test)
// =============================================

describe('checkout currency parameter', () => {
    it('PLANS PlanConfig interface has prices field', () => {
        const plan = PLANS.starter;
        expect(plan).toHaveProperty('prices');
        expect(typeof plan.prices).toBe('object');
    });

    it('currency values are valid SupportedCurrency types', () => {
        const validCurrencies: SupportedCurrency[] = ['TRY', 'EUR', 'USD', 'GBP'];
        for (const cur of validCurrencies) {
            expect(SUPPORTED_CURRENCIES).toContain(cur);
        }
    });
});
