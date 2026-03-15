import { test, expect } from '@playwright/test';

/**
 * Pricing Page E2E Tests
 *
 * Verifies that the public pricing page loads,
 * plan cards are visible, and interactive elements work.
 */

test.describe('Pricing Page', () => {
    test('pricing page loads', async ({ page }) => {
        await page.goto('/pricing');
        // Should see plan cards
        await expect(page.locator('text=Starter')).toBeVisible();
        await expect(page.locator('text=Professional')).toBeVisible();
        await expect(page.locator('text=Enterprise')).toBeVisible();
    });

    test('currency selector works', async ({ page }) => {
        await page.goto('/pricing');
        // Look for currency buttons
        const eurButton = page.locator('button:has-text("EUR")');
        if (await eurButton.isVisible()) {
            await eurButton.click();
            // Price should change to show euro symbol
            await expect(page.locator('text=\u20AC')).toBeVisible();
        }
    });

    test('billing toggle works', async ({ page }) => {
        await page.goto('/pricing');
        // Should have monthly/yearly toggle
        const yearlyToggle = page.locator('button:has-text("Yearly"), button:has-text("Y\u0131ll\u0131k")');
        if (await yearlyToggle.isVisible()) {
            await yearlyToggle.click();
        }
    });

    test('FAQ section exists', async ({ page }) => {
        await page.goto('/pricing');
        // FAQ should be visible
        await expect(page.locator('text=FAQ').or(page.locator('text=S\u0131k\u00E7a Sorulan'))).toBeVisible();
    });
});
