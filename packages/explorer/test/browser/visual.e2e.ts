import { expect, test } from '@playwright/test';
import { MODES, PRESETS, SAMPLES, useTheme } from './helpers';

const pages = [{ name: 'kitchen-sink', route: '/design/kitchen-sink/' }, ...SAMPLES.map((s) => ({ name: `sample-${s}`, route: `/design/samples/${s}/` }))];

for (const preset of PRESETS) {
  for (const mode of MODES) {
    for (const p of pages) {
      test(`${preset} ${mode} ${p.name}`, async ({ page }) => {
        await useTheme(page, preset, mode);
        await page.goto(p.route);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('main')).toHaveScreenshot(`${preset}-${mode}-${p.name}.png`, { mask: [page.locator('[data-streaming]'), page.locator('.m-spinner'), page.locator('.m-skeleton')] });
      });
    }
  }
}

for (const route of ['/packages/ai/', '/docs/architecture/']) {
  test(`shell ${route}`, async ({ page }) => {
    await useTheme(page, 'minimal', 'light');
    await page.goto(route);
    await expect(page).toHaveScreenshot(`shell-${route.replace(/\W+/g, '-')}.png`, { mask: [page.locator('pre.mermaid')] });
  });
}
