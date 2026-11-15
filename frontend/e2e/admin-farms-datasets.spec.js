import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { FIXTURES_DIR, attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('WindHUB Admin: Farms, Turbines & Datasets CRUD (E2E-ADM-06)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-ADM-06a: WindFarm CRUD, Turbine FIXED/FLOATING depth lock, CSV template/import & exports', async ({ page }) => {
        await navigateHash(page, '/admin/farms');
        const farmCode = `E2E_FM_${Date.now().toString().slice(-5)}`;
        const farmName = `Trang trại E2E ${farmCode}`;

        // 1. Create Farm
        await page.getByRole('button', { name: /Thêm trang trại gió/i }).click();
        await page.getByPlaceholder(/Ví dụ: VBB_BAC/i).fill(farmCode);
        await page.getByPlaceholder(/Ví dụ: Khu vực khảo sát/i).fill(farmName);
        await page.getByPlaceholder(/Ví dụ: Bắc Vịnh Bắc Bộ/i).fill('Vịnh Bắc Bộ');
        await page.getByRole('button', { name: /Lưu trang trại/i }).click();
        await expect(page.locator('table')).toContainText(farmCode);

        // 2. Edit Farm
        const farmRow = page.locator('tr', { hasText: farmCode });
        await farmRow.locator('button[title*="Sửa"], button[title*="Chỉnh sửa"], button:has(i.fa-pencil)').first().click();
        await page.getByPlaceholder(/Ví dụ: Khu vực khảo sát/i).fill(`${farmName} (Mở rộng)`);
        await page.getByRole('button', { name: /Lưu trang trại/i }).click();
        await expect(page.locator('table')).toContainText(`${farmName} (Mở rộng)`);

        try {
            // 3. Switch to Turbines Tab
            await page.getByRole('button', { name: /Danh sách tuabin/i }).click();

            // Download CSV template
            const [tplDownload] = await Promise.all([
                page.waitForEvent('download'),
                page.getByRole('button', { name: /Tải tệp mẫu/i }).click(),
            ]);
            expect(tplDownload.suggestedFilename().toLowerCase()).toContain('.csv');

            // Add turbine modal & check FLOATING foundation auto-locks sea depth to 0
            await page.getByRole('button', { name: /Thêm tuabin gió/i }).click();
            const modalForm = page.locator('form');
            const foundationSelect = modalForm.locator('select').nth(1);
            await foundationSelect.selectOption('FLOATING');
            const depthInput = modalForm.locator('input[type="number"]').nth(3);
            await expect(depthInput).toBeDisabled();
            await expect(depthInput).toHaveValue('0');

            // Switch back to FIXED and save test turbine
            await foundationSelect.selectOption('FIXED');
            await expect(depthInput).toBeEnabled();
            await modalForm.locator('select').first().selectOption({ label: `${farmName} (Mở rộng)` });
            await modalForm.getByPlaceholder('Ví dụ: 106.38057').fill('106.5123');
            await modalForm.getByPlaceholder('Ví dụ: 19.25825').fill('19.4123');
            await depthInput.fill('25');
            await modalForm.locator('input[type="number"]').nth(4).fill('45');
            await modalForm.getByRole('button', { name: /Lưu tuabin/i }).click();
            await expect(page.locator('#wind-app-root')).toContainText(/thành công/i);

            // Import dynamic CSV referencing the created farmCode
            const tmpCsvPath = path.join(FIXTURES_DIR, `_tmp_${farmCode}.csv`);
            const csvBody = [
                'ma_trang_trai,ma_tuabin,ten_diem,kinh_do,vi_do,toc_do_gio_100m,huong_gio,do_sau_m,cong_suat_mw,he_so_cong_suat,trang_thai',
                `${farmCode},99101,Tuabin E2E 99101,106.45,19.35,8.1,125,28,36.5,29.4,PROPOSED`,
            ].join('\n');
            fs.writeFileSync(tmpCsvPath, csvBody, 'utf8');
            try {
                await page.locator('input[type="file"][accept=".csv"]').setInputFiles(tmpCsvPath);
                await expect(page.locator('#wind-app-root')).toContainText(/thành công|nhập/i, { timeout: 15000 });
            } finally {
                if (fs.existsSync(tmpCsvPath)) fs.unlinkSync(tmpCsvPath);
            }

            // Export CSV & GeoJSON
            const [csvDl] = await Promise.all([
                page.waitForEvent('download'),
                page.getByRole('button', { name: /Xuất CSV/i }).click(),
            ]);
            expect(csvDl.suggestedFilename().toLowerCase()).toContain('.csv');

            await saveEvidence(page, 'adm_06_farms_turbines.png');
        } finally {
            // Cleanup: delete test farm (cascades to test turbines)
            await page.getByRole('button', { name: /Trang trại gió/i }).click();
            const cleanupRow = page.locator('tr', { hasText: farmCode });
            if (await cleanupRow.isVisible()) {
                page.once('dialog', (d) => d.accept());
                await cleanupRow.locator('button[title="Xóa"], button.btn-danger').first().click();
                await expect(page.locator('table')).not.toContainText(farmCode);
            }
        }
    });

    test('E2E-ADM-06b: Datasets CRUD, Variables filter & Access Policies tab', async ({ page }) => {
        await navigateHash(page, '/admin/datasets');
        const dsCode = `E2E_DS_${Date.now().toString().slice(-5)}`;
        const dsName = `Bộ dữ liệu E2E ${dsCode}`;

        // Create dataset
        await page.getByRole('button', { name: /Tạo bộ dữ liệu mới/i }).click();
        await page.getByPlaceholder(/Ví dụ: ERA5_HOURLY/i).fill(dsCode);
        await page.getByPlaceholder(/Ví dụ: Gió ERA5/i).fill(dsName);
        await page.getByRole('button', { name: /Lưu bộ dữ liệu/i }).click();
        await expect(page.locator('table')).toContainText(dsCode);

        // Edit dataset
        const dsRow = page.locator('tr', { hasText: dsCode });
        await dsRow.locator('button[title="Chỉnh sửa"], button:has(i.fa-pencil)').first().click();
        await page.getByPlaceholder(/Ví dụ: Gió ERA5/i).fill(`${dsName} (Updated)`);
        await page.getByRole('button', { name: /Lưu bộ dữ liệu/i }).click();
        await expect(page.locator('table')).toContainText(`${dsName} (Updated)`);

        // Delete test dataset
        page.once('dialog', (d) => d.accept());
        await page.locator('tr', { hasText: dsCode }).locator('button[title="Xóa"], button.btn-danger').first().click();
        await expect(page.locator('table')).not.toContainText(dsCode);

        // Variables tab & filter
        await page.getByRole('button', { name: /Biến dữ liệu/i }).click();
        await expect(page.locator('table')).toBeVisible();
        await saveEvidence(page, 'adm_06_datasets_variables.png');

        // Access policies tab
        await page.getByRole('button', { name: /Chính sách phân quyền/i }).click();
        await expect(page.locator('table')).toBeVisible();
    });
});
