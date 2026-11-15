import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60000,
    expect: {
        timeout: 15000,
    },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost',
        viewport: { width: 1440, height: 900 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        acceptDownloads: true,
    },
    projects: [
        {
            name: 'setup',
            testMatch: /.*\.setup\.js/,
        },
        {
            name: 'public',
            testMatch: /public-.*\.spec\.js/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'admin-guard',
            testMatch: /admin-guard\.spec\.js/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'admin',
            testMatch: /(admin-(?!guard).*|ui-guidelines-audit)\.spec\.js/,
            dependencies: ['setup'],
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/admin.json',
            },
        },
    ],
});
