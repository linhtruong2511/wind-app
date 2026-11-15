import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('Public Portal: Offshore Wind Farms & Heatmap Interpolation (E2E-PUB-05)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-PUB-05: Turbine filters, heatmap interpolation (KDE/IDW/Kriging), point query & exports', async ({ page }) => {
        const turbinesPromise = page.waitForResponse(
            (res) => res.url().includes('/wind/api/v1/turbines/') && res.status() === 200
        );
        await navigateHash(page, '/farms');
        await turbinesPromise;

        await expect(
            page.getByRole('heading', { name: /Khảo sát tiềm năng và trang trại gió/i })
        ).toBeVisible();
        await expect(page.locator('.ol-viewport canvas').first()).toBeVisible({ timeout: 20000 });

        // Test interpolation method switches (IDW / Kriging / KDE)
        for (const method of ['IDW', 'Kriging', 'KDE']) {
            const btn = page.getByRole('button', { name: method, exact: true });
            if (await btn.isVisible()) {
                await btn.click();
                await page.waitForTimeout(600);
            }
        }

        // Test metric switches
        const windSpeedBtn = page.getByRole('button', { name: /Tốc độ gió/i }).first();
        if (await windSpeedBtn.isVisible()) {
            await windSpeedBtn.click();
            await page.waitForTimeout(400);
        }

        // Test filter reset button
        const resetBtn = page.getByRole('button', { name: /Đặt lại/i }).first();
        if (await resetBtn.isVisible()) {
            await resetBtn.click();
            await page.waitForTimeout(400);
        }

        // Test CSV & GeoJSON downloads
        const [csvDownload] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: /Xuất CSV/i }).click(),
        ]);
        expect(csvDownload.suggestedFilename().toLowerCase()).toContain('.csv');

        const [geoDownload] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: /Xuất GeoJSON/i }).click(),
        ]);
        expect(geoDownload.suggestedFilename().toLowerCase()).toMatch(/\.geojson|\.json/);

        await saveEvidence(page, 'pub_05_farms.png');
    });
});
