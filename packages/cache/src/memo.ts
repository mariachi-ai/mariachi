import type { CacheClient } from './types';

export function memoize<T>(
  cache: CacheClient,
  keyFn: (...args: unknown[]) => string,
  fn: (...args: unknown[]) => Promise<T>,
  ttlSeconds: number,
): (...args: unknown[]) => Promise<T> {
  return async (...args: unknown[]): Promise<T> => {
    const key = keyFn(...args);
    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;
    const result = await fn(...args);
    await cache.set(key, result, ttlSeconds);
    return result;
  };
}
