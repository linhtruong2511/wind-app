import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, navigateHash, saveEvidence } from './helpers/wind-helpers.js';

test.describe('Public Portal: Dashboard & Stations (E2E-PUB-01, E2E-PUB-02)', () => {
    let monitors;

    test.beforeEach(async ({ page }) => {
        monitors = attachRuntimeMonitors(page);
    });

    test.afterEach(async () => {
        monitors.assertClean();
        monitors.dispose();
    });

    test('E2E-PUB-01: Dashboard cards and route navigation', async ({ page }) => {
        await navigateHash(page, '/dashboard');
        await expect(page.getByRole('heading', { name: /Hệ thống phân tích và quản lý dữ liệu gió/i })).toBeVisible();

        const expectedButtons = [
            { label: 'Đến danh sách trạm', expectedHash: '#/stations' },
            { label: 'Xem trang trại gió', expectedHash: '#/farms' },
            { label: 'Khám phá bản đồ lưới', expectedHash: '#/grid' },
            { label: 'Xem thống kê', expectedHash: '#/statistics' },
        ];

        await saveEvidence(page, 'pub_01_dashboard.png');

        for (const item of expectedButtons) {
            await navigateHash(page, '/dashboard');
            await page.getByRole('button', { name: item.label }).click();
            await expect(page).toHaveURL(new RegExp(`${item.expectedHash.replace('#', '#')}$`));
        }

        await navigateHash(page, '/dashboard');
        const mapBtn = page.getByRole('button', { name: 'Mở bản đồ trạm' });
        await expect(mapBtn).toBeVisible();
        await mapBtn.click();
        await expect(page).toHaveURL(/#\/stations$/);
    });

    test('E2E-PUB-02: Stations list, filters, OpenLayers map sync & detail navigation', async ({ page }) => {
        const stationsResponsePromise = page.waitForResponse(
            (res) => res.url().includes('/wind/api/v1/stations/') && res.status() === 200
        );
        await navigateHash(page, '/stations');
        await stationsResponsePromise;

        await expect(page.getByRole('heading', { name: 'Danh sách trạm quan trắc gió' })).toBeVisible();
        await expect(page.getByText(/Tổng số:/)).toBeVisible();

        // Check OpenLayers map canvas renders
        await expect(page.locator('.ol-viewport canvas').first()).toBeVisible({ timeout: 15000 });

        // Search filter by station name or code
        const searchInput = page.getByPlaceholder(/Tìm kiếm theo tên hoặc mã trạm/i).or(
            page.locator('input[type="text"], input[type="search"]').first()
        );
        await searchInput.fill('Phú Quý');
        await page.waitForTimeout(600);
        await expect(page.locator('#wind-app-root')).toContainText(/Phú Quý/i);

        // Reset search
        await searchInput.fill('');
        await page.waitForTimeout(600);

        // Toggle province filter (WFS)
        const provinceToggle = page.getByRole('button', { name: /Tỉnh|Địa giới/i }).first();
        if (await provinceToggle.isVisible()) {
            await provinceToggle.click();
            await page.waitForTimeout(400);
        }

        await saveEvidence(page, 'pub_02_stations.png');

        // Navigate to first station detail
        const detailBtn = page.getByRole('button', { name: /Xem chi tiết|Chi tiết/i }).first();
        await expect(detailBtn).toBeVisible();
        await detailBtn.click();
        await expect(page).toHaveURL(/#\/stations\/\d+\/detail/);
    });
});
