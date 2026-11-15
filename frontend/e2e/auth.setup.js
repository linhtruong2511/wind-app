import { test as setup, expect } from '@playwright/test';
import { AUTH_DIR, ADMIN_STORAGE_STATE, ensureDir } from './helpers/wind-helpers.js';

setup('authenticate admin user via GeoNode login', async ({ page }) => {
    ensureDir(AUTH_DIR);

    const adminUser = process.env.E2E_ADMIN_USER || 'admin';
    const adminPass = process.env.E2E_ADMIN_PASS || 'admin';

    await page.goto('/account/login/?next=/wind-app/', { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="login"]').fill(adminUser);
    await page.locator('input[name="password"]').fill(adminPass);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.includes('/account/login'), { timeout: 20000 });
    await page.goto('/wind-app/', { waitUntil: 'domcontentloaded' });

    const root = page.locator('#wind-app-root');
    await expect(root).toHaveAttribute('data-is-authenticated', 'true');
    const isStaff = await root.getAttribute('data-is-staff');
    const isSuper = await root.getAttribute('data-is-superuser');
    expect(isStaff === 'true' || isSuper === 'true').toBeTruthy();

    await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
