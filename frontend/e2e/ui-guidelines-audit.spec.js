import { test, expect } from '@playwright/test';
import { attachRuntimeMonitors, getAppVisibleText, navigateHash } from './helpers/wind-helpers.js';

const FORBIDDEN_PATTERNS = [
    { name: 'DuckDB', regex: /\bDuckDB\b/i },
    { name: 'PostgreSQL', regex: /\bPostgreSQL\b/i },
    { name: 'Celery', regex: /\bCelery\b/i },
    { name: 'NetCDF', regex: /\bNetCDF\b/i },
    { name: 'Dry-run', regex: /\bDry-?run\b/i },
    { name: 'Staff/Superuser', regex: /\b(Staff|Superuser)\b/i },
    { name: 'VD:', regex: /\bVD:/i },
    { name: 'Ampersand (&)', regex: /\s&\s/ },
];

const ALL_ROUTES = [
    '/dashboard',
    '/stations',
    '/grid',
    '/farms',
    '/statistics',
    '/admin/dashboard',
    '/admin/cds',
    '/admin/rasters',
    '/admin/stations',
    '/admin/farms',
    '/admin/datasets',
];

test.describe('Cross-Route UI Guidelines & Runtime Health Audit', () => {
    test('Audit all 12 routes for JS/HTTP errors and Rule #4 UI text compliance', async ({ page }) => {
        const monitors = attachRuntimeMonitors(page);
        const findings = [];

        for (const route of ALL_ROUTES) {
            await navigateHash(page, route);
            await page.waitForTimeout(800);
            const text = await getAppVisibleText(page);
            expect(text.trim().length, `Route ${route} rendered empty content`).toBeGreaterThan(10);

            for (const rule of FORBIDDEN_PATTERNS) {
                const match = text.match(rule.regex);
                if (match) {
                    findings.push(`[${route}] Matched forbidden UI term "${rule.name}": "${match[0]}"`);
                }
            }
        }

        // Also check dynamic station detail route
        const stRes = await page.request.get('/wind/api/v1/stations/');
        const stJson = await stRes.json();
        const stations = stJson.results || stJson;
        if (stations.length > 0) {
            const detailRoute = `/stations/${stations[0].id}/detail`;
            await navigateHash(page, detailRoute);
            await page.waitForTimeout(800);
            const detailText = await getAppVisibleText(page);
            for (const rule of FORBIDDEN_PATTERNS) {
                const match = detailText.match(rule.regex);
                if (match) {
                    findings.push(`[${detailRoute}] Matched forbidden UI term "${rule.name}": "${match[0]}"`);
                }
            }
        }

        if (findings.length > 0) {
            test.info().annotations.push({
                type: 'ui-rule-4-findings',
                description: findings.join(' | '),
            });
            console.log('UI_RULE_4_FINDINGS:', JSON.stringify(findings, null, 2));
        }

        monitors.assertClean();
        monitors.dispose();
    });
});
