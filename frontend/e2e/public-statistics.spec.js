import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('Public Portal: Wind Statistics 4 Tabs & Report Export (E2E-PUB-06)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-PUB-06: Shared filters, 4 analytics tabs & CSV report export', async ({ page }) => {
        await navigateHash(page, '/statistics');
        await expect(page.locator('#wind-statistics-tabs')).toBeVisible({ timeout: 15000 });

        // Tab 1: Overview & rankings
        await page.getByRole('tab', { name: /Tổng quan và xếp hạng/i }).click();
        await page.waitForTimeout(500);
        await saveEvidence(page, 'pub_06_statistics_overview.png');

        // Tab 2: Multi-station comparison
        await page.getByRole('tab', { name: /So sánh nhiều trạm/i }).click();
        await page.waitForTimeout(500);

        // Tab 3: Wind Rose
        await page.getByRole('tab', { name: /Hoa gió/i }).click();
        await page.waitForTimeout(500);

        // Tab 4: Report table & CSV download
        await page.getByRole('tab', { name: /Bảng số liệu và báo cáo/i }).click();
        await page.waitForTimeout(500);

        const exportLink = page.locator('a[href*="export"], button:has-text("Xuất"), a:has-text("Xuất")').first();
        if (await exportLink.isVisible()) {
            const [download] = await Promise.all([
                page.waitForEvent('download'),
                exportLink.click(),
            ]);
            expect(download.suggestedFilename().toLowerCase()).toContain('.csv');
        }

        await saveEvidence(page, 'pub_06_statistics_report.png');
    });
});
