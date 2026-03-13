/**
 * API Billing Swap Tests — Plan / Interval Change via Lemon Squeezy
 *
 * Tests for:
 *   - POST /api/billing/swap  (auth, validation, Firestore checks, LS API)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Firebase Admin mock ─────────────────────────────────────────────────────
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── requireStrictAuth mock ──────────────────────────────────────────────────
const mockRequireStrictAuth = vi.fn();
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Firestore mock (chainable: tenants→doc→members/subscription) ────────────
const mockMemberGet = vi.fn();
const mockSubGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockImplementation((subCol: string) => {
                    if (subCol === 'members') {
                        return {
                            doc: vi.fn().mockReturnValue({
                                get: (...args: unknown[]) => mockMemberGet(...args),
                            }),
                        };
                    }
                    // subscription or others
                    return {
                        doc: vi.fn().mockReturnValue({
                            get: (...args: unknown[]) => mockSubGet(...args),
                        }),
                    };
                }),
            }),
        }),
    })),
}));

// ── Lemon Squeezy mock ──────────────────────────────────────────────────────
const mockGetVariantId = vi.fn();
const mockUpdateSubscriptionVariant = vi.fn();

vi.mock('@/lib/billing/lemonsqueezy', () => ({
    getVariantId: (...args: unknown[]) => mockGetVariantId(...args),
    updateSubscriptionVariant: (...args: unknown[]) => mockUpdateSubscriptionVariant(...args),
}));

// ── Error handler mock ──────────────────────────────────────────────────────
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn().mockImplementation(() =>
        new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
    ),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildSwapRequest(
    body: Record<string, unknown>,
    headers?: Record<string, string>,
): NextRequest {
    return new NextRequest(new URL('http://localhost:3000/api/billing/swap'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

/** Standard auth headers for owner role */
const ownerHeaders: Record<string, string> = {
    'x-user-tenant': 'tenant-123',
    'x-user-uid': 'user-1',
    'x-user-role': 'owner',
};

/** Active subscription Firestore data */
function activeSubscription(overrides?: Record<string, unknown>) {
    return {
        exists: true,
        data: () => ({
            planId: 'starter',
            billingInterval: 'monthly',
            status: 'active',
            lsSubscriptionId: 'ls-sub-123',
            ...overrides,
        }),
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/billing/swap — Auth
// ═════════════════════════════════════════════════════════════════════════════

/** Setup auth mock for successful authentication */
function setupAuth(role: string = 'owner') {
    mockRequireStrictAuth.mockResolvedValue({
        uid: 'user-1',
        email: 'test@example.com',
        tenantId: 'tenant-123',
    });
    mockMemberGet.mockResolvedValue({
        exists: true,
        data: () => ({ role }),
    });
}

/** Setup auth mock for failed authentication */
function setupAuthFailure() {
    mockRequireStrictAuth.mockResolvedValue({
        error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
}

describe('POST /api/billing/swap — Auth', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('should return 401 when auth fails', async () => {
        setupAuthFailure();

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            { 'x-user-uid': 'user-1', 'x-user-role': 'owner' },
        );

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('should return 403 for viewer role', async () => {
        setupAuth('viewer');

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('should return 403 for agent role', async () => {
        setupAuth('agent');

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('should allow admin role', async () => {
        setupAuth('admin');
        mockSubGet.mockResolvedValue(activeSubscription());
        mockGetVariantId.mockReturnValue('variant-pro-monthly');
        mockUpdateSubscriptionVariant.mockResolvedValue({ success: true });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(200);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/billing/swap — Body Validation
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/billing/swap — Validation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        setupAuth('owner');
    });

    it('should return 400 for invalid planId', async () => {
        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'nonexistent', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('should return 400 for missing planId', async () => {
        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('should return 400 for invalid billingInterval', async () => {
        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'starter', billingInterval: 'weekly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/billing/swap — Firestore Checks
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/billing/swap — Subscription Checks', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        setupAuth('owner');
    });

    it('should return 404 when no active subscription exists', async () => {
        mockSubGet.mockResolvedValue({ exists: false, data: () => null });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(404);

        const body = await res.json();
        expect(body.error).toBeDefined();
    });

    it('should return 400 when lsSubscriptionId is missing', async () => {
        mockSubGet.mockResolvedValue(activeSubscription({ lsSubscriptionId: null }));

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('Lemon Squeezy');
    });

    it('should return 400 for non-swappable subscription status (expired)', async () => {
        mockSubGet.mockResolvedValue(activeSubscription({ status: 'expired' }));

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toContain('expired');
    });

    it('should return 400 for non-swappable subscription status (cancelled)', async () => {
        mockSubGet.mockResolvedValue(activeSubscription({ status: 'cancelled' }));

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('should return 400 when swapping to the same plan and interval', async () => {
        mockSubGet.mockResolvedValue(activeSubscription({
            planId: 'starter',
            billingInterval: 'monthly',
        }));

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'starter', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBeDefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/billing/swap — Lemon Squeezy API
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/billing/swap — LS API Integration', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        setupAuth('owner');
        // Default: active subscription on starter/monthly
        mockSubGet.mockResolvedValue(activeSubscription());
    });

    it('should return 500 when variant ID is not found', async () => {
        mockGetVariantId.mockReturnValue(null);

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(500);

        const body = await res.json();
        expect(body.error).toContain('varyant');
    });

    it('should return 200 on successful plan swap', async () => {
        mockGetVariantId.mockReturnValue('variant-pro-monthly');
        mockUpdateSubscriptionVariant.mockResolvedValue({ success: true });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.message).toBeDefined();

        // Verify LS API was called with correct args
        expect(mockUpdateSubscriptionVariant).toHaveBeenCalledWith(
            'ls-sub-123',
            'variant-pro-monthly',
            true, // prorate defaults to true
        );
    });

    it('should return 200 on successful interval change (monthly to yearly)', async () => {
        mockGetVariantId.mockReturnValue('variant-starter-yearly');
        mockUpdateSubscriptionVariant.mockResolvedValue({ success: true });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'starter', billingInterval: 'yearly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
    });

    it('should pass prorate=false when explicitly set', async () => {
        mockGetVariantId.mockReturnValue('variant-enterprise-yearly');
        mockUpdateSubscriptionVariant.mockResolvedValue({ success: true });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'enterprise', billingInterval: 'yearly', prorate: false },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(mockUpdateSubscriptionVariant).toHaveBeenCalledWith(
            'ls-sub-123',
            'variant-enterprise-yearly',
            false,
        );
    });

    it('should return 500 when LS API returns failure', async () => {
        mockGetVariantId.mockReturnValue('variant-pro-monthly');
        mockUpdateSubscriptionVariant.mockResolvedValue({
            success: false,
            error: 'Subscription update failed on Lemon Squeezy',
        });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(500);

        const body = await res.json();
        expect(body.error).toContain('Lemon Squeezy');
    });

    it('should allow swap for on_trial subscription status', async () => {
        mockSubGet.mockResolvedValue(activeSubscription({ status: 'on_trial' }));
        mockGetVariantId.mockReturnValue('variant-pro-monthly');
        mockUpdateSubscriptionVariant.mockResolvedValue({ success: true });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'professional', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
    });

    it('should allow swap for past_due subscription status', async () => {
        mockSubGet.mockResolvedValue(activeSubscription({ status: 'past_due' }));
        mockGetVariantId.mockReturnValue('variant-enterprise-monthly');
        mockUpdateSubscriptionVariant.mockResolvedValue({ success: true });

        const { POST } = await import('@/app/api/billing/swap/route');
        const req = buildSwapRequest(
            { planId: 'enterprise', billingInterval: 'monthly' },
            ownerHeaders,
        );

        const res = await POST(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
    });
});
