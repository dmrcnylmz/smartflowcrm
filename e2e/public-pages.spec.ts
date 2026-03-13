import { test, expect } from '@playwright/test';

/**
 * Public Pages E2E Tests
 *
 * Verifies that all public-facing pages load correctly,
 * including privacy, terms, changelog, and SEO elements.
 */

test.describe('Public Pages', () => {
    test.describe('Privacy Page', () => {
        test('loads and displays content', async ({ page }) => {
            await page.goto('/privacy');
            await expect(page.locator('text=Gizlilik')).toBeVisible();
        });

        test('accordion sections expand on click', async ({ page }) => {
            await page.goto('/privacy');
            // Click first section header
            const firstSection = page.locator('button').filter({ hasText: 'Veri Sorumlusu' });
            if (await firstSection.isVisible()) {
                await firstSection.click();
                // Content should be visible after expanding
                await expect(page.locator('text=kişisel veri').first()).toBeVisible();
            }
        });

        test('has back link to landing', async ({ page }) => {
            await page.goto('/privacy');
            await expect(page.locator('a[href="/landing"]')).toBeVisible();
        });
    });

    test.describe('Terms Page', () => {
        test('loads and displays content', async ({ page }) => {
            await page.goto('/terms');
            await expect(page.locator('text=Kullanım').first()).toBeVisible();
        });

        test('has accordion sections', async ({ page }) => {
            await page.goto('/terms');
            const sections = page.locator('button').filter({ hasText: /\d+\./ });
            expect(await sections.count()).toBeGreaterThanOrEqual(5);
        });
    });

    test.describe('Changelog Page', () => {
        test('loads and displays entries', async ({ page }) => {
            await page.goto('/changelog');
            await expect(page.locator('text=Değişiklik Günlüğü')).toBeVisible();
        });

        test('shows version numbers', async ({ page }) => {
            await page.goto('/changelog');
            await expect(page.locator('text=v1.0.0')).toBeVisible();
        });

        test('has back link to landing', async ({ page }) => {
            await page.goto('/changelog');
            await expect(page.locator('a[href="/landing"]')).toBeVisible();
        });
    });

    test.describe('SEO & Meta', () => {
        test('sitemap.xml is accessible', async ({ page }) => {
            const response = await page.goto('/sitemap.xml');
            expect(response?.status()).toBe(200);
        });

        test('manifest.webmanifest is accessible', async ({ page }) => {
            const response = await page.goto('/manifest.webmanifest');
            expect(response?.status()).toBe(200);
        });

        test('robots.txt is accessible', async ({ page }) => {
            const response = await page.goto('/robots.txt');
            expect(response?.status()).toBe(200);
        });

        test('icon is accessible', async ({ page }) => {
            const response = await page.goto('/icon');
            expect(response?.status()).toBe(200);
        });

        test('apple-icon is accessible', async ({ page }) => {
            const response = await page.goto('/apple-icon');
            expect(response?.status()).toBe(200);
        });
    });

    test.describe('Cookie Consent', () => {
        test('shows cookie banner on first visit', async ({ page }) => {
            // Clear localStorage
            await page.goto('/landing');
            await page.evaluate(() => localStorage.clear());
            await page.reload();

            // Banner should appear after ~1.5s delay
            const banner = page.locator('text=Çerez Kullanımı');
            await expect(banner).toBeVisible({ timeout: 5000 });
        });

        test('banner has accept and essential-only buttons', async ({ page }) => {
            await page.goto('/landing');
            await page.evaluate(() => localStorage.clear());
            await page.reload();

            await expect(page.locator('text=Tümünü Kabul Et')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('text=Sadece Zorunlu')).toBeVisible();
        });

        test('accepting cookies hides banner', async ({ page }) => {
            await page.goto('/landing');
            await page.evaluate(() => localStorage.clear());
            await page.reload();

            // Wait for banner
            const acceptBtn = page.locator('text=Tümünü Kabul Et');
            await expect(acceptBtn).toBeVisible({ timeout: 5000 });
            await acceptBtn.click();

            // Banner should disappear
            await expect(page.locator('text=Çerez Kullanımı')).not.toBeVisible();

            // Consent should be saved
            const consent = await page.evaluate(() => localStorage.getItem('cookie_consent'));
            expect(consent).toBe('all');
        });
    });
});
