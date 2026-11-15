import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('Public Portal: Station Detail & Plotly Charts (E2E-PUB-03)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-PUB-03: Station info card, view modes (yearly/monthly/detail), variables & Plotly chart', async ({ page }) => {
        // Resolve an existing station ID from the API first
        await navigateHash(page, '/stations');
        const listRes = await page.request.get('/wind/api/v1/stations/');
        expect(listRes.ok()).toBeTruthy();
        const listJson = await listRes.json();
        const stations = listJson.results || listJson;
        expect(stations.length).toBeGreaterThan(0);

        const stationId = stations[0].id;
        await navigateHash(page, `/stations/${stationId}/detail`);

        await expect(page.getByRole('button', { name: /Quay lại danh sách trạm/i })).toBeVisible();
        await expect(page.locator('#wind-app-root')).toContainText(stations[0].name);

        // Switch through view modes
        for (const modeLabel of ['Theo năm', 'Theo tháng', 'Chi tiết']) {
            const btn = page.getByRole('button', { name: modeLabel, exact: false }).first();
            if (await btn.isVisible()) {
                await btn.click();
                await page.waitForTimeout(500);
            }
        }

        // Switch variable dropdown
        const variableSelect = page.locator('select').first();
        if (await variableSelect.isVisible()) {
            const options = await variableSelect.locator('option').allTextContents();
            expect(options.length).toBeGreaterThan(1);
            await variableSelect.selectOption({ index: 1 });
            await page.waitForTimeout(400);
            await variableSelect.selectOption({ index: 0 });
        }

        // Verify Plotly chart container or table rendered
        await expect(page.locator('.js-plotly-plot, table').first()).toBeVisible({ timeout: 15000 });
        await saveEvidence(page, 'pub_03_station_detail.png');
    });
});
