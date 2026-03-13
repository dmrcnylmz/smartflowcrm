'use client';

/**
 * Global Error Boundary — catches errors in the root layout.
 *
 * Unlike app/error.tsx, this component must render its own <html>/<body>
 * because the root layout itself may have failed.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Global error:', error);
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="tr">
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
                            Kritik Hata
                        </h1>
                        <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                            Uygulama başlatılırken beklenmeyen bir hata oluştu.
                            Lütfen sayfayı yenileyin veya sorun devam ederse yöneticinize başvurun.
                        </p>

                        {error.digest && (
                            <p style={{ color: '#999', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
                                Hata kodu: {error.digest}
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
                                Tekrar Dene
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
                                Ana Sayfa
                            </a>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
