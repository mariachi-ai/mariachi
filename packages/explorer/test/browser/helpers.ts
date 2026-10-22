import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'site');
export const PRESETS = ['minimal', 'brutalist', 'editorial', 'soft', 'enterprise', 'terminal'] as const;
export const MODES = ['light', 'dark'] as const;
export const SAMPLES = ['dashboard', 'settings', 'chat', 'landing', 'sign-in'] as const;

/** Every built page route (`/packages/ai/`), from the index.html files under dist/site. */
export function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !['_astro', 'pagefind'].includes(e.name)) walk(path.join(dir, e.name));
      else if (e.name === 'index.html') out.push(`/${path.relative(SITE, dir).split(path.sep).join('/')}${dir === SITE ? '' : '/'}`.replace('//', '/'));
    }
  };
  walk(SITE);
  return out.sort();
}

/** Sets the explorer's preset and mode before any page script runs. */
export async function useTheme(page: Page, theme: string, mode: string): Promise<void> {
  await page.addInitScript(([t, m]) => localStorage.setItem('mariachi-explorer', JSON.stringify({ theme: t, mode: m })), [theme, mode]);
  await page.emulateMedia({ colorScheme: mode === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce' });
}

/** Collects console errors and uncaught exceptions for a page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
