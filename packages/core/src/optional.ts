import { createRequire } from 'node:module';
import { MariachiError } from './errors';

const cache = new Map<string, unknown>();

/**
 * Loads an optional peer dependency synchronously. Vendor SDKs (stripe, ioredis, nats, ...)
 * are optional peers so apps only install what they use. `from` must be the caller's
 * `import.meta.url` so resolution happens relative to the calling package.
 */
export function loadOptionalPeer<T = any>(pkg: string, feature: string, from: string): T {
  const cacheKey = `${from}::${pkg}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T;
  try {
    const mod = createRequire(from)(pkg) as T;
    cache.set(cacheKey, mod);
    return mod;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      throw new MariachiError(
        'dependency/missing-peer',
        `${feature} requires the optional peer dependency "${pkg}". Install it with: pnpm add ${pkg}`,
        { pkg, feature },
      );
    }
    throw error;
  }
}
