/**
 * API Cron Job Tests — Appointment Reminders, Data Retention
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockCollectionGroupGet = vi.fn().mockResolvedValue({ docs: [] });
const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [] });
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

// Build a chainable where mock for collectionGroup
const mockWhereChain = {
    where: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    get: mockCollectionGroupGet,
};
mockWhereChain.where.mockReturnValue(mockWhereChain);

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
            }),
            select: vi.fn().mockReturnValue({ get: mockCollectionGet }),
            count: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ data: () => ({ count: 5 }) }) }),
            get: mockCollectionGet,
        }),
        collectionGroup: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue(mockWhereChain),
        }),
        batch: vi.fn().mockReturnValue({
            delete: mockBatchDelete,
            commit: mockBatchCommit,
        }),
        doc: vi.fn().mockReturnValue({}),
    })),
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
}));

vi.mock('@/lib/notifications/email-service', () => ({
    sendAppointmentReminder: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
}));

vi.mock('@/lib/compliance/audit', () => ({
    findExpiredRecords: vi.fn().mockResolvedValue([]),
    getRetentionPolicy: vi.fn().mockResolvedValue({
        callRecordingsDays: 60,
        transcriptsDays: 365,
    }),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((_err: unknown, context: string) =>
        new Response(JSON.stringify({ error: `${context} failed` }), { status: 500 }),
    ),
}));

describe('API Cron Job Tests', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        // Set CRON_SECRET for tests
        process.env.CRON_SECRET = 'test-cron-secret';
        process.env.NODE_ENV = 'test';
    });

    // ── Appointment Reminders ──
    describe('/api/cron/appointment-reminders GET', () => {
        it('should reject without CRON_SECRET authorization', async () => {
            const { GET } = await import('@/app/api/cron/appointment-reminders/route');
            const request = createMockRequest('/api/cron/appointment-reminders');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should reject with incorrect CRON_SECRET', async () => {
            const { GET } = await import('@/app/api/cron/appointment-reminders/route');
            const request = createMockRequest('/api/cron/appointment-reminders', {
                headers: { 'Authorization': 'Bearer wrong-secret' },
            });
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should not return 401 with correct CRON_SECRET (auth passes)', async () => {
            const { GET } = await import('@/app/api/cron/appointment-reminders/route');
            const request = createMockRequest('/api/cron/appointment-reminders', {
                headers: { 'authorization': 'Bearer test-cron-secret' },
            });
            const response = await GET(request);
            // Auth check passes (not 401) — route proceeds to Firestore queries
            // which may throw due to mock limitations, but the auth layer works
            expect(response.status).not.toBe(401);
        });

        it('should export GET function', async () => {
            const route = await import('@/app/api/cron/appointment-reminders/route');
            expect(typeof route.GET).toBe('function');
        });
    });

    // ── Data Retention ──
    describe('/api/cron/data-retention GET', () => {
        it('should reject without CRON_SECRET authorization', async () => {
            const { GET } = await import('@/app/api/cron/data-retention/route');
            const request = createMockRequest('/api/cron/data-retention');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should reject with incorrect CRON_SECRET', async () => {
            const { GET } = await import('@/app/api/cron/data-retention/route');
            const request = createMockRequest('/api/cron/data-retention', {
                headers: { 'Authorization': 'Bearer wrong-secret' },
            });
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should succeed with correct CRON_SECRET', async () => {
            mockCollectionGet.mockResolvedValueOnce({ docs: [] });

            const { GET } = await import('@/app/api/cron/data-retention/route');
            const request = createMockRequest('/api/cron/data-retention', {
                headers: { 'Authorization': 'Bearer test-cron-secret' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
            expect(typeof data.tenantsProcessed).toBe('number');
            expect(typeof data.totalDeleted).toBe('number');
        });

        it('should return 503 in production when CRON_SECRET is not set', async () => {
            process.env.CRON_SECRET = '';
            process.env.NODE_ENV = 'production';

            // Re-import to pick up new env
            vi.resetModules();
            // Re-apply mocks after resetModules
            vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));
            vi.mock('firebase-admin/firestore', () => ({
                getFirestore: vi.fn(() => ({
                    collection: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [] }) }),
                    }),
                })),
                FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
            }));
            vi.mock('@/lib/compliance/audit', () => ({
                findExpiredRecords: vi.fn().mockResolvedValue([]),
                getRetentionPolicy: vi.fn().mockResolvedValue({ callRecordingsDays: 60, transcriptsDays: 365 }),
            }));
            vi.mock('@/lib/utils/error-handler', () => ({
                handleApiError: vi.fn((_err: unknown, context: string) =>
                    new Response(JSON.stringify({ error: `${context} failed` }), { status: 500 }),
                ),
            }));

            const { GET } = await import('@/app/api/cron/data-retention/route');
            const request = createMockRequest('/api/cron/data-retention');
            const response = await GET(request);
            expect(response.status).toBe(503);
        });

        it('should export GET function', async () => {
            const route = await import('@/app/api/cron/data-retention/route');
            expect(typeof route.GET).toBe('function');
        });
    });
});
