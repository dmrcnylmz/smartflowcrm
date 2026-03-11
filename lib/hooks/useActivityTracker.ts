'use client';

/**
 * useActivityTracker — Client-side user activity tracking hook
 *
 * Tracks:
 * - Page views (on pathname change)
 * - Login events (called manually after auth)
 * - Feature usage (called by components)
 *
 * All events are sent to POST /api/analytics/track
 * Non-blocking, fire-and-forget — never throws.
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';

const TRACK_ENDPOINT = '/api/analytics/track';

// Debounce: don't track same page more than once per 5 seconds
const PAGE_VIEW_DEBOUNCE_MS = 5000;

export function usePageViewTracker() {
    const pathname = usePathname();
    const { user, getIdToken } = useAuth();
    const lastTracked = useRef<string>('');
    const lastTime = useRef<number>(0);

    useEffect(() => {
        if (!user || !pathname) return;

        // Skip auth pages, API routes
        if (pathname === '/login' || pathname === '/onboarding' || pathname.startsWith('/api')) return;

        // Debounce
        const now = Date.now();
        if (pathname === lastTracked.current && now - lastTime.current < PAGE_VIEW_DEBOUNCE_MS) return;

        lastTracked.current = pathname;
        lastTime.current = now;

        // Fire-and-forget
        (async () => {
            try {
                const token = await getIdToken();
                if (!token) return;
                fetch(TRACK_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ type: 'page_view', page: pathname }),
                }).catch(() => {}); // Silent fail
            } catch {
                // Never break the app for tracking
            }
        })();
    }, [pathname, user, getIdToken]);
}

export function useTrackEvent() {
    const { user, getIdToken } = useAuth();

    const trackEvent = useCallback(async (
        type: 'login' | 'feature_use' | 'logout',
        data?: { feature?: string; method?: string; metadata?: Record<string, string> }
    ) => {
        if (!user) return;
        try {
            const token = await getIdToken();
            if (!token) return;
            fetch(TRACK_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ type, ...data }),
            }).catch(() => {});
        } catch {
            // Silent fail
        }
    }, [user, getIdToken]);

    return trackEvent;
}
