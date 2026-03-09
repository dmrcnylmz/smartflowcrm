/**
 * API Route Tests — /api/dashboard
 *
 * Tests GET handler returns proper summary shape.
 * The dashboard route uses firebase-admin directly. When Firestore
 * throws (as it does in test env without credentials), the route
 * returns a fallback empty structure. We test that fallback shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// Mock firebase-admin modules (route calls initAdmin + getFirestore)
vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => {
        // Simulate Firestore throwing so the route returns its catch-block fallback
        throw new Error('Firestore unavailable in test');
    }),
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
}));

// Mock requireStrictAuth — simulate authenticated user
const mockRequireStrictAuth = vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    tenantId: 'tenant-123',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// Mock analytics (imported by dashboard route)
vi.mock('@/lib/billing/analytics', () => ({
    getPipelineSummary: vi.fn().mockResolvedValue({ totalCalls: 0, totalMinutes: 0 }),
    getLatencyStats: vi.fn().mockResolvedValue({ avg: 0, p50: 0, p95: 0 }),
}));

describe('/api/dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    describe('GET', () => {
        it('should return proper summary shape with required fields', async () => {
            const { GET } = await import('@/app/api/dashboard/route');
            const request = createMockRequest('/api/dashboard', {
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
            });

            const response = await GET(request);
            const data = await response.json();

            // The route returns a fallback structure on error (Firestore throws)
            expect(data).toHaveProperty('kpis');
            expect(data).toHaveProperty('callTrend');
            expect(data).toHaveProperty('complaintCategories');
            expect(data).toHaveProperty('usage');
            expect(data).toHaveProperty('activity');
            expect(data).toHaveProperty('generatedAt');

            // KPI shape
            expect(data.kpis).toHaveProperty('todayCalls');
            expect(data.kpis).toHaveProperty('answeredCalls');
            expect(data.kpis).toHaveProperty('missedCalls');
            expect(data.kpis).toHaveProperty('answerRate');
            expect(data.kpis).toHaveProperty('openComplaints');
            expect(data.kpis).toHaveProperty('upcomingAppointments');

            // Usage shape
            expect(data.usage).toHaveProperty('totalCalls');
            expect(data.usage).toHaveProperty('totalMinutes');
            expect(data.usage).toHaveProperty('kbDocuments');
        });

        it('should return 401 when auth is missing', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/dashboard/route');
            const request = createMockRequest('/api/dashboard');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });
});
