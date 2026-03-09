/**
 * API Automation Tests — Automation Actions, Webhook Call, Idempotency
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockCollectionGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                update: mockUpdate,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                        update: mockUpdate,
                        collection: vi.fn().mockReturnValue({
                            add: mockAdd,
                        }),
                    }),
                    add: mockAdd,
                    get: mockCollectionGet,
                }),
            }),
        }),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TS'),
        increment: vi.fn((n: number) => n),
    },
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

// ── App URL mock ──
vi.mock('@/lib/utils/get-app-url', () => ({
    getAppUrl: vi.fn().mockReturnValue('https://app.example.com'),
}));

// ── Admin-db mocks ──
vi.mock('@/lib/firebase/admin-db', () => ({
    addCallLog: vi.fn().mockResolvedValue({ id: 'call-1' }),
    addActivityLog: vi.fn().mockResolvedValue(undefined),
    getCustomerByPhone: vi.fn().mockResolvedValue({ id: 'c1', name: 'Test Customer' }),
    createCustomer: vi.fn().mockResolvedValue({ id: 'c2' }),
    getCustomer: vi.fn().mockResolvedValue({ id: 'c1', name: 'Test Customer' }),
    getTenantFromRequest: vi.fn().mockReturnValue('tenant-123'),
    Timestamp: { now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }) },
}));

describe('API Automation Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ exists: true, data: () => ({ tenantId: 'tenant-123' }) });
        mockAdd.mockResolvedValue({ id: 'new-doc-id' });
        mockCollectionGet.mockResolvedValue({ docs: [] });
    });

    // ── Automation POST ──
    describe('/api/automation POST', () => {
        it('should create customer with valid data', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: {
                    action: 'create_customer',
                    payload: { name: 'New Customer', phone: '555-0001' },
                },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.status).toBe('created');
        });

        it('should create appointment with valid data', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: {
                    action: 'create_appointment',
                    payload: {
                        customerName: 'Ali',
                        customerPhone: '555-0001',
                        dateTime: '2025-06-15T10:00:00Z',
                    },
                },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should reject appointment with invalid date', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: {
                    action: 'create_appointment',
                    payload: {
                        customerName: 'Ali',
                        dateTime: 'not-a-date',
                    },
                },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('tarih');
        });

        it('should reject email notification with invalid email', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: {
                    action: 'send_notification',
                    payload: { type: 'email', to: 'invalid-email', body: 'Test' },
                },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('email');
        });

        it('should update ticket with valid data', async () => {
            mockUpdate.mockResolvedValue(undefined);

            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: {
                    action: 'update_ticket',
                    payload: { ticketId: 'ticket-1', status: 'resolved', note: 'Fixed' },
                },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.status).toBe('updated');
        });

        it('should return 400 for update_ticket without ticketId', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: {
                    action: 'update_ticket',
                    payload: { status: 'resolved' },
                },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 for unknown action', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: { action: 'nonexistent_action', payload: {} },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toContain('Unknown action');
        });

        it('should return 400 when action field is missing', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: { payload: {} },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 401 without authentication', async () => {
            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                body: { action: 'create_customer', payload: { name: 'Test' } },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should authenticate via API key', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ tenantId: 'tenant-123' }) });

            const { POST } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                method: 'POST',
                headers: { 'x-api-key': 'valid-key' },
                body: {
                    action: 'create_customer',
                    payload: { name: 'API Customer', phone: '555-9999' },
                },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });

    // ── Automation GET ──
    describe('/api/automation GET', () => {
        it('should return hooks list with tenant header', async () => {
            const { GET } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.hooks).toBeDefined();
            expect(data.hooks.length).toBeGreaterThan(0);
        });

        it('should return 403 without tenant header', async () => {
            const { GET } = await import('@/app/api/automation/route');
            const request = createMockRequest('/api/automation');
            const response = await GET(request);
            expect(response.status).toBe(403);
        });
    });

    // ── Webhook Call Idempotency ──
    describe('/api/webhook/call — Idempotency', () => {
        it('should return duplicate response for same callSid', async () => {
            const origKey = process.env.WEBHOOK_API_KEY;
            delete process.env.WEBHOOK_API_KEY;

            // First call — idempotency doc exists
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ companyName: 'Test' }) }) // tenant check
                   .mockResolvedValueOnce({ exists: true, data: () => ({ callLogId: 'existing-call', expiresAt: Date.now() + 86400000 }) }); // idempotency check

            const { POST } = await import('@/app/api/webhook/call/route');
            const request = createMockRequest('/api/webhook/call', {
                method: 'POST',
                body: {
                    tenantId: 'tenant-123',
                    customerPhone: '555-0001',
                    callSid: 'CA12345',
                },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.duplicate).toBe(true);
            expect(data.callLogId).toBe('existing-call');

            process.env.WEBHOOK_API_KEY = origKey;
        });
    });
});
