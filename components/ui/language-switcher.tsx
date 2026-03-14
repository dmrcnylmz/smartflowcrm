'use client';

import { useLocale } from 'next-intl';
import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { locales, localeNames, localeFlags, type Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ collapsed }: { collapsed?: boolean }) {
    const locale = useLocale() as Locale;
    const [isPending, setIsPending] = useState(false);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    async function switchLocale(newLocale: Locale) {
        if (newLocale === locale) {
            setOpen(false);
            return;
        }
        setIsPending(true);
        try {
            await fetch('/api/locale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locale: newLocale }),
            });
            // Full page reload ensures the server reads the new NEXT_LOCALE cookie
            // router.refresh() has a race condition where the cookie may not be sent back
            window.location.reload();
        } catch {
            setIsPending(false);
        }
        setOpen(false);
    }

    return (
        <div ref={ref} className="relative">
            {/* Trigger button */}
            <button
                onClick={() => setOpen(!open)}
                disabled={isPending}
                className={cn(
                    'flex items-center gap-2 rounded-lg transition-colors',
                    'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                    collapsed
                        ? 'p-2 justify-center w-full'
                        : 'px-3 py-2 w-full justify-start',
                    isPending && 'opacity-50',
                )}
                title={localeNames[locale]}
            >
                {collapsed ? (
                    <span className="text-base">{localeFlags[locale]}</span>
                ) : (
                    <>
                        <Globe className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{localeFlags[locale]} {localeNames[locale]}</span>
                    </>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className={cn(
                    'absolute z-50 rounded-lg border border-border/60 bg-popover shadow-xl py-1 min-w-[160px]',
                    collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-1 left-0',
                )}>
                    {locales.map((l) => (
                        <button
                            key={l}
                            onClick={() => switchLocale(l)}
                            className={cn(
                                'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors',
                                l === locale
                                    ? 'text-primary bg-primary/10 font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                            )}
                        >
                            <span className="text-base">{localeFlags[l]}</span>
                            <span>{localeNames[l]}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
