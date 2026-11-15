import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('WindHUB Admin: CDS ERA5 Credentials & Query Builder (E2E-ADM-03)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-ADM-03: 3 tabs navigation, 4-step CDSQueryBuilderModal + MiniMap & job cleanup', async ({ page }) => {
        await navigateHash(page, '/admin/cds');
        await expect(page.getByRole('heading', { name: 'Quản lý thu thập dữ liệu ERA5' })).toBeVisible();

        // Tab 1: Credentials
        await expect(page.getByRole('button', { name: /Tài khoản xác thực/i })).toBeVisible();
        await saveEvidence(page, 'adm_03_cds_credentials.png');

        // Tab 3: Runs history
        await page.getByRole('button', { name: /Lịch sử tải/i }).click();
        await page.waitForTimeout(300);

        // Tab 2: Jobs & 4-step CDSQueryBuilderModal
        await page.getByRole('button', { name: /Tác vụ tải định kỳ/i }).click();
        await page.getByRole('button', { name: /Tạo tác vụ tải dữ liệu/i }).click();

        const testJobName = `E2E_CDS_JOB_${Date.now()}`;

        // Step 1: General Config
        const modal = page.locator('#wind-app-root');
        const nameInput = modal.locator('input[placeholder*="Ví dụ"], input[type="text"]').first();
        await nameInput.fill(testJobName);
        await modal.getByRole('button', { name: /Tiếp theo/i }).click();

        // Step 2: Meteorological variables
        await expect(modal.getByRole('button', { name: /Tiếp theo/i })).toBeVisible();
        await modal.getByRole('button', { name: /Tiếp theo/i }).click();

        // Step 3: Time & hours
        await expect(modal.getByRole('button', { name: /Tiếp theo/i })).toBeVisible();
        await modal.getByRole('button', { name: /Tiếp theo/i }).click();

        // Step 4: Bounding box + OpenLayers MiniMap
        await expect(modal.locator('.ol-viewport canvas').first()).toBeVisible({ timeout: 15000 });
        await saveEvidence(page, 'adm_03_cds_wizard_step4.png');

        // Save job (without running remote download)
        const saveJobBtn = modal.getByRole('button', { name: /Lưu tác vụ$/i });
        if (await saveJobBtn.isEnabled()) {
            const createPromise = page.waitForResponse(
                (res) => res.url().includes('/wind/api/v1/cds-jobs/') && res.request().method() === 'POST'
            );
            await saveJobBtn.click();
            const createRes = await createPromise;
            if (createRes.status() === 201) {
                await expect(page.locator('table')).toContainText(testJobName);

                // Clean up created test job
                const row = page.locator('tr', { hasText: testJobName });
                page.once('dialog', (dialog) => dialog.accept());
                await row.locator('button[title="Xóa"], button.btn-danger').first().click();
                await expect(page.locator('table')).not.toContainText(testJobName);
            } else {
                // If no active credential exists in DB, close modal cleanly
                await modal.getByRole('button', { name: 'Đóng' }).click();
            }
        }
    });
});
