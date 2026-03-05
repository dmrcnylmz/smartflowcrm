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

describe('/api/dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('should return proper summary shape with required fields', async () => {
            const { GET } = await import('@/app/api/dashboard/route');
            const request = createMockRequest('/api/dashboard', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            const data = await response.json();

            // The route returns a fallback structure on error
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

        it('should return 403 when tenant header is missing', async () => {
            const { GET } = await import('@/app/api/dashboard/route');
            const request = createMockRequest('/api/dashboard');

            const response = await GET(request);
            // Without tenant, the route returns 403 before hitting Firestore
            expect(response.status).toBe(403);
        });
    });
});
