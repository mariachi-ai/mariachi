import fs from 'node:fs';
import path from 'node:path';
import { ExplorerError } from './errors';

let cached: string | undefined;

/**
 * The repo root: the nearest directory above the working directory holding pnpm-workspace.yaml.
 * Loaders resolve every source from here (not from import.meta.url, which moves when Astro bundles
 * them).
 */
export function repoRoot(): string {
  if (cached) return cached;
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new ExplorerError('explorer/missing-source', `No pnpm-workspace.yaml above ${process.cwd()}`);
    dir = parent;
  }
  cached = dir;
  return dir;
}

export const fromRoot = (...parts: string[]) => path.join(repoRoot(), ...parts);

/** Repo-relative path with forward slashes. */
export const relative = (file: string) => path.relative(repoRoot(), file).split(path.sep).join('/');

export const GITHUB = 'https://github.com/mariachi-ai/mariachi';
export const sourceUrl = (repoRelative: string) => `${GITHUB}/blob/main/${repoRelative}`;

/** Memoises a loader for the life of the build (pages call loaders many times). */
export function once<T>(fn: () => T): () => T {
  let value: { v: T } | undefined;
  return () => {
    value ??= { v: fn() };
    return value.v;
  };
}
