import { test, expect } from '@playwright/test';

/**
 * Authentication Flow E2E Tests
 *
 * Verifies that the login and signup pages load,
 * form elements are present, and basic validation works.
 *
 * Note: These tests check UI elements and client-side validation.
 * Full auth flow testing requires Firebase emulator setup.
 */

test.describe('Authentication', () => {
    test.describe('Login Page', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/login');
        });

        test('loads successfully', async ({ page }) => {
            await expect(page).toHaveTitle(/Callception/);
        });

        test('displays login form', async ({ page }) => {
            await expect(page.locator('input[type="email"]')).toBeVisible();
            await expect(page.locator('input[type="password"]')).toBeVisible();
        });

        test('has submit button', async ({ page }) => {
            const submitBtn = page.locator('button[type="submit"]');
            await expect(submitBtn).toBeVisible();
        });

        test('has link to registration', async ({ page }) => {
            // Should have a way to switch to registration
            const registerLink = page.locator('text=Kayıt Ol').or(page.locator('text=Hesap Oluştur'));
            await expect(registerLink.first()).toBeVisible();
        });

        test('shows validation on empty submit', async ({ page }) => {
            const submitBtn = page.locator('button[type="submit"]');
            await submitBtn.click();

            // HTML5 validation should prevent submission
            const emailInput = page.locator('input[type="email"]');
            const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
            expect(isInvalid).toBe(true);
        });
    });

    test.describe('Auth Guard', () => {
        test('redirects to login when accessing dashboard without auth', async ({ page }) => {
            await page.goto('/dashboard');
            // Should redirect to login
            await page.waitForURL(/\/(login|landing)/, { timeout: 5000 });
        });

        test('public pages are accessible without auth', async ({ page }) => {
            // Privacy page
            await page.goto('/privacy');
            await expect(page.locator('text=Gizlilik')).toBeVisible();

            // Terms page
            await page.goto('/terms');
            await expect(page.locator('text=Kullanım')).toBeVisible();

            // Changelog page
            await page.goto('/changelog');
            await expect(page.locator('text=Değişiklik Günlüğü')).toBeVisible();
        });
    });
});
