/**
 * Error boundary translation utilities.
 *
 * Error boundaries may render outside the next-intl provider context
 * (especially global-error.tsx which renders its own html/body), so they
 * cannot use useTranslations(). Instead we read the NEXT_LOCALE cookie
 * directly and look up strings from a small static map.
 */

export const ERROR_TRANSLATIONS = {
    tr: {
        retry: 'Tekrar Dene',
        home: 'Ana Sayfa',
        genericDesc: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
    },
    en: {
        retry: 'Try Again',
        home: 'Home',
        genericDesc: 'An unexpected error occurred. Please try again.',
    },
    de: {
        retry: 'Erneut versuchen',
        home: 'Startseite',
        genericDesc: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    },
    fr: {
        retry: 'Réessayer',
        home: "Page d'accueil",
        genericDesc: "Une erreur inattendue s'est produite. Veuillez réessayer.",
    },
} as const;

export type ErrorLocale = keyof typeof ERROR_TRANSLATIONS;

/**
 * Read the current locale from the NEXT_LOCALE cookie.
 * Falls back to 'en' when running server-side or when the cookie is absent.
 */
export function getErrorLocale(): ErrorLocale {
    if (typeof document !== 'undefined') {
        const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
        if (match && match[1] in ERROR_TRANSLATIONS) return match[1] as ErrorLocale;
    }
    return 'en';
}
