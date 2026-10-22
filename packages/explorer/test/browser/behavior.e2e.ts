import { expect, test } from '@playwright/test';
import { useTheme } from './helpers';

test.describe('theme switcher', () => {
  test('restyles the whole explorer and persists', async ({ page }) => {
    await page.goto('/packages/');
    const radius = () => page.locator('.m-button').first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(await radius()).not.toBe('0px');
    await page.selectOption('#x-theme', 'brutalist');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'brutalist');
    expect(await radius()).toBe('0px');
    await page.selectOption('#x-mode', 'dark');
    await page.goto('/docs/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'brutalist');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  });
});

test.describe('search', () => {
  for (const [query, expected] of [
    ['billing', '/packages/billing/'],
    ['createAI', '/api/ai/'],
    ['ai/token-budget-exceeded', '/reference/errors/'],
    ['tool call', '/design/components/tool-call/'],
    ['transactional outbox', '/docs/events/'],
  ] as const) {
    test(`finds ${expected} for "${query}"`, async ({ page }) => {
      await page.goto('/');
      await page.keyboard.press('Meta+k');
      await expect(page.locator('#x-search')).toBeVisible();
      await page.fill('#x-search-input', query);
      await expect(page.locator(`.x-search-hit[href^="${expected}"]`).first()).toBeVisible({ timeout: 10_000 });
    });
  }

  test('opens with / and closes with Escape', async ({ page }) => {
    await page.goto('/packages/');
    await page.keyboard.press('/');
    await expect(page.locator('#x-search')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#x-search')).toBeHidden();
  });
});

test.describe('package filter', () => {
  test('filters by text and status', async ({ page }) => {
    await page.goto('/packages/');
    const visible = page.locator('[data-x-item]:not([data-x-hidden])');
    const total = await visible.count();
    await page.fill('#pkg-filter', 'typesense');
    await expect(visible).toHaveCount(1);
    await expect(visible.first()).toHaveAttribute('href', '/packages/search/');
    await page.fill('#pkg-filter', '');
    await page.click('[data-x-status="alpha"]');
    expect(await visible.count()).toBeLessThan(total);
    for (const status of await visible.evaluateAll((els) => els.map((e) => e.getAttribute('data-x-status-value')))) expect(status).toBe('alpha');
  });
});

test.describe('compare', () => {
  test('renders the chosen presets with their modes and keeps them in the URL', async ({ page }) => {
    await page.goto('/design/compare/?item=button&presets=soft,terminal,editorial&modes=terminal:dark');
    const panels = page.locator('.x-compare-panel');
    await expect(panels).toHaveCount(3);
    // Panels follow the catalog's preset order, whatever order the URL lists them in.
    await expect(panels.nth(2)).toHaveAttribute('data-theme', 'terminal');
    await expect(panels.nth(2)).toHaveAttribute('data-mode', 'dark');
    await expect(panels.nth(0)).toHaveAttribute('data-mode', 'light');
    await expect(panels.first().locator('.m-button').first()).toBeVisible();
    await page.check('input[name="preset"][value="brutalist"]');
    await expect(panels).toHaveCount(4);
    // Four is the maximum.
    await expect(page.locator('input[name="preset"][value="minimal"]')).toBeDisabled();
    expect(page.url()).toContain('presets=brutalist%2Ceditorial%2Csoft%2Cterminal');
  });
});

test.describe('playground', () => {
  test('emits only the changed token and reports contrast failures', async ({ page }) => {
    await page.goto('/design/playground/');
    await expect(page.locator('#pg-css')).toContainText('No changes yet');
    await page.fill('#pg-filter', 'fg.muted');
    const light = page.locator('input[aria-label="color.fg.muted light"]');
    await light.fill('oklch(0.9 0 0)');
    await light.press('Enter');
    await expect(page.locator('#pg-changed')).toHaveText('1 token changed');
    await expect(page.locator('#pg-css')).toContainText('--m-color-fg-muted');
    // Only one token is emitted (it repeats in the dark blocks because it has per-mode values).
    expect([...new Set((await page.locator('#pg-css').textContent())!.match(/--m-[a-z0-9-]+:/g))]).toEqual(['--m-color-fg-muted:']);
    await expect(page.locator('#pg-contrast')).toHaveAttribute('data-tone', 'danger');
    await expect(page.locator('#pg-contrast')).toContainText('color.fg.muted on color.bg.canvas (light)');
    await page.click('#pg-tab-config');
    await expect(page.locator('#pg-config')).toContainText("muted: {\n          light: 'oklch(0.9 0 0)',");
    // The preview uses the edited theme.
    const muted = await page.locator('#pg-stage .m-muted').first().evaluate((el) => getComputedStyle(el).color);
    expect(muted).toContain('0.9');
    // State survives a reload through the URL hash.
    await page.reload();
    await expect(page.locator('#pg-changed')).toHaveText('1 token changed');
  });
});

test.describe('override isolation', () => {
  const style = (sel: string, prop: string) => `(() => getComputedStyle(document.querySelector('${sel}')).${prop})()`;

  test.beforeEach(async ({ page }) => {
    await useTheme(page, 'minimal', 'light');
    await page.goto('/design/kitchen-sink/');
  });

  test('level 1: one semantic token changes every component that reads it, and nothing else', async ({ page }) => {
    const button = '[data-component="button"] .m-button[data-variant="primary"]';
    const card = '[data-component="card"] .m-card';
    const before = { accent: await page.evaluate(style(button, 'backgroundColor')), card: await page.evaluate(style(card, 'backgroundColor')) };
    await page.addStyleTag({ content: ':root { --m-color-accent-default: rgb(255, 0, 128); }' });
    expect(await page.evaluate(style(button, 'backgroundColor'))).toBe('rgb(255, 0, 128)');
    expect(await page.evaluate(style(button, 'backgroundColor'))).not.toBe(before.accent);
    expect(await page.evaluate(style(card, 'backgroundColor'))).toBe(before.card);
  });

  test('level 2: one component token changes only that component', async ({ page }) => {
    const button = '[data-component="button"] .m-button';
    const input = '[data-component="input"] .m-input';
    const inputRadius = await page.evaluate(style(input, 'borderTopLeftRadius'));
    await page.addStyleTag({ content: ':root { --m-button-radius: 999px; }' });
    expect(await page.evaluate(style(button, 'borderTopLeftRadius'))).toBe('999px');
    expect(await page.evaluate(style(input, 'borderTopLeftRadius'))).toBe(inputRadius);
  });

  test('level 3: a scoped override reaches only components inside the scope', async ({ page }) => {
    const cards = page.locator('[data-component="card"] .m-card');
    const shadows = await cards.evaluateAll((els) => els.map((e) => getComputedStyle(e).boxShadow));
    await cards.first().evaluate((el) => el.parentElement!.classList.add('x-test-scope'));
    await page.addStyleTag({ content: '.x-test-scope .m-card { --m-card-shadow: none; --m-card-border: rgb(255, 0, 0); }' });
    const after = await cards.evaluateAll((els) => els.map((e) => ({ shadow: getComputedStyle(e).boxShadow, scoped: Boolean(e.closest('.x-test-scope')) })));
    for (const [i, c] of after.entries()) {
      if (c.scoped) expect(c.shadow).toBe('none');
      else expect(c.shadow).toBe(shadows[i]);
    }
  });

  test('a scoped semantic override reaches component defaults inside it', async ({ page }) => {
    // Component defaults resolve on the component's own element, so .marketing { --m-color-accent-default }
    // reaches buttons inside .marketing (a token declared on :root would not).
    const target = page.locator('[data-component="button"] .m-button[data-variant="primary"]').first();
    await target.evaluate((el) => el.parentElement!.classList.add('x-test-marketing'));
    await page.addStyleTag({ content: '.x-test-marketing { --m-color-accent-default: rgb(0, 128, 0); }' });
    expect(await target.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 128, 0)');
  });
});

test.describe('behaviors', () => {
  test('tabs switch with the keyboard', async ({ page }) => {
    await page.goto('/design/components/tabs/');
    const list = page.locator('.x-example-stage [role="tablist"]').first();
    const tabs = list.locator('[role="tab"]');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'false');
  });

  test('copy buttons copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/packages/core/');
    const copy = page.locator('.x-code-block .x-copy').first();
    await copy.click();
    await expect(copy).toHaveAttribute('data-copied', 'true');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm add @mariachi/core');
  });
});
