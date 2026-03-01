'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/lib/firebase/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initClientErrorReporting } from '@/lib/monitoring/client-reporter';

/** Pages that should NOT show the sidebar (public pages) */
const PUBLIC_PAGES = ['/login', '/onboarding', '/privacy', '/landing'];

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isPublicPage = PUBLIC_PAGES.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
    );

    // Initialize client-side error reporting
    useEffect(() => {
        initClientErrorReporting();
    }, []);

    return (
        <AuthProvider>
            <ToastProvider>
                <ErrorBoundary>
                    {/* Skip to content link for keyboard users */}
                    <a
                        href="#main-content"
                        className="skip-to-content"
                    >
                        Ana içeriğe geç
                    </a>

                    {isPublicPage ? (
                        <main id="main-content" className="min-h-screen">{children}</main>
                    ) : (
                        <div className="flex min-h-screen">
                            <Sidebar />
                            <main id="main-content" className="flex-1 overflow-auto bg-background pt-16 lg:pt-0">
                                <div className="page-transition">
                                    {children}
                                </div>
                            </main>
                        </div>
                    )}
                </ErrorBoundary>
            </ToastProvider>
        </AuthProvider>
    );
}
