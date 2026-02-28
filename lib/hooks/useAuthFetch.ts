'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * Hook that returns an authenticated fetch function.
 * Automatically attaches Firebase ID token as Bearer token to all requests.
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
                } catch {
                    // Token fetch failed, proceed without auth header
                }
            }

            return fetch(input, { ...init, headers });
        },
        [user]
    );

    return authFetch;
}
