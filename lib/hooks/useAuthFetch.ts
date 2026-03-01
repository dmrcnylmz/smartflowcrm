'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * Hook that returns an authenticated fetch function.
 * Automatically attaches Firebase ID token as Bearer token to all requests.
 * Throws on token fetch failures to prevent silent unauthenticated requests.
 */
export function useAuthFetch() {
    const { user } = useAuth();

    const authFetch = useCallback(
        async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const headers = new Headers(init?.headers);

            if (user) {
                try {
                    const token = await user.getIdToken();
                    headers.set('Authorization', `Bearer ${token}`);
                } catch (err) {
                    console.warn('[useAuthFetch] Token fetch failed, request will be unauthenticated:', err);
                    // Don't silently proceed — throw so caller can handle
                    throw new Error('Kimlik doğrulama başarısız. Lütfen tekrar giriş yapın.');
                }
            }

            return fetch(input, { ...init, headers });
        },
        [user]
    );

    return authFetch;
}
