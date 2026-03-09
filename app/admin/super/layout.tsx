'use client';

/**
 * Super-Admin Layout
 *
 * Guards all /admin/super/* routes.
 * Only @callception.com email domain or superadmin role can access.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Shield, AlertTriangle, Loader2 } from 'lucide-react';

export default function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const [authorized, setAuthorized] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (loading) return;

        if (!user?.email) {
            setAuthorized(false);
            setChecked(true);
            return;
        }

        // Super-admin check: @callception.com domain or explicitly allowed emails
        const SUPER_ADMIN_EMAILS = ['dmrcnylmz@gmail.com'];
        const isSuperAdmin = user.email.endsWith('@callception.com')
            || SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase());
        setAuthorized(isSuperAdmin);
        setChecked(true);
    }, [user, loading]);

    // Loading state
    if (loading || !checked) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Yetki kontrol ediliyor...</p>
                </div>
            </div>
        );
    }

    // Unauthorized
    if (!authorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-4 max-w-md">
                    <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                    </div>
                    <h2 className="text-xl font-semibold">Erişim Reddedildi</h2>
                    <p className="text-muted-foreground">
                        Bu sayfaya erişim yalnızca sistem yöneticilerine aittir.
                        Yetkili olduğunuzu düşünüyorsanız lütfen destek ekibiyle iletişime geçin.
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                        Giriş yapılan hesap: {user?.email || 'Bilinmiyor'}
                    </p>
                </div>
            </div>
        );
    }

    // Authorized — render children with super-admin header
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b">
                <div className="p-2 rounded-lg bg-orange-500/10">
                    <Shield className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Sistem Yönetimi</h1>
                    <p className="text-sm text-muted-foreground">
                        Callception Super-Admin Paneli
                    </p>
                </div>
            </div>
            {children}
        </div>
    );
}
