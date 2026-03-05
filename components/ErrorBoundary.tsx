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

/**
 * Global Error Boundary
 * Catches unhandled React errors, reports to monitoring API,
 * and shows a friendly Turkish error UI.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Report to monitoring API
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
        } catch {
            // Silently fail — don't crash the error boundary itself
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

            return (
                <div className="min-h-[400px] flex items-center justify-center p-8">
                    <div className="text-center max-w-md mx-auto">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            Bir Hata Oluştu
                        </h2>
                        <p className="text-muted-foreground mb-6">
                            Sayfa yüklenirken beklenmedik bir hata oluştu.
                            Hata otomatik olarak raporlandı.
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
                            Tekrar Dene
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
