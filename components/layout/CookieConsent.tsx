'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

/**
 * CookieConsent — KVKK uyumlu cerez onay banneri
 *
 * - "Tümünü Kabul Et" → analytics + zorunlu cerezler
 * - "Sadece Zorunlu" → yalnizca oturum cerezleri
 * - localStorage ile tercih kaydedilir
 * - Google Analytics yalnizca 'all' onayinda yuklenir (Faz 2)
 */

export type CookieConsentValue = 'all' | 'essential' | null;

const STORAGE_KEY = 'cookie_consent';

export function getCookieConsent(): CookieConsentValue {
    if (typeof window === 'undefined') return null;
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'all' || val === 'essential') return val;
    return null;
}

export function CookieConsent() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Banner yalnizca tercih yapilmamissa gorunur
        const consent = getCookieConsent();
        if (!consent) {
            // Kisa gecikme ile goster (sayfa yukleme UX'i icin)
            const timer = setTimeout(() => setVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = (value: 'all' | 'essential') => {
        localStorage.setItem(STORAGE_KEY, value);
        setVisible(false);

        // Consent event — Faz 2'de Google Analytics bunu dinleyecek
        window.dispatchEvent(new CustomEvent('cookie-consent-change', { detail: value }));
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-5">
                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Cookie className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                            Çerez Kullanımı
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Callception, hizmet kalitesini artırmak için çerezler kullanmaktadır.
                            Zorunlu çerezler platformun çalışması için gereklidir.
                            Analitik çerezler ise deneyiminizi iyileştirmemize yardımcı olur.{' '}
                            <Link href="/privacy" className="text-violet-600 hover:underline">
                                Gizlilik Politikası
                            </Link>
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                            <button
                                onClick={() => handleAccept('all')}
                                className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                            >
                                Tümünü Kabul Et
                            </button>
                            <button
                                onClick={() => handleAccept('essential')}
                                className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Sadece Zorunlu
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => handleAccept('essential')}
                        className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                        aria-label="Kapat"
                    >
                        <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            </div>
        </div>
    );
}
