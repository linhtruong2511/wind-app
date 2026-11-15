import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SCREENSHOT_DIR = path.resolve(__dirname, '../../../tests/e2e_screenshots');
export const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
export const AUTH_DIR = path.resolve(__dirname, '../.auth');
export const ADMIN_STORAGE_STATE = path.join(AUTH_DIR, 'admin.json');

export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Attach listeners for runtime JS errors, console errors, and HTTP 5xx / network failures.
 */
export function attachRuntimeMonitors(page, options = {}) {
    const { allowStatuses = [] } = options;
    const pageErrors = [];
    const consoleErrors = [];
    const apiFailures = [];

    const onPageError = (err) => {
        pageErrors.push(err.message || String(err));
    };

    const onConsole = (msg) => {
        if (msg.type() === 'error') {
            const text = msg.text();
            // Ignore Vite dev server fallback warning when running production static bundle
            if (text.includes('5173')) return;
            consoleErrors.push(text);
        }
    };

    const onResponse = (res) => {
        const url = res.url();
        const status = res.status();
        const isWindApi = url.includes('/wind/api/v1/') || url.includes('/geoserver/');
        if (!isWindApi) return;
        if (allowStatuses.includes(status)) return;
        if (status >= 500) {
            apiFailures.push(`${status} ${res.request().method()} ${url}`);
        }
    };

    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    page.on('response', onResponse);

    return {
        pageErrors,
        consoleErrors,
        apiFailures,
        assertClean() {
            expect(pageErrors, `Uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
            expect(apiFailures, `Server 5xx errors: ${apiFailures.join('; ')}`).toEqual([]);
        },
        dispose() {
            page.off('pageerror', onPageError);
            page.off('console', onConsole);
            page.off('response', onResponse);
        },
    };
}

/**
 * Navigate to a hash route under /wind-app/ and wait until the React app finishes booting.
 */
export async function navigateHash(page, hashRoute) {
    const normalized = hashRoute.startsWith('/') ? hashRoute : `/${hashRoute}`;
    await page.goto(`/wind-app/#${normalized}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#wind-app-root').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => {
        const root = document.querySelector('#wind-app-root');
        if (!root) return false;
        const text = root.innerText || '';
        return !text.includes('Đang tải hệ thống ứng dụng trắc gió...');
    }, { timeout: 20000 });
}

/**
 * Save screenshot to shared evidence folder for reporting.
 */
export async function saveEvidence(page, filename) {
    ensureDir(SCREENSHOT_DIR);
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: fullPath, fullPage: true });
    return fullPath;
}

/**
 * Extract rendered visible text from #wind-app-root.
 */
export async function getAppVisibleText(page) {
    return page.locator('#wind-app-root').innerText();
}
