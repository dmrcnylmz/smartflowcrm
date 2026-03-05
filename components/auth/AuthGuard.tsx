'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
    children: React.ReactNode;
}

// Pages that don't require authentication
const PUBLIC_PATHS = ['/login'];

export function AuthGuard({ children }: AuthGuardProps) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const isPublicPath = PUBLIC_PATHS.includes(pathname);

    useEffect(() => {
        if (!loading) {
            if (!user && !isPublicPath) {
                // User is not logged in and trying to access a protected page
                router.push('/login');
            } else if (user && isPublicPath) {
                // User is logged in but on the login page, redirect to home
                router.push('/');
            }
        }
    }, [user, loading, isPublicPath, router]);

    // Show loading spinner while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="mt-4 text-muted-foreground">Yükleniyor...</p>
                </div>
            </div>
        );
    }

    // If user is not logged in and not on a public path, don't render children
    if (!user && !isPublicPath) {
        return null;
    }

    // If user is logged in and on login page, don't render (will redirect)
    if (user && isPublicPath) {
        return null;
    }

    return <>{children}</>;
}
