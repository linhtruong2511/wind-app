import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('WindHUB Admin: Dashboard Overview & Logs (E2E-ADM-02)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-ADM-02: KPI cards, quick actions, refresh & recent ingestion logs', async ({ page }) => {
        const statsPromise = page.waitForResponse(
            (res) => res.url().includes('/wind/api/v1/datasets/dashboard-stats/') && res.status() === 200
        );
        await navigateHash(page, '/admin/dashboard');
        await statsPromise;

        await expect(page.getByRole('heading', { name: 'Tổng quan hệ thống' })).toBeVisible();

        for (const kpiTitle of ['Trạm quan trắc', 'Dữ liệu lưới', 'Tác vụ thu thập ERA5', 'Trang trại gió']) {
            await expect(page.locator('#wind-app-root').getByText(kpiTitle, { exact: false }).first()).toBeVisible();
        }

        // Refresh KPI button
        const refreshPromise = page.waitForResponse(
            (res) => res.url().includes('/wind/api/v1/datasets/dashboard-stats/') && res.status() === 200
        );
        await page.getByRole('button', { name: /Làm mới/i }).click();
        await refreshPromise;

        // Recent ingestion logs table section
        await expect(page.locator('#wind-app-root').getByText(/Nhật ký/i).first()).toBeVisible();
        await saveEvidence(page, 'adm_02_dashboard.png');
    });
});
