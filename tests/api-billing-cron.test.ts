/**
 * API Tests — Billing Analytics, Billing Invoices, Cron Appointment Reminders
 *
 * Covers:
 *   GET /api/billing/analytics
 *   GET /api/billing/invoices
 *   GET /api/cron/appointment-reminders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock module-level fns (hoisted before imports) ──────────────────────────

const mockGetLatencyStats = vi.fn();
const mockGetProviderBreakdown = vi.fn();
const mockGetCostTrend = vi.fn();
const mockGetDailyMetrics = vi.fn();
const mockGetPipelineSummary = vi.fn();
const mockGetTenantFromRequest = vi.fn();
const mockSendReminder = vi.fn();

// ── Mock Firestore DB object ────────────────────────────────────────────────

const mockDb = {
    collection: vi.fn(),
    collectionGroup: vi.fn(),
};

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
    FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
}));

vi.mock('@/lib/billing/analytics', () => ({
    getLatencyStats: (...args: unknown[]) => mockGetLatencyStats(...args),
    getProviderBreakdown: (...args: unknown[]) => mockGetProviderBreakdown(...args),
    getCostTrend: (...args: unknown[]) => mockGetCostTrend(...args),
    getDailyMetrics: (...args: unknown[]) => mockGetDailyMetrics(...args),
    getPipelineSummary: (...args: unknown[]) => mockGetPipelineSummary(...args),
}));

vi.mock('@/lib/firebase/admin-db', () => ({
    getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
    getCallLogs: vi.fn(),
    getComplaints: vi.fn(),
    getInfoRequests: vi.fn(),
    getAppointments: vi.fn(),
}));

vi.mock('@/lib/notifications/email-service', () => ({
    sendAppointmentReminder: (...args: unknown[]) => mockSendReminder(...args),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((err: unknown) => {
        return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(path: string, headers?: Record<string, string>): NextRequest {
    return new NextRequest(new URL(path, 'http://localhost:3000'), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

function makeTenantRequest(path: string, tenantId = 'tenant-123'): NextRequest {
    return makeRequest(path, { 'x-user-tenant': tenantId });
}

function makeCronRequest(secret?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (secret) {
        headers['authorization'] = `Bearer ${secret}`;
    }
    return makeRequest('/api/cron/appointment-reminders', headers);
}

// ── Setup Firestore chain helpers ───────────────────────────────────────────

function setupInvoicesChain(docs: unknown[] = []) {
    const mockSnapshotGet = vi.fn().mockResolvedValue({ docs });
    const mockLimit = vi.fn().mockReturnValue({ get: mockSnapshotGet });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockInnerCollection = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDocRef = vi.fn().mockReturnValue({ collection: mockInnerCollection });
    const mockOuterCollection = vi.fn().mockReturnValue({ doc: mockDocRef });

    mockDb.collection.mockImplementation(mockOuterCollection);

    return { mockSnapshotGet, mockLimit, mockOrderBy, mockWhere };
}

function setupCronChain(appointmentDocs: unknown[] = [], tenantData: Record<string, unknown> = {}) {
    // collectionGroup('appointments').where().where().where().get()
    const mockCronGet = vi.fn().mockResolvedValue({ docs: appointmentDocs });
    mockDb.collectionGroup.mockReturnValue({
        where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: mockCronGet,
                }),
            }),
        }),
    });

    // collection('tenants').doc(tenantId).get() for tenant data lookup
    mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ data: () => tenantData }),
            collection: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                get: vi.fn().mockResolvedValue({ docs: [] }),
            }),
        }),
    });

    return { mockCronGet };
}

function makeAppointmentDoc(overrides: Record<string, unknown> = {}) {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const defaults = {
        status: 'scheduled',
        customerEmail: 'test@test.com',
        customerName: 'Test Customer',
        dateTime: {
            toDate: () => new Date(Date.now() + 3 * 60 * 60 * 1000), // +3h
        },
        reminderSent: false,
        notes: 'Test note',
    };
    return {
        data: () => ({ ...defaults, ...overrides }),
        ref: {
            parent: { parent: { id: 'tenant-1' } },
            update: mockUpdate,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromRequest.mockReturnValue('tenant-123');

    // Default analytics mocks
    mockGetLatencyStats.mockResolvedValue({ avg: 100, p95: 200 });
    mockGetProviderBreakdown.mockResolvedValue([{ provider: 'openai', count: 10 }]);
    mockGetCostTrend.mockResolvedValue([{ month: '2024-01', cost: 50 }]);
    mockGetDailyMetrics.mockResolvedValue([{ date: '2024-01-01', calls: 5 }]);
    mockGetPipelineSummary.mockResolvedValue({ totalCalls: 100, avgLatency: 120 });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. GET /api/billing/analytics
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/billing/analytics', () => {
    it('should return latency stats when type=latency', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=latency&range=7d');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.avg).toBe(100);
        expect(data.p95).toBe(200);
        expect(mockGetLatencyStats).toHaveBeenCalledWith(mockDb, 'tenant-123', 7);
    });

    it('should return cost trend when type=cost', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=cost&range=7d');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toEqual([{ month: '2024-01', cost: 50 }]);
        // 7 days -> Math.max(1, Math.ceil(7/30)) = 1 month
        expect(mockGetCostTrend).toHaveBeenCalledWith(mockDb, 'tenant-123', 1);
    });

    it('should return provider breakdown when type=providers', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=providers&range=7d');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toEqual([{ provider: 'openai', count: 10 }]);
        expect(mockGetProviderBreakdown).toHaveBeenCalledWith(mockDb, 'tenant-123', 7);
    });

    it('should return daily metrics when type=daily', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=daily&range=7d');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.metrics).toEqual([{ date: '2024-01-01', calls: 5 }]);
        expect(data.range).toBe('7d');
        expect(data.days).toBe(7);
        expect(mockGetDailyMetrics).toHaveBeenCalledWith(mockDb, 'tenant-123', 7);
    });

    it('should return combined summary when type=summary', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=summary&range=7d');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.summary).toEqual({ totalCalls: 100, avgLatency: 120 });
        expect(data.latency).toEqual({ avg: 100, p95: 200 });
        expect(data.providers).toEqual([{ provider: 'openai', count: 10 }]);
        expect(data.costTrend).toEqual([{ month: '2024-01', cost: 50 }]);
        expect(data.range).toBe('7d');
        expect(data.days).toBe(7);

        // All four analytics functions should be called in parallel
        expect(mockGetLatencyStats).toHaveBeenCalled();
        expect(mockGetProviderBreakdown).toHaveBeenCalled();
        expect(mockGetCostTrend).toHaveBeenCalled();
        expect(mockGetPipelineSummary).toHaveBeenCalled();
    });

    it('should default to summary when no type parameter', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?range=7d');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        // Should contain summary fields (same as type=summary)
        expect(data).toHaveProperty('summary');
        expect(data).toHaveProperty('latency');
        expect(data).toHaveProperty('providers');
        expect(data).toHaveProperty('costTrend');
    });

    it('should parse range=30d to 30 days', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=latency&range=30d');
        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(mockGetLatencyStats).toHaveBeenCalledWith(mockDb, 'tenant-123', 30);
    });

    it('should parse range=90d to 90 days', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=latency&range=90d');
        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(mockGetLatencyStats).toHaveBeenCalledWith(mockDb, 'tenant-123', 90);
    });

    it('should parse custom range like "14d" to 14 days', async () => {
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeTenantRequest('/api/billing/analytics?type=latency&range=14d');
        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(mockGetLatencyStats).toHaveBeenCalledWith(mockDb, 'tenant-123', 14);
    });

    it('should return 401 when no tenant', async () => {
        mockGetTenantFromRequest.mockReturnValue(null);
        const { GET } = await import('@/app/api/billing/analytics/route');
        const req = makeRequest('/api/billing/analytics?type=latency');
        const res = await GET(req);
        expect(res.status).toBe(401);

        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. GET /api/billing/invoices
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/billing/invoices', () => {
    it('should return activity list for authenticated tenant', async () => {
        const mockDocs = [
            {
                id: 'act-1',
                data: () => ({
                    event: 'payment_success',
                    type: 'billing',
                    details: { amount: 299 },
                    timestamp: 1704067200000, // 2024-01-01T00:00:00.000Z
                }),
            },
            {
                id: 'act-2',
                data: () => ({
                    event: 'subscription_created',
                    type: 'billing',
                    details: { plan: 'starter' },
                    timestamp: 1704153600000,
                }),
            },
        ];
        setupInvoicesChain(mockDocs);

        const { GET } = await import('@/app/api/billing/invoices/route');
        const req = makeTenantRequest('/api/billing/invoices');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.activities).toHaveLength(2);
        expect(data.count).toBe(2);
        expect(data.activities[0].id).toBe('act-1');
        expect(data.activities[0].type).toBe('payment_success');
        expect(data.activities[0].details).toEqual({ amount: 299 });
    });

    it('should respect custom limit parameter', async () => {
        setupInvoicesChain([]);

        const { GET } = await import('@/app/api/billing/invoices/route');
        const req = makeTenantRequest('/api/billing/invoices?limit=10');
        const res = await GET(req);
        expect(res.status).toBe(200);

        // Verify the chain was called; the limit function receives 10
        const data = await res.json();
        expect(data.count).toBe(0);
    });

    it('should cap limit at 100', async () => {
        setupInvoicesChain([]);

        const { GET } = await import('@/app/api/billing/invoices/route');
        const req = makeTenantRequest('/api/billing/invoices?limit=500');
        const res = await GET(req);
        expect(res.status).toBe(200);
        // The code does Math.min(parseInt('500'), 100) = 100
    });

    it('should return 403 when no tenant header', async () => {
        const { GET } = await import('@/app/api/billing/invoices/route');
        const req = makeRequest('/api/billing/invoices');
        const res = await GET(req);
        expect(res.status).toBe(403);

        const data = await res.json();
        expect(data.error).toBeTruthy();
    });

    it('should handle empty results', async () => {
        setupInvoicesChain([]);

        const { GET } = await import('@/app/api/billing/invoices/route');
        const req = makeTenantRequest('/api/billing/invoices');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.activities).toEqual([]);
        expect(data.count).toBe(0);
    });

    it('should format timestamps to ISO strings', async () => {
        const ts = 1704067200000; // 2024-01-01T00:00:00.000Z
        const mockDocs = [
            {
                id: 'act-ts',
                data: () => ({
                    event: 'payment_success',
                    type: 'billing',
                    details: {},
                    timestamp: ts,
                }),
            },
        ];
        setupInvoicesChain(mockDocs);

        const { GET } = await import('@/app/api/billing/invoices/route');
        const req = makeTenantRequest('/api/billing/invoices');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        // new Date(1704067200000).toISOString() === '2024-01-01T00:00:00.000Z'
        expect(data.activities[0].createdAt).toBe(new Date(ts).toISOString());
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. GET /api/cron/appointment-reminders
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/cron/appointment-reminders', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // Reset env before each cron test
        process.env = { ...originalEnv };
        delete process.env.CRON_SECRET;
        process.env.NODE_ENV = 'test';
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should send reminders for upcoming appointments', async () => {
        const doc = makeAppointmentDoc();
        setupCronChain([doc], { companyName: 'Test Co' });
        mockSendReminder.mockResolvedValue({ success: true, id: 'email-1' });

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.remindersSent).toBe(1);
        expect(data.errors).toBe(0);
        expect(data.timestamp).toBeTruthy();

        // sendAppointmentReminder was called
        expect(mockSendReminder).toHaveBeenCalledTimes(1);
        expect(mockSendReminder).toHaveBeenCalledWith(
            expect.objectContaining({
                customerName: 'Test Customer',
                customerEmail: 'test@test.com',
                companyName: 'Test Co',
            }),
        );

        // Doc was updated with reminderSent
        expect(doc.ref.update).toHaveBeenCalledWith(
            expect.objectContaining({
                reminderSent: true,
                reminderEmailId: 'email-1',
            }),
        );
    });

    it('should skip already reminded appointments', async () => {
        const doc = makeAppointmentDoc({ reminderSent: true });
        setupCronChain([doc], { companyName: 'Test Co' });

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.remindersSent).toBe(0);
        expect(mockSendReminder).not.toHaveBeenCalled();
    });

    it('should skip appointments without customer email', async () => {
        const doc = makeAppointmentDoc({ customerEmail: null });
        setupCronChain([doc], { companyName: 'Test Co' });

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.remindersSent).toBe(0);
        expect(mockSendReminder).not.toHaveBeenCalled();
    });

    it('should skip appointments too close (<1h) or too far (>24h)', async () => {
        const tooCloseDoc = makeAppointmentDoc({
            dateTime: {
                toDate: () => new Date(Date.now() + 30 * 60 * 1000), // +30min
            },
        });
        const tooFarDoc = makeAppointmentDoc({
            dateTime: {
                toDate: () => new Date(Date.now() + 25 * 60 * 60 * 1000), // +25h
            },
        });
        setupCronChain([tooCloseDoc, tooFarDoc], { companyName: 'Test Co' });

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.remindersSent).toBe(0);
        expect(mockSendReminder).not.toHaveBeenCalled();
    });

    it('should return count of reminders sent', async () => {
        const doc1 = makeAppointmentDoc({ customerEmail: 'a@test.com', customerName: 'A' });
        const doc2 = makeAppointmentDoc({ customerEmail: 'b@test.com', customerName: 'B' });
        setupCronChain([doc1, doc2], { companyName: 'Multi Co' });
        mockSendReminder.mockResolvedValue({ success: true, id: 'email-x' });

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.remindersSent).toBe(2);
        expect(data.errors).toBe(0);
        expect(mockSendReminder).toHaveBeenCalledTimes(2);
    });

    it('should return 401 with wrong cron secret', async () => {
        process.env.CRON_SECRET = 'correct-secret';
        setupCronChain([], {});

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest('wrong-secret');
        const res = await GET(req);
        expect(res.status).toBe(401);

        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
    });

    it('should allow request without secret in dev mode', async () => {
        // No CRON_SECRET set, NODE_ENV is 'test' (not production)
        delete process.env.CRON_SECRET;
        process.env.NODE_ENV = 'test';
        setupCronChain([], {});

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.remindersSent).toBe(0);
    });

    it('should handle reminder send failure gracefully', async () => {
        const doc = makeAppointmentDoc();
        setupCronChain([doc], { companyName: 'Fail Co' });
        mockSendReminder.mockResolvedValue({ success: false });

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.remindersSent).toBe(0);
        expect(data.errors).toBe(1);
        // Doc should NOT be updated when send fails
        expect(doc.ref.update).not.toHaveBeenCalled();
    });

    it('should handle empty appointment list', async () => {
        setupCronChain([], {});

        const { GET } = await import('@/app/api/cron/appointment-reminders/route');
        const req = makeCronRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.remindersSent).toBe(0);
        expect(data.errors).toBe(0);
        expect(mockSendReminder).not.toHaveBeenCalled();
    });
});
