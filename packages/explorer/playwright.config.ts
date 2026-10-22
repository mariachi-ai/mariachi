import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the built site (pnpm build first). Projects:
 * - `checks`: smoke (every route), accessibility (axe), behaviour (search, theming, compare,
 *   playground, override isolation)
 * - `visual`: screenshot comparisons per preset and mode. Baselines are per platform; CI's are
 *   generated in the mcr.microsoft.com/playwright image (`pnpm explore:visual --update` there).
 */
export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  use: { baseURL: 'http://127.0.0.1:4399', ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
  webServer: { command: 'node scripts/serve.mjs 4399', url: 'http://127.0.0.1:4399/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'checks', testIgnore: '**/visual.e2e.ts' },
    { name: 'visual', testMatch: '**/visual.e2e.ts' },
  ],
});
