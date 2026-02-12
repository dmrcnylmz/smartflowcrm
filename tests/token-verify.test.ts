import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyToken, extractBearerToken } from '@/lib/auth/token-verify';

// Helper: create a fake JWT with given payload
function createFakeJwt(payload: Record<string, unknown>): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encode = (obj: Record<string, unknown>) =>
        btoa(JSON.stringify(obj))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    return `${encode(header)}.${encode(payload)}.fake-signature`;
}

// Standard valid payload
function validPayload(overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
        sub: 'user-123',
        uid: 'user-123',
        email: 'test@example.com',
        email_verified: true,
        iat: now - 60,
        exp: now + 3600,
        aud: 'smartflowcrm',
        iss: 'https://securetoken.google.com/smartflowcrm',
        ...overrides,
    };
}

describe('Token Verify', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'smartflowcrm');
    });

    describe('extractBearerToken', () => {
        it('should extract token from valid Bearer header', () => {
            expect(extractBearerToken('Bearer abc123')).toBe('abc123');
        });

        it('should return null for missing header', () => {
            expect(extractBearerToken(null)).toBeNull();
        });

        it('should return null for non-Bearer header', () => {
            expect(extractBearerToken('Basic abc123')).toBeNull();
        });

        it('should return null for empty Bearer value', () => {
            expect(extractBearerToken('Bearer ')).toBeNull();
        });
    });

    describe('verifyToken', () => {
        it('should accept a valid token', async () => {
            const token = createFakeJwt(validPayload());
            const result = await verifyToken(token);

            expect(result.valid).toBe(true);
            expect(result.payload?.uid).toBe('user-123');
            expect(result.payload?.email).toBe('test@example.com');
        });

        it('should reject an expired token', async () => {
            const token = createFakeJwt(
                validPayload({ exp: Math.floor(Date.now() / 1000) - 120 }),
            );
            const result = await verifyToken(token);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('expired');
        });

        it('should reject a token issued in the future', async () => {
            const token = createFakeJwt(
                validPayload({ iat: Math.floor(Date.now() / 1000) + 300 }),
            );
            const result = await verifyToken(token);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('future');
        });

        it('should reject a token with wrong audience', async () => {
            const token = createFakeJwt(
                validPayload({ aud: 'wrong-project' }),
            );
            const result = await verifyToken(token);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('audience');
        });

        it('should reject a token with wrong issuer', async () => {
            const token = createFakeJwt(
                validPayload({ iss: 'https://evil.example.com' }),
            );
            const result = await verifyToken(token);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('issuer');
        });

        it('should reject a token with no subject (uid)', async () => {
            const token = createFakeJwt(validPayload({ sub: '' }));
            const result = await verifyToken(token);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('subject');
        });

        it('should reject malformed tokens', async () => {
            const result = await verifyToken('not-a-jwt');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('structure');
        });

        it('should reject tokens with invalid JSON payload', async () => {
            const badPayload = btoa('not-json')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            const result = await verifyToken(`header.${badPayload}.sig`);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('decode');
        });
    });
});
