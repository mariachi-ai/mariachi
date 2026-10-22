import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ExplorerError } from './errors';
import { fromRoot } from './repo';

/**
 * Imports a workspace package's built entry at build time straight from `packages/<dir>/dist`,
 * so Vite can't inline it into the prerender bundle (some packages resolve files relative to
 * themselves, e.g. `@mariachi/create` reads its own package.json).
 */
export async function importWorkspace<T>(specifier: string): Promise<T> {
  const [, name, ...rest] = specifier.split('/');
  const dir = fromRoot('packages', name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> };
  const key = rest.length ? `./${rest.join('/')}` : '.';
  const target = pkg.exports?.[key] as { import?: string } | string | undefined;
  const file = typeof target === 'string' ? target : target?.import;
  if (!file || !fs.existsSync(path.join(dir, file))) {
    throw new ExplorerError('explorer/missing-source', `${specifier} isn't built (expected ${path.join(dir, file ?? '?')}); run pnpm build first`);
  }
  return (await import(/* @vite-ignore */ pathToFileURL(path.join(dir, file)).href)) as T;
}
