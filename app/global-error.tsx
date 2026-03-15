'use client';

/**
 * Global Error Boundary — catches errors in the root layout.
 *
 * Unlike app/error.tsx, this component must render its own <html>/<body>
 * because the root layout itself may have failed.
 *
 * Cannot use next-intl or any React context. Translations are fully inline
 * and the locale is read from the NEXT_LOCALE cookie via document.cookie.
 */

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

const ERROR_TRANSLATIONS = {
    tr: { title: 'Kritik Hata', desc: 'Uygulama başlatılırken beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin veya sorun devam ederse yöneticinize başvurun.', errorCode: 'Hata kodu', retry: 'Tekrar Dene', home: 'Ana Sayfa' },
    en: { title: 'Critical Error', desc: 'An unexpected error occurred while starting the application. Please refresh the page or contact your administrator if the problem persists.', errorCode: 'Error code', retry: 'Try Again', home: 'Home' },
    de: { title: 'Kritischer Fehler', desc: 'Beim Starten der Anwendung ist ein unerwarteter Fehler aufgetreten. Bitte aktualisieren Sie die Seite oder kontaktieren Sie Ihren Administrator.', errorCode: 'Fehlercode', retry: 'Erneut versuchen', home: 'Startseite' },
    fr: { title: 'Erreur Critique', desc: "Une erreur inattendue s'est produite lors du démarrage. Veuillez rafraîchir la page ou contacter votre administrateur.", errorCode: "Code d'erreur", retry: 'Réessayer', home: "Page d'accueil" },
};

function getLocale(): string {
    if (typeof document !== 'undefined') {
        const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
        if (match && match[1] in ERROR_TRANSLATIONS) return match[1];
    }
    return 'en';
}

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const [locale, setLocale] = useState('en');

    useEffect(() => {
        setLocale(getLocale());
    }, []);

    useEffect(() => {
        console.error('Global error:', error);
        Sentry.captureException(error);
    }, [error]);

    const t = ERROR_TRANSLATIONS[locale as keyof typeof ERROR_TRANSLATIONS];

    return (
        <html lang={locale}>
            <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <div style={{
                    display: 'flex',
                    minHeight: '100vh',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem',
                    backgroundColor: '#fafafa',
                }}>
                    <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
                        {/* Error icon */}
                        <div style={{
                            margin: '0 auto 1.5rem',
                            width: '5rem',
                            height: '5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            backgroundColor: '#fef2f2',
                        }}>
                            <svg
                                width="40"
                                height="40"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                        </div>

                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111', marginBottom: '0.5rem' }}>
                            {t.title}
                        </h1>
                        <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                            {t.desc}
                        </p>

                        {error.digest && (
                            <p style={{ color: '#999', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
                                {t.errorCode}: {error.digest}
                            </p>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={reset}
                                style={{
                                    padding: '0.625rem 1.5rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                    color: '#fff',
                                    backgroundColor: '#2563eb',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                }}
                            >
                                {t.retry}
                            </button>
                            <a
                                href="/"
                                style={{
                                    padding: '0.625rem 1.5rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                    color: '#333',
                                    backgroundColor: '#fff',
                                    border: '1px solid #ddd',
                                    borderRadius: '0.375rem',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                }}
                            >
                                {t.home}
                            </a>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
