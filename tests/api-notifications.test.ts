/**
 * API Notifications Tests — CRUD for notifications
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteDoc = vi.fn();
const mockCollectionGet = vi.fn();
const mockBatch = { update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                update: mockUpdate,
                delete: mockDeleteDoc,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                        update: mockUpdate,
                        delete: mockDeleteDoc,
                    }),
                    add: mockAdd,
                    get: mockCollectionGet,
                    orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            get: mockCollectionGet,
                            where: vi.fn().mockReturnValue({ get: mockCollectionGet }),
                        }),
                    }),
                    where: vi.fn().mockReturnValue({
                        get: mockCollectionGet,
                        count: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({ data: () => ({ count: 3 }) }),
                        }),
                    }),
                }),
            }),
        }),
        batch: vi.fn().mockReturnValue(mockBatch),
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

describe('API Notifications Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
        mockAdd.mockResolvedValue({ id: 'notif-1' });
        mockCollectionGet.mockResolvedValue({
            docs: [
                {
                    id: 'n1',
                    data: () => ({ title: 'Test', message: 'Hello', read: false, createdAt: { toDate: () => new Date() } }),
                    ref: { update: vi.fn() },
                },
            ],
        });
    });

    // ── GET ──
    describe('GET /api/notifications', () => {
        it('should return notifications when authenticated', async () => {
            const { GET } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.notifications).toBeDefined();
            expect(data.unreadCount).toBeDefined();
        });

        it('should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });

    // ── POST ──
    describe('POST /api/notifications', () => {
        it('should create notification with valid data', async () => {
            const { POST } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { title: 'New Alert', message: 'Something happened', type: 'warning' },
            });
            const response = await POST(request);
            const data = await response.json();
            expect(response.status).toBe(201);
            expect(data.id).toBeDefined();
        });

        it('should return 400 when title is missing', async () => {
            const { POST } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { message: 'No title' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when message is missing', async () => {
            const { POST } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { title: 'No message' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
        });
    });

    // ── PUT ──
    describe('PUT /api/notifications', () => {
        it('should mark single notification as read', async () => {
            mockUpdate.mockResolvedValue(undefined);

            const { PUT } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { notificationId: 'notif-1' },
            });
            const response = await PUT(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('okundu');
        });

        it('should mark all as read', async () => {
            const { PUT } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { markAll: true },
            });
            const response = await PUT(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('işaretlendi');
        });

        it('should return 400 when neither notificationId nor markAll provided', async () => {
            const { PUT } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {},
            });
            const response = await PUT(request);
            expect(response.status).toBe(400);
        });
    });

    // ── DELETE ──
    describe('DELETE /api/notifications', () => {
        it('should delete notification', async () => {
            mockDeleteDoc.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { notificationId: 'notif-1' },
            });
            const response = await DELETE(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.message).toContain('silindi');
        });

        it('should return 400 without notificationId', async () => {
            const { DELETE } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {},
            });
            const response = await DELETE(request);
            expect(response.status).toBe(400);
        });

        it('should return 401 without auth', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { DELETE } = await import('@/app/api/notifications/route');
            const request = createMockRequest('/api/notifications', {
                method: 'DELETE',
                body: { notificationId: 'notif-1' },
            });
            const response = await DELETE(request);
            expect(response.status).toBe(401);
        });
    });
});
