import { test, expect } from '@playwright/test';
import {
    ADMIN_STORAGE_STATE,
    attachRuntimeMonitors,
    navigateHash,
    saveEvidence,
} from './helpers/wind-helpers.js';

test.describe('WindHUB Admin: Route Guard & Fullscreen Shell (E2E-ADM-01)', () => {
    test('Guest user is blocked with 403 on #/admin and backend mutation returns 403', async ({ page }) => {
        const monitors = attachRuntimeMonitors(page);

        await navigateHash(page, '/admin/dashboard');
        await expect(page.getByRole('heading', { name: /403 - Truy cập bị từ chối/i })).toBeVisible();
        await expect(page.getByText(/Bạn cần có quyền quản trị viên/i)).toBeVisible();
        await expect(page.getByRole('link', { name: /Về trang bản đồ/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /Đăng nhập tài khoản khác/i })).toBeVisible();

        // Backend DRF write protection check
        const postRes = await page.request.post('/wind/api/v1/stations/', {
            data: { station_code: 'UNAUTH_TEST', name: 'Unauth', geom: 'SRID=4326;POINT(106 10)' },
        });
        expect([401, 403]).toContain(postRes.status());

        await saveEvidence(page, 'adm_00_guard_403.png');
        monitors.assertClean();
        monitors.dispose();
    });

    test.describe('Authenticated admin fullscreen layout & sidebar controls', () => {
        test.use({ storageState: ADMIN_STORAGE_STATE });

        test('Admin accesses WindHUB shell, collapses/expands sidebar & sees back link', async ({ page }) => {
            const monitors = attachRuntimeMonitors(page);

            await navigateHash(page, '/admin');
            await expect(page).toHaveURL(/#\/admin$/);
            await expect(page.locator('body')).toHaveClass(/wind-admin-fullscreen-active/);
            await expect(page.getByRole('heading', { name: /Tổng quan hệ thống/i })).toBeVisible();

            // Sidebar navigation links present
            for (const navText of [
                'Tổng quan',
                'Thu thập dữ liệu ERA5',
                'Dữ liệu lưới',
                'Trạm đo và quan trắc',
                'Trang trại và tuabin',
                'Bộ dữ liệu và phân quyền',
            ]) {
                await expect(page.locator('.wind-admin-sidebar').getByText(navText, { exact: true })).toBeVisible();
            }

            // Toggle sidebar collapse button if present
            const collapseBtn = page.locator('button[title*="Thu gọn"], button[title*="Mở rộng"], button:has(i.fa-bars)').first();
            if (await collapseBtn.isVisible()) {
                await collapseBtn.click();
                await expect(page.locator('.wind-admin-sidebar')).toHaveClass(/collapsed/);
                await collapseBtn.click();
                await expect(page.locator('.wind-admin-sidebar')).not.toHaveClass(/collapsed/);
            }

            await saveEvidence(page, 'adm_01_shell.png');
            monitors.assertClean();
            monitors.dispose();
        });
    });
});
