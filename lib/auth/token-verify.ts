/**
 * Token Verification Module — Lightweight (Edge Runtime compatible)
 *
 * Used by middleware for fast JWT pre-check.
 * Does NOT verify cryptographic signature — checks structure, expiry,
 * audience, issuer, and subject only.
 *
 * For full signature verification in API routes, use:
 *   import { verifyTokenStrict } from '@/lib/auth/token-verify-strict';
 */

// --- Types (shared across both implementations) ---

export interface TokenPayload {
    /** Firebase Auth user ID */
    uid: string;
    /** User email (if available) */
    email?: string;
    /** Email verified flag */
    email_verified?: boolean;
    /** Token issued-at (unix seconds) */
    iat: number;
    /** Token expiry (unix seconds) */
    exp: number;
    /** Audience — should match Firebase project ID */
    aud: string;
    /** Issuer — should match Firebase secure token issuer */
    iss: string;
    /** Subject — same as uid */
    sub: string;
    /** Tenant ID (from Firebase custom claims) */
    tenantId?: string;
    /** User role within tenant (from Firebase custom claims) */
    role?: string;
}

export interface VerifyResult {
    valid: boolean;
    payload?: TokenPayload;
    error?: string;
}

// --- Configuration ---

function getFirebaseProjectId(): string {
    return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
}

function getExpectedIssuer(): string {
    return `https://securetoken.google.com/${getFirebaseProjectId()}`;
}

const CLOCK_SKEW_SECONDS = 30;

// --- Lightweight decode (Edge Runtime safe) ---

function base64UrlDecode(input: string): string {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    if (typeof atob === 'function') {
        return atob(padded);
    }
    return Buffer.from(padded, 'base64').toString('utf-8');
}

function decodeAndValidate(token: string): VerifyResult {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token structure' };
    }

    let payload: TokenPayload;
    try {
        const json = base64UrlDecode(parts[1]);
        payload = JSON.parse(json);
    } catch {
        return { valid: false, error: 'Failed to decode token payload' };
    }

    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp < now - CLOCK_SKEW_SECONDS) {
        return { valid: false, error: 'Token expired' };
    }

    if (payload.iat && payload.iat > now + CLOCK_SKEW_SECONDS) {
        return { valid: false, error: 'Token issued in the future' };
    }

    const projectId = getFirebaseProjectId();
    if (projectId && payload.aud !== projectId) {
        return { valid: false, error: `Invalid audience: expected ${projectId}` };
    }

    const expectedIssuer = getExpectedIssuer();
    if (projectId && payload.iss !== expectedIssuer) {
        return { valid: false, error: `Invalid issuer: expected ${expectedIssuer}` };
    }

    if (!payload.sub) {
        return { valid: false, error: 'Token has no subject (uid)' };
    }

    payload.uid = payload.sub;
    return { valid: true, payload };
}

// --- Public API ---

/**
 * Lightweight token verification (Edge Runtime compatible).
 * Used by middleware. No signature check.
 */
export async function verifyToken(token: string): Promise<VerifyResult> {
    return decodeAndValidate(token);
}

/**
 * Extract the Bearer token from an Authorization header value.
 */
export function extractBearerToken(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : null;
}
