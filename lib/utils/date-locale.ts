/**
 * Date-fns locale helper — maps app locale to date-fns Locale object.
 *
 * Usage (client component):
 *   import { useLocale } from 'next-intl';
 *   import { getDateLocale } from '@/lib/utils/date-locale';
 *   const locale = useLocale();
 *   const dateLocale = getDateLocale(locale);
 *   format(date, 'dd MMM HH:mm', { locale: dateLocale });
 */

import { tr } from 'date-fns/locale/tr';
import { enUS } from 'date-fns/locale/en-US';
import { de } from 'date-fns/locale/de';
import { fr } from 'date-fns/locale/fr';
import type { Locale } from 'date-fns';

const DATE_LOCALE_MAP: Record<string, Locale> = {
    tr,
    en: enUS,
    de,
    fr,
};

export function getDateLocale(appLocale: string): Locale {
    return DATE_LOCALE_MAP[appLocale] ?? tr;
}
