/**
 * Billing Checkout Route Tests
 *
 * Tests for POST /api/billing/checkout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createAuthenticatedRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ─────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({ role: 'owner' }),
                        }),
                    }),
                }),
            }),
        }),
    })),
}));

// ── requireStrictAuth mock ──────────────────────────────────────────────────
const mockRequireStrictAuth = vi.fn();
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Billing mock ────────────────────────────────────────────────────────────
vi.mock('@/lib/billing/lemonsqueezy', () => ({
    createCheckout: vi.fn().mockResolvedValue({
        success: true,
        checkoutUrl: 'https://checkout.lemonsqueezy.com/test',
    }),
    PLANS: {
        starter: { id: 'starter', name: 'Starter', nameTr: 'Başlangıç', description: '', priceTry: 0, priceYearlyTry: 0, includedMinutes: 100, includedCalls: 50, maxConcurrentSessions: 1, features: [] },
        professional: { id: 'professional', name: 'Professional', nameTr: 'Profesyonel', description: '', priceTry: 0, priceYearlyTry: 0, includedMinutes: 500, includedCalls: 250, maxConcurrentSessions: 3, features: [] },
        enterprise: { id: 'enterprise', name: 'Enterprise', nameTr: 'Kurumsal', description: '', priceTry: 0, priceYearlyTry: 0, includedMinutes: 2000, includedCalls: 1000, maxConcurrentSessions: 10, features: [] },
    },
}));

// ── Error handler mock ──────────────────────────────────────────────────────
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    ),
}));

// ── get-app-url mock ────────────────────────────────────────────────────────
vi.mock('@/lib/utils/get-app-url', () => ({
    getAppUrl: vi.fn().mockReturnValue('https://app.callception.com'),
}));

describe('Billing Checkout — POST /api/billing/checkout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Default: authenticated user
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'user-1',
            email: 'user@example.com',
            tenantId: 'tenant-123',
        });
    });

    it('handler exports POST function', async () => {
        const mod = await import('@/app/api/billing/checkout/route');
        expect(mod.POST).toBeDefined();
        expect(typeof mod.POST).toBe('function');
    });

    it('rejects unauthenticated requests (401)', async () => {
        const { NextResponse } = await import('next/server');
        mockRequireStrictAuth.mockResolvedValue({
            error: NextResponse.json(
                { error: 'Kimlik dogrulama gerekli', code: 'AUTH_ERROR' },
                { status: 401 },
            ),
        });

        const { POST } = await import('@/app/api/billing/checkout/route');
        const req = createMockRequest('/api/billing/checkout', {
            method: 'POST',
            body: { planId: 'starter' },
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('rejects requests without valid planId (400)', async () => {
        const { POST } = await import('@/app/api/billing/checkout/route');
        const req = createAuthenticatedRequest('/api/billing/checkout', {
            method: 'POST',
            body: { planId: 'invalid-plan' },
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
    });
});
