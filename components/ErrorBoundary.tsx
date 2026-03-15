'use client';

import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

const TRANSLATIONS = {
    tr: { title: 'Bir Hata Oluştu', desc: 'Sayfa yüklenirken beklenmedik bir hata oluştu. Hata otomatik olarak raporlandı.', retry: 'Tekrar Dene' },
    en: { title: 'An Error Occurred', desc: 'An unexpected error occurred while loading the page. The error has been reported automatically.', retry: 'Try Again' },
    de: { title: 'Ein Fehler ist aufgetreten', desc: 'Beim Laden der Seite ist ein unerwarteter Fehler aufgetreten. Der Fehler wurde automatisch gemeldet.', retry: 'Erneut versuchen' },
    fr: { title: 'Une erreur s\'est produite', desc: 'Une erreur inattendue s\'est produite lors du chargement de la page. L\'erreur a été signalée automatiquement.', retry: 'Réessayer' },
} as const;

type Locale = keyof typeof TRANSLATIONS;

function getLocale(): Locale {
    if (typeof document !== 'undefined') {
        const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
        if (match && match[1] in TRANSLATIONS) return match[1] as Locale;
    }
    return 'en';
}

/**
 * Global Error Boundary
 * Catches unhandled React errors, reports to monitoring API,
 * and shows a friendly multi-language error UI.
 */
export class ErrorBoundary extends Component<Props, State> {
    private locale: Locale = 'en';

    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidMount() {
        this.locale = getLocale();
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.locale = getLocale();
        this.reportError(error, errorInfo);
    }

    private async reportError(error: Error, errorInfo: ErrorInfo) {
        try {
            await fetch('/api/monitoring/errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: error.message,
                    stack: error.stack,
                    component: errorInfo.componentStack?.split('\n')[1]?.trim() || 'unknown',
                    action: 'react_error_boundary',
                    url: typeof window !== 'undefined' ? window.location.href : undefined,
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                }),
            });
        } catch (reportErr) {
            // Don't crash the error boundary itself, but log for debugging
            if (typeof console !== 'undefined') {
                console.warn('[ErrorBoundary] Failed to report error:', reportErr);
            }
        }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const t = TRANSLATIONS[this.locale];

            return (
                <div className="min-h-[400px] flex items-center justify-center p-8">
                    <div className="text-center max-w-md mx-auto">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            {t.title}
                        </h2>
                        <p className="text-muted-foreground mb-6">
                            {t.desc}
                        </p>
                        {process.env.NODE_ENV !== 'production' && this.state.error && (
                            <pre className="text-xs text-left bg-muted p-3 rounded-lg mb-4 overflow-auto max-h-32">
                                {this.state.error.message}
                            </pre>
                        )}
                        <button
                            onClick={this.handleReset}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {t.retry}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
