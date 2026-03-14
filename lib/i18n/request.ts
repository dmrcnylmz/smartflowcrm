import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, isValidLocale, type Locale } from './config';

export default getRequestConfig(async () => {
    // Priority: 1. NEXT_LOCALE cookie  2. Accept-Language header  3. defaultLocale
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

    let locale: Locale = defaultLocale;

    if (cookieLocale && isValidLocale(cookieLocale)) {
        locale = cookieLocale;
    } else {
        const headerStore = await headers();
        const acceptLang = headerStore.get('accept-language') || '';
        const detected = parseAcceptLanguage(acceptLang);
        if (detected) locale = detected;
    }

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
    };
});

/**
 * Parse Accept-Language header and return the best matching locale.
 * Example: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7" → 'de'
 */
function parseAcceptLanguage(header: string): Locale | null {
    if (!header) return null;

    const parts = header.split(',').map(part => {
        const [langTag, qPart] = part.trim().split(';');
        const q = qPart ? parseFloat(qPart.split('=')[1]) : 1.0;
        return { lang: langTag.trim().split('-')[0].toLowerCase(), q };
    });

    parts.sort((a, b) => b.q - a.q);

    for (const { lang } of parts) {
        if (isValidLocale(lang)) return lang;
    }
    return null;
}
