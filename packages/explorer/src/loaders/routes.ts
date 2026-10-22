import fs from 'node:fs';
import path from 'node:path';
import { fromRoot } from '../lib/repo';

/**
 * Where each repo file lives in the explorer. Markdown links are rewritten through this; anything
 * it doesn't map falls back to GitHub (source files) or fails the build (missing files).
 */
export function routeForFile(absolute: string): string | undefined {
  const file = absolute.replace(/\/$/, '');
  if (!fs.existsSync(file)) return undefined;
  const docsDir = fromRoot('packages/core/docs');
  if (file === path.join(docsDir, 'README.md') || file === docsDir) return 'docs';
  if (file === path.join(docsDir, 'packages.md')) return 'packages';
  if (file.startsWith(`${docsDir}/`) && file.endsWith('.md')) return `docs/${path.relative(docsDir, file).replace(/\.md$/, '')}`;
  if (file === fromRoot('ROADMAP.md')) return 'status';
  const pkg = new RegExp(`^${fromRoot('packages').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)(?:/README\\.md)?$`).exec(file);
  if (pkg) return `packages/${pkg[1]}`;
  return undefined;
}
