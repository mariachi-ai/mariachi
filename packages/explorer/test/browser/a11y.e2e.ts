import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { MODES, PRESETS, routes, SAMPLES, useTheme } from './helpers';

async function audit(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Mermaid draws SVG text whose contrast axe can't compute reliably; the diagrams have a text alternative.
    .exclude('pre.mermaid')
    .analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
}

test.describe('every page, minimal light', () => {
  for (const route of routes()) {
    test(`axe ${route}`, async ({ page }) => {
      await useTheme(page, 'minimal', 'light');
      await page.goto(route);
      expect(await audit(page)).toEqual([]);
    });
  }
});

const designPages = ['/design/kitchen-sink/', ...SAMPLES.map((s) => `/design/samples/${s}/`)];
const shellPages = ['/', '/packages/ai/', '/docs/architecture/', '/api/core/', '/reference/errors/'];

test.describe('every preset and mode', () => {
  for (const preset of PRESETS) {
    for (const mode of MODES) {
      for (const route of [...designPages, ...shellPages]) {
        if (preset === 'minimal' && mode === 'light') continue;
        test(`axe ${preset}/${mode} ${route}`, async ({ page }) => {
          await useTheme(page, preset, mode);
          await page.goto(route);
          expect(await audit(page)).toEqual([]);
        });
      }
    }
  }
});
