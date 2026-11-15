import path from 'node:path';
import { test, expect } from '@playwright/test';
import { FIXTURES_DIR, attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('WindHUB Admin: Raster NetCDF Upload & Granule Catalog (E2E-ADM-04)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-ADM-04: Upload valid NetCDF (.nc) into isolated test dataset, verify granules & cleanup', async ({ page }) => {
        const tmpCode = `E2E_RASTER_${Date.now()}`;
        const tmpName = `E2E Raster Tmp ${Date.now()}`;

        // Create isolated test dataset via UI and capture its ID for deterministic cleanup
        await navigateHash(page, '/admin/datasets');
        await page.getByRole('button', { name: /Tạo bộ dữ liệu mới/i }).click();
        await page.getByPlaceholder(/Ví dụ: ERA5_HOURLY/i).fill(tmpCode);
        await page.getByPlaceholder(/Ví dụ: Gió ERA5/i).fill(tmpName);
        const createPromise = page.waitForResponse(
            (res) => res.url().includes('/wind/api/v1/datasets/') && res.request().method() === 'POST'
        );
        await page.getByRole('button', { name: /Lưu bộ dữ liệu/i }).click();
        const createRes = await createPromise;
        const createdDataset = await createRes.json();
        await expect(page.locator('table')).toContainText(tmpCode);

        try {
            // Navigate to #/admin/rasters and upload sample_wind.nc into the isolated dataset
            await navigateHash(page, '/admin/rasters');
            const datasetSelect = page.locator('select').first();
            await expect(datasetSelect).toContainText(tmpName);
            const targetOption = await datasetSelect.locator('option', { hasText: tmpName }).getAttribute('value');
            await datasetSelect.selectOption(targetOption);

            const ncPath = path.join(FIXTURES_DIR, 'sample_wind.nc');
            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles(ncPath);

            const uploadPromise = page.waitForResponse(
                (res) => res.url().includes('/wind/api/v1/raster-granules/upload/') && res.request().method() === 'POST'
            );
            await page.getByRole('button', { name: /Bắt đầu nạp dữ liệu/i }).click();
            const uploadRes = await uploadPromise;
            expect(uploadRes.status()).toBe(200);

            await expect(page.locator('#wind-app-root')).toContainText(/thành công|bản ghi/i);
            await saveEvidence(page, 'adm_04_rasters_uploaded.png');
        } finally {
            // Cleanup: delete temporary dataset via UI, with API fallback if needed
            let deleted = false;
            await navigateHash(page, '/admin/datasets');
            const dsRow = page.locator('tr', { hasText: tmpCode });
            if (await dsRow.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
                page.once('dialog', (dialog) => dialog.accept());
                await dsRow.locator('button[title="Xóa"], button.btn-danger').first().click();
                await expect(page.locator('table')).not.toContainText(tmpCode);
                deleted = true;
            }
            if (!deleted && createdDataset?.id) {
                const cookies = await page.context().cookies();
                const csrf = cookies.find((c) => c.name === 'csrftoken')?.value || '';
                await page.request.delete(`/wind/api/v1/datasets/${createdDataset.id}/`, {
                    headers: csrf ? { 'X-CSRFToken': csrf } : {},
                }).catch(() => {});
            }
        }
    });
});
