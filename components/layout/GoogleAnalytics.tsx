'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { getCookieConsent } from '@/components/layout/CookieConsent';

/**
 * GoogleAnalytics — gtag.js entegrasyonu
 *
 * Yalnizca cookie consent 'all' oldugunda yuklenir.
 * Cookie consent degistiginde otomatik olarak kontrol eder.
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
    const [consentGranted, setConsentGranted] = useState(false);

    useEffect(() => {
        // Initial check
        const consent = getCookieConsent();
        setConsentGranted(consent === 'all');

        // Listen for consent changes
        const handleConsentChange = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setConsentGranted(detail === 'all');
        };

        window.addEventListener('cookie-consent-change', handleConsentChange);
        return () => window.removeEventListener('cookie-consent-change', handleConsentChange);
    }, []);

    // GA yalnizca measurement ID varsa ve consent verildiyse yuklenir
    if (!GA_MEASUREMENT_ID || !consentGranted) return null;

    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${GA_MEASUREMENT_ID}', {
                        anonymize_ip: true,
                        cookie_flags: 'SameSite=None;Secure',
                    });
                `}
            </Script>
        </>
    );
}
