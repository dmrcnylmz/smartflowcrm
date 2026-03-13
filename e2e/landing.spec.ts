import { test, expect } from '@playwright/test';

/**
 * Landing Page E2E Tests
 *
 * Verifies that the public landing page loads correctly,
 * navigation works, and key CTA elements are present.
 */

test.describe('Landing Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/landing');
    });

    test('loads successfully with correct title', async ({ page }) => {
        await expect(page).toHaveTitle(/Callception/);
    });

    test('displays hero section with CTA buttons', async ({ page }) => {
        // Hero section should be visible
        await expect(page.locator('text=Callception')).toBeVisible();

        // CTA buttons
        await expect(page.locator('text=Hemen Başlat').first()).toBeVisible();
    });

    test('navigation links are present', async ({ page }) => {
        await expect(page.locator('a[href="#features"]').first()).toBeVisible();
        await expect(page.locator('a[href="#pricing"]').first()).toBeVisible();
    });

    test('features section exists', async ({ page }) => {
        const features = page.locator('#features');
        await expect(features).toBeAttached();
    });

    test('pricing section exists', async ({ page }) => {
        const pricing = page.locator('#pricing');
        await expect(pricing).toBeAttached();
    });

    test('FAQ section with accordion works', async ({ page }) => {
        const faq = page.locator('#faq');
        await expect(faq).toBeAttached();
    });

    test('footer links are correct', async ({ page }) => {
        await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
        await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
        await expect(page.locator('a[href="/changelog"]').first()).toBeVisible();
    });

    test('lead capture form is present in CTA section', async ({ page }) => {
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible();
        await expect(page.locator('text=Demo Talep Et')).toBeVisible();
    });

    test('login link navigates to login page', async ({ page }) => {
        await page.locator('a[href="/login"]').first().click();
        await expect(page).toHaveURL(/\/login/);
    });
});
