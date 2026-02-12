/**
 * Strict Token Verification — Firebase Admin SDK
 *
 * Node.js runtime ONLY — NOT for Edge Runtime / middleware.
 * Use in API routes for full cryptographic signature verification.
 *
 * Usage in API routes:
 *   import { verifyTokenStrict } from '@/lib/auth/token-verify-strict';
 *   const result = await verifyTokenStrict(token);
 */

import { getAdminAuth } from './firebase-admin';
import type { VerifyResult, TokenPayload } from './token-verify';

// Re-export types for convenience
export type { VerifyResult, TokenPayload };

/**
 * Verify a Firebase ID token with FULL cryptographic verification.
 *
 * Checks:
 * - RSA signature against Google's rotating public keys
 * - Token expiry, audience, issuer
 * - Token revocation status (optional)
 *
 * @param token - Raw JWT string from Authorization header
 * @param checkRevoked - If true, also checks if token has been revoked (extra network call)
 */
export async function verifyTokenStrict(
    token: string,
    checkRevoked: boolean = false,
): Promise<VerifyResult> {
    try {
        const auth = getAdminAuth();
        const decodedToken = await auth.verifyIdToken(token, checkRevoked);

        return {
            valid: true,
            payload: {
                uid: decodedToken.uid,
                email: decodedToken.email,
                email_verified: decodedToken.email_verified,
                iat: decodedToken.iat,
                exp: decodedToken.exp,
                aud: typeof decodedToken.aud === 'string'
                    ? decodedToken.aud
                    : String(decodedToken.aud),
                iss: decodedToken.iss,
                sub: decodedToken.sub,
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Token verification failed';

        if (message.includes('expired')) {
            return { valid: false, error: 'Token expired' };
        }
        if (message.includes('revoked')) {
            return { valid: false, error: 'Token has been revoked' };
        }
        if (message.includes('argument') || message.includes('Decoding')) {
            return { valid: false, error: 'Invalid token format' };
        }

        return { valid: false, error: message };
    }
}
