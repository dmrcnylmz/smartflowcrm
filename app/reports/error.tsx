'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { getErrorLocale, ERROR_TRANSLATIONS, type ErrorLocale } from '@/lib/utils/error-boundary-translations';

const PAGE_TITLES: Record<ErrorLocale, string> = {
    tr: 'Rapor verileri yüklenemedi',
    en: 'Failed to load report data',
    de: 'Berichtsdaten konnten nicht geladen werden',
    fr: 'Impossible de charger les données des rapports',
};

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const [locale, setLocale] = useState<ErrorLocale>('en');

    useEffect(() => {
        setLocale(getErrorLocale());
    }, []);

    useEffect(() => {
        console.error('Page error:', error);
    }, [error]);

    const t = ERROR_TRANSLATIONS[locale];

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
            <div className="w-full max-w-md text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <h2 className="text-xl font-semibold mb-2">{PAGE_TITLES[locale]}</h2>
                <p className="text-sm text-muted-foreground mb-6">
                    {t.genericDesc}
                </p>
                {process.env.NODE_ENV === 'development' && error.message && (
                    <pre className="mb-4 max-h-24 overflow-auto rounded-lg border bg-muted p-3 text-left text-xs text-muted-foreground">
                        {error.message}
                    </pre>
                )}
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={reset}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        {t.retry}
                    </button>
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
                    >
                        <Home className="h-4 w-4" />
                        {t.home}
                    </a>
                </div>
            </div>
        </div>
    );
}
