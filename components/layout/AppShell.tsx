'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AuthGuard } from '@/components/auth/AuthGuard';

interface AppShellProps {
    children: React.ReactNode;
}

// Pages that don't need the sidebar
const NO_SIDEBAR_PATHS = ['/login'];

export function AppShell({ children }: AppShellProps) {
    const pathname = usePathname();
    const showSidebar = !NO_SIDEBAR_PATHS.includes(pathname);

    return (
        <AuthGuard>
            {showSidebar ? (
                <div className="flex h-screen overflow-hidden">
                    <Sidebar />
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <Header />
                        <main className="flex-1 overflow-y-auto">
                            {children}
                        </main>
                    </div>
                </div>
            ) : (
                <>{children}</>
            )}
        </AuthGuard>
    );
}
