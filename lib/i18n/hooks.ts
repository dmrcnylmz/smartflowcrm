'use client';

import { useTranslations } from 'next-intl';

/**
 * Convenience re-export of next-intl's useTranslations hook.
 * Usage: const t = useTranslation('nav'); t('dashboard') -> "Gosterge Paneli"
 */
export function useTranslation(namespace?: string) {
    return useTranslations(namespace);
}
