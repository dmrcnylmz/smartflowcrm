'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Page error:', error);
    }, [error]);

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
            <div className="w-full max-w-md text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Randevu verileri yüklenemedi</h2>
                <p className="text-sm text-muted-foreground mb-6">
                    Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
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
                        Tekrar Dene
                    </button>
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
                    >
                        <Home className="h-4 w-4" />
                        Ana Sayfa
                    </a>
                </div>
            </div>
        </div>
    );
}
