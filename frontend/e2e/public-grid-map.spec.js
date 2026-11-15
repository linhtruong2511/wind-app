import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('Public Portal: Wind Grid Map & Time Animation (E2E-PUB-04)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-PUB-04: Grid map sidebar, layers, time player & point popup chart', async ({ page }) => {
        await navigateHash(page, '/grid');

        // Wait for OpenLayers viewport canvas
        const mapCanvas = page.locator('.ol-viewport canvas').first();
        await expect(mapCanvas).toBeVisible({ timeout: 20000 });

        // Check TimePlayer controls rendered
        const speedBtn = page.getByTitle('Thay đổi tốc độ phát');
        await expect(speedBtn).toBeVisible();
        const initialSpeed = (await speedBtn.innerText()).trim();
        await speedBtn.click();
        await expect(speedBtn).not.toHaveText(initialSpeed);

        // Step forward/backward if enabled
        const nextBtn = page.getByTitle(/Bước thời gian sau/i);
        if (await nextBtn.isEnabled()) {
            await nextBtn.click();
            await page.waitForTimeout(400);
        }

        // Toggle wind particles / heatmap / stations checkboxes in sidebar
        const checkboxes = page.locator('#wind-app-root input[type="checkbox"]');
        const cbCount = await checkboxes.count();
        if (cbCount > 0) {
            await checkboxes.first().click();
            await page.waitForTimeout(300);
            await checkboxes.first().click();
        }

        // Click near center of the OpenLayers map to trigger point_metadata popup
        const box = await mapCanvas.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
            await page.waitForTimeout(1000);
        }

        await saveEvidence(page, 'pub_04_grid_map.png');
    });
});
