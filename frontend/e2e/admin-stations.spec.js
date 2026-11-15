import path from 'node:path';
import { test, expect } from '@playwright/test';
import { FIXTURES_DIR, attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('WindHUB Admin: Stations, Data Lake, CSV Import & SQL Analytics (E2E-ADM-05)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-ADM-05: Station CRUD, CSV dry-run/import, Data Lake partition & DuckDB SQL/Wind Rose', async ({ page }) => {
        await navigateHash(page, '/admin/stations');

        // 1. TAB 1: Create -> Edit -> Delete test station
        const stCode = `E2E_STN_${Date.now().toString().slice(-5)}`;
        await page.getByRole('button', { name: /Thêm trạm quan trắc/i }).click();
        await page.getByPlaceholder(/Ví dụ: PHU_QUY/i).fill(stCode);
        await page.getByPlaceholder(/Ví dụ: Trạm khí tượng Phú Quý/i).fill('Trạm kiểm thử E2E');
        await page.getByPlaceholder(/Ví dụ: 108.932/i).fill('106.5');
        await page.getByPlaceholder(/Ví dụ: 10.518/i).fill('10.8');
        await page.getByRole('button', { name: 'Lưu trạm' }).click();
        await expect(page.locator('#wind-app-root')).toContainText(/Lưu thông tin trạm thành công/i);

        // Filter paginated station list (175+ stations) to locate created station
        const searchInput = page.getByPlaceholder(/Tìm mã hoặc tên trạm/i);
        await searchInput.fill(stCode);
        await searchInput.press('Enter');
        await expect(page.locator('table')).toContainText(stCode);

        // Edit created station
        const stRow = page.locator('tr', { hasText: stCode });
        await stRow.locator('button[title*="Sửa"], button[title*="Chỉnh sửa"], button:has(i.fa-pencil)').first().click();
        await page.getByPlaceholder(/Ví dụ: Trạm khí tượng Phú Quý/i).fill('Trạm kiểm thử E2E (Đã sửa)');
        await page.getByRole('button', { name: 'Lưu trạm' }).click();
        await expect(page.locator('table')).toContainText('Trạm kiểm thử E2E (Đã sửa)');
        await saveEvidence(page, 'adm_05_stations_crud.png');

        // Delete created station
        page.once('dialog', (d) => d.accept());
        await page.locator('tr', { hasText: stCode }).locator('button[title="Xóa"], button.btn-danger').first().click();
        await expect(page.locator('table')).not.toContainText(stCode);

        // Reset search filter so full station list reloads for export dropdown
        await searchInput.fill('');
        await searchInput.press('Enter');
        await expect(page.locator('table')).toContainText('4801');

        // 2. TAB 3: Nạp số liệu (Template download + Dry-run preview + Real import)
        await page.getByRole('button', { name: /Nạp số liệu/i }).click();
        const [templateDownload] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: /Tải tệp mẫu/i }).click(),
        ]);
        expect(templateDownload.suggestedFilename().toLowerCase()).toContain('.csv');

        const csvPath = path.join(FIXTURES_DIR, 'sample_station_obs.csv');
        await page.locator('#obs-file-input').setInputFiles(csvPath);

        // Dry-run check
        await page.getByRole('button', { name: /Kiểm tra cấu trúc/i }).click();
        await expect(page.locator('#wind-app-root')).toContainText(/Tệp hợp lệ! Tìm thấy 4 dòng dữ liệu/i);
        await expect(page.locator('#wind-app-root')).toContainText('E2E_LAKE_STN');

        // Real import into Parquet Data Lake
        await page.getByRole('button', { name: /Nạp dữ liệu/i }).click();
        await expect(page.locator('#wind-app-root')).toContainText(/thành công|E2E_LAKE_STN/i, { timeout: 15000 });

        let partitionDeleted = false;
        try {
            // 3. TAB 2: Kho dữ liệu (KPIs, Export modal, Delete test partition E2E_LAKE_STN)
            await page.getByRole('button', { name: /Kho dữ liệu/i }).click();
            await expect(page.locator('#wind-app-root')).toContainText(/Tổng số bản ghi tích lũy/i);
            await expect(page.locator('table')).toContainText('E2E_LAKE_STN');
            await saveEvidence(page, 'adm_05_datalake.png');

            // Open export modal, filter to station 48_10 (avoids cross-station schema mismatch bug on unfiltered export) and verify download
            await page.getByRole('button', { name: /Xuất dữ liệu tùy biến/i }).click();
            const stationSelect = page.locator('select').filter({ hasText: /-- Tất cả các trạm --/i });
            await stationSelect.selectOption('48_10');
            const [lakeExport] = await Promise.all([
                page.waitForEvent('download'),
                page.getByRole('link', { name: /Bắt đầu tải về/i }).click(),
            ]);
            expect(lakeExport.suggestedFilename().toLowerCase()).toMatch(/\.csv|\.parquet/);

            // Clean up imported E2E_LAKE_STN partition via UI
            const lakeRow = page.locator('tr', { hasText: 'E2E_LAKE_STN' });
            page.once('dialog', (d) => d.accept());
            await lakeRow.locator('button[title="Xóa"], button.btn-danger').first().click();
            await expect(page.locator('table')).not.toContainText('E2E_LAKE_STN');
            partitionDeleted = true;
        } finally {
            if (!partitionDeleted) {
                const cookies = await page.context().cookies();
                const csrf = cookies.find((c) => c.name === 'csrftoken')?.value || '';
                await page.request.delete('/wind/api/v1/datalake/delete-partition/?station_code=E2E_LAKE_STN&year=2025', {
                    headers: csrf ? { 'X-CSRFToken': csrf } : {},
                }).catch(() => {});
            }
        }

        // 4. TAB 4: Phân tích và truy vấn (Wind Rose & aggregate SQL templates)
        await page.getByRole('button', { name: /Phân tích và truy vấn/i }).click();
        await page.getByRole('button', { name: /Phân tích hoa gió/i }).click();
        await expect(page.locator('#wind-app-root')).toContainText(/Tần suất hoa gió theo 16 hướng|Tốc độ gió trung bình/i, { timeout: 15000 });

        await page.locator('input[name="analytics_mode"]').nth(1).check();
        for (const tpl of [
            'Thống kê theo trạm',
            'Biến thiên theo giờ trong ngày',
            'Diễn biến theo tháng',
        ]) {
            await page.getByRole('button', { name: tpl }).click();
            await page.getByRole('button', { name: /Chạy truy vấn/i }).click();
            await expect(page.locator('#wind-app-root')).toContainText(/Thành công! Trả về/i, { timeout: 15000 });
        }
        await saveEvidence(page, 'adm_05_analytics_sql.png');
    });

    test('E2E-ADM-05b: Unfiltered Data Lake download, missing-station 404 & top-wind SQL template work cleanly', async ({ page }) => {
        const exportRes = await page.request.get('/wind/api/v1/datalake/download/?file_format=csv');
        expect(exportRes.status(), 'Expected unfiltered Data Lake export to return 200').toBe(200);
        const csvBody = await exportRes.text();
        expect(csvBody).toContain('station_code');

        const missingRes = await page.request.get('/wind/api/v1/datalake/download/?station_code=NONEXISTENT_STN&file_format=csv');
        expect(missingRes.status(), 'Expected station without Parquet files to return 404').toBe(404);

        await navigateHash(page, '/admin/stations');
        await page.getByRole('button', { name: /Phân tích và truy vấn/i }).click();
        await page.locator('input[name="analytics_mode"]').nth(1).check();
        await page.getByRole('button', { name: 'Mười mốc gió mạnh nhất' }).click();
        await page.getByRole('button', { name: /Chạy truy vấn/i }).click();
        await expect(page.locator('#wind-app-root')).toContainText(/Thành công! Trả về/i, { timeout: 15000 });
    });
});
