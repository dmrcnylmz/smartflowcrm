'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * EmailVerificationBanner — E-posta dogrulama uyarisi
 *
 * Dashboard'da gorunur (yalnizca email dogrulanmamissa).
 * Google ile giris yapanlarda gorunmez.
 */
export function EmailVerificationBanner() {
    const { user, isEmailVerified, resendVerificationEmail } = useAuth();
    const t = useTranslations('emailVerification');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(false);

    // Gostermeme kosullari:
    // - Kullanici yok
    // - Email zaten dogrulanmis
    // - Loading durumunda
    if (!user || isEmailVerified) return null;

    const handleResend = async () => {
        if (sending || sent) return;
        setSending(true);
        setError(false);
        try {
            await resendVerificationEmail();
            setSent(true);
            // 60 saniye sonra tekrar gonderebilsin
            setTimeout(() => setSent(false), 60000);
        } catch {
            setError(true);
            // Clear error after 5 seconds so user can retry
            setTimeout(() => setError(false), 5000);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-200 truncate">
                        <span className="font-medium">{t('verifyEmail')}</span>{' '}
                        <span className="text-amber-200/60">{t('verificationSent', { email: user.email || '' })}</span>
                    </p>
                </div>
                <button
                    onClick={handleResend}
                    disabled={sending || sent}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                    {sent ? (
                        <>
                            <CheckCircle className="h-3 w-3" />
                            {t('sent')}
                        </>
                    ) : error ? (
                        <>
                            <RefreshCw className="h-3 w-3" />
                            {t('sendFailed')}
                        </>
                    ) : (
                        <>
                            <RefreshCw className={`h-3 w-3 ${sending ? 'animate-spin' : ''}`} />
                            {t('resend')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
