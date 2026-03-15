'use client';

import { useEffect, useState } from 'react';
import { getErrorLocale, ERROR_TRANSLATIONS, type ErrorLocale } from '@/lib/utils/error-boundary-translations';

const PAGE_TITLES: Record<ErrorLocale, string> = {
    tr: 'Bir Hata Oluştu',
    en: 'An Error Occurred',
    de: 'Ein Fehler ist aufgetreten',
    fr: "Une erreur s'est produite",
};

const PAGE_DESCS: Record<ErrorLocale, string> = {
    tr: 'Beklenmeyen bir hata meydana geldi. Lütfen tekrar deneyin veya sorun devam ederse yöneticinize başvurun.',
    en: 'An unexpected error occurred. Please try again or contact your administrator if the problem persists.',
    de: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut oder kontaktieren Sie Ihren Administrator.',
    fr: "Une erreur inattendue s'est produite. Veuillez réessayer ou contacter votre administrateur.",
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
        console.error('Application error:', error);
    }, [error]);

    const t = ERROR_TRANSLATIONS[locale];

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="mx-auto max-w-md text-center">
                {/* Icon */}
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                    <svg
                        className="h-10 w-10 text-destructive"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                        />
                    </svg>
                </div>

                <h1 className="mb-2 text-2xl font-bold text-foreground">
                    {PAGE_TITLES[locale]}
                </h1>
                <p className="mb-6 text-muted-foreground">
                    {PAGE_DESCS[locale]}
                </p>

                {process.env.NODE_ENV === 'development' && error.message && (
                    <pre className="mb-6 max-h-32 overflow-auto rounded-md border bg-muted p-3 text-left text-xs text-muted-foreground">
                        {error.message}
                    </pre>
                )}

                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={reset}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {t.retry}
                    </button>
                    <a
                        href="/"
                        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        {t.home}
                    </a>
                </div>
            </div>
        </div>
    );
}
