'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/firebase/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { Sidebar } from '@/components/layout/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initClientErrorReporting } from '@/lib/monitoring/client-reporter';
import { usePageViewTracker } from '@/lib/hooks/useActivityTracker';

/** Pages that should NOT show the sidebar (public pages) */
const PUBLIC_PAGES = ['/login', '/onboarding', '/privacy', '/landing'];

function LayoutInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, tenantId } = useAuth();

    const isPublicPage = PUBLIC_PAGES.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
    );

    // Initialize client-side error reporting
    useEffect(() => {
        initClientErrorReporting();
    }, []);

    // Track page views for analytics
    usePageViewTracker();

    // Redirect: logged in but no tenant → onboarding
    // Redirect: not logged in on protected page → login
    useEffect(() => {
        if (loading) return;

        if (!user && !isPublicPage) {
            router.replace('/login');
            return;
        }

        if (user && !tenantId && !isPublicPage) {
            router.replace('/onboarding');
        }
    }, [user, loading, tenantId, isPublicPage, router, pathname]);

    // Show nothing while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <>
            {/* Skip to content link for keyboard users */}
            <a href="#main-content" className="skip-to-content">
                Ana içeriğe geç
            </a>

            {isPublicPage ? (
                <main id="main-content" className="min-h-screen">{children}</main>
            ) : (
                <div className="flex min-h-screen">
                    <Sidebar />
                    <main id="main-content" className="flex-1 overflow-x-hidden overflow-y-auto bg-background pt-14 lg:pt-0">
                        <div className="page-transition">
                            {children}
                        </div>
                    </main>
                </div>
            )}
        </>
    );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <ThemeProvider>
                <ToastProvider>
                    <ErrorBoundary>
                        <LayoutInner>{children}</LayoutInner>
                    </ErrorBoundary>
                </ToastProvider>
            </ThemeProvider>
        </AuthProvider>
    );
}
