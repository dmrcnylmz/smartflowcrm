import { test, expect } from '@playwright/test';

/**
 * Dashboard & Authenticated Pages — Structural E2E Tests
 *
 * Since we cannot authenticate against real Firebase in E2E,
 * these tests verify that pages exist and do not crash (500).
 * They may redirect to login, which is acceptable.
 */

test.describe('Dashboard Page', () => {
    test('dashboard page exists and returns 200 or redirect', async ({ page }) => {
        const response = await page.goto('/');
        // Should either render dashboard or redirect to login
        expect(response?.status()).toBeLessThan(500);
    });
});

test.describe('Calls Page', () => {
    test('calls page exists', async ({ page }) => {
        const response = await page.goto('/calls');
        expect(response?.status()).toBeLessThan(500);
    });
});

// Test all main pages don't crash (500)
const pages = [
    '/',
    '/calls',
    '/customers',
    '/appointments',
    '/complaints',
    '/tickets',
    '/knowledge',
    '/reports',
    '/billing',
    '/agents',
    '/campaigns',
];

for (const path of pages) {
    test(`${path} does not return 500`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).not.toBe(500);
    });
}
