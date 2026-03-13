/**
 * API Billing Tests — Checkout, Usage, Emergency
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockAdd = vi.fn();
const mockMemberGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                collection: vi.fn().mockImplementation((subCol: string) => {
                    if (subCol === 'members') {
                        return {
                            doc: vi.fn().mockReturnValue({ get: mockMemberGet, set: mockSet }),
                            add: mockAdd,
                            get: vi.fn().mockResolvedValue({ docs: [] }),
                        };
                    }
                    return {
                        doc: vi.fn().mockReturnValue({ get: mockGet, set: mockSet }),
                        add: mockAdd,
                        get: vi.fn().mockResolvedValue({ docs: [] }),
                    };
                }),
            }),
        }),
    })),
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
}));

// ── requireStrictAuth mock ──
const mockRequireStrictAuth = vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    tenantId: 'tenant-123',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Billing mocks ──
vi.mock('@/lib/billing/lemonsqueezy', () => ({
    createCheckout: vi.fn().mockResolvedValue({ success: true, checkoutUrl: 'https://checkout.example.com' }),
    PLANS: {
        starter: { id: 'starter', name: 'Starter', nameTr: 'Başlangıç', description: 'Basic', priceTry: 299, priceYearlyTry: 2990, includedMinutes: 60, includedCalls: 100, maxConcurrentSessions: 1, features: [] },
        professional: { id: 'professional', name: 'Professional', nameTr: 'Profesyonel', description: 'Pro', priceTry: 799, priceYearlyTry: 7990, includedMinutes: 300, includedCalls: 500, maxConcurrentSessions: 3, features: [] },
        enterprise: { id: 'enterprise', name: 'Enterprise', nameTr: 'Kurumsal', description: 'Ent', priceTry: 1999, priceYearlyTry: 19990, includedMinutes: 1000, includedCalls: 2000, maxConcurrentSessions: 10, features: [] },
    },
    getSubscription: vi.fn().mockResolvedValue(null),
    isSubscriptionActive: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/billing/metering', () => ({
    getUsage: vi.fn().mockResolvedValue({ totalMinutes: 45, totalCalls: 30, period: '2024-01' }),
    getUsageHistory: vi.fn().mockResolvedValue([]),
    estimateCost: vi.fn().mockReturnValue({ totalTry: 150 }),
    checkUsageLimits: vi.fn().mockReturnValue({ minutesRemaining: 15, callsRemaining: 70 }),
    estimatePerCallCost: vi.fn().mockReturnValue({ costTry: 5 }),
    SUBSCRIPTION_TIERS: {
        starter: { name: 'Starter', includedMinutes: 60, includedCalls: 100 },
        professional: { name: 'Professional', includedMinutes: 300, includedCalls: 500 },
    },
}));

vi.mock('@/lib/billing/cost-monitor', () => ({
    getEmergencyModeStatus: vi.fn().mockResolvedValue({ active: false, reason: null }),
    activateEmergencyMode: vi.fn().mockResolvedValue(undefined),
    deactivateEmergencyMode: vi.fn().mockResolvedValue(undefined),
    updateCostMonitoringConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/get-app-url', () => ({
    getAppUrl: vi.fn().mockReturnValue('https://app.example.com'),
}));

vi.mock('@/lib/firebase/admin-db', () => ({
    getTenantFromRequest: vi.fn().mockReturnValue('tenant-123'),
}));

describe('API Billing Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
        // Default: member is owner (passes role check)
        mockMemberGet.mockResolvedValue({
            exists: true,
            data: () => ({ role: 'owner' }),
        });
    });

    // ── Checkout ──
    describe('/api/billing/checkout POST', () => {
        it('should create checkout URL with valid planId', async () => {
            const { POST } = await import('@/app/api/billing/checkout/route');
            const request = createMockRequest('/api/billing/checkout', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'x-user-id': 'user-1',
                    'x-user-role': 'owner',
                    'x-user-email': 'test@example.com',
                },
                body: { planId: 'starter' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.checkoutUrl).toBeDefined();
        });

        it('should return 400 for invalid planId', async () => {
            const { POST } = await import('@/app/api/billing/checkout/route');
            const request = createMockRequest('/api/billing/checkout', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'x-user-id': 'user-1',
                    'x-user-role': 'owner',
                },
                body: { planId: 'nonexistent' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { POST } = await import('@/app/api/billing/checkout/route');
            const request = createMockRequest('/api/billing/checkout', {
                method: 'POST',
                body: { planId: 'starter' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should return 403 for non-owner/admin role', async () => {
            mockMemberGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ role: 'viewer' }),
            });

            const { POST } = await import('@/app/api/billing/checkout/route');
            const request = createMockRequest('/api/billing/checkout', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'x-user-id': 'user-1',
                },
                body: { planId: 'starter' },
            });
            const response = await POST(request);
            expect(response.status).toBe(403);
        });
    });

    describe('/api/billing/checkout GET', () => {
        it('should return available plans', async () => {
            const { GET } = await import('@/app/api/billing/checkout/route');
            const response = await GET();
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.plans).toBeDefined();
            expect(data.plans.length).toBeGreaterThan(0);
        });
    });

    // ── Usage ──
    describe('/api/billing/usage GET', () => {
        it('should return usage data when authenticated', async () => {
            const { GET } = await import('@/app/api/billing/usage/route');
            const request = createMockRequest('/api/billing/usage', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.usage).toBeDefined();
            expect(data.cost).toBeDefined();
            expect(data.limits).toBeDefined();
        });

        it('should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/billing/usage/route');
            const request = createMockRequest('/api/billing/usage');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });

    // ── Emergency ──
    describe('/api/billing/emergency POST', () => {
        it('should activate emergency mode', async () => {
            const { POST } = await import('@/app/api/billing/emergency/route');
            const request = createMockRequest('/api/billing/emergency', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { action: 'activate' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { POST } = await import('@/app/api/billing/emergency/route');
            const request = createMockRequest('/api/billing/emergency', {
                method: 'POST',
                body: { action: 'activate' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 for invalid action', async () => {
            const { POST } = await import('@/app/api/billing/emergency/route');
            const request = createMockRequest('/api/billing/emergency', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { action: 'invalid-action' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });

    describe('/api/billing/emergency GET', () => {
        it('should return emergency status with tenant header', async () => {
            const { GET } = await import('@/app/api/billing/emergency/route');
            const request = createMockRequest('/api/billing/emergency', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.active).toBeDefined();
        });

        it('should return 401 without tenant header', async () => {
            vi.mocked((await import('@/lib/firebase/admin-db')).getTenantFromRequest).mockReturnValueOnce(null as any);

            const { GET } = await import('@/app/api/billing/emergency/route');
            const request = createMockRequest('/api/billing/emergency');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });
});
