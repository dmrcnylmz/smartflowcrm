import { test, expect } from '@playwright/test';

/**
 * API Health Check E2E Tests
 *
 * Verifies that critical API endpoints are reachable
 * and do not return server errors.
 */

test.describe('API Health Checks', () => {
    test('health endpoint returns ok', async ({ request }) => {
        const response = await request.get('/api/health');
        expect(response.status()).toBe(200);
    });

    test('system go-live check returns status', async ({ request }) => {
        const response = await request.get('/api/system/go-live-check');
        expect(response.status()).toBeLessThan(500);
    });
});
