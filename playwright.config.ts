import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Usage:
 *   npm run test:e2e          — Run all E2E tests
 *   npm run test:e2e:headed   — Run with visible browser
 *
 * Setup:
 *   npx playwright install    — Install browser binaries
 */

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',

    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3002',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /* Start dev server before tests if not in CI */
    webServer: process.env.CI
        ? undefined
        : {
            command: 'npm run dev',
            url: 'http://localhost:3002',
            reuseExistingServer: true,
            timeout: 30_000,
        },
});
