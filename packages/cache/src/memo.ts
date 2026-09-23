import type { CacheClient } from './types';

/** Wraps `fn` with a read-through cache. Concurrent calls for the same key share one execution. */
export function memoize<A extends unknown[], T>(
  cache: CacheClient,
  keyFn: (...args: A) => string,
  fn: (...args: A) => Promise<T>,
  ttlSeconds: number,
): (...args: A) => Promise<T> {
  const inflight = new Map<string, Promise<T>>();
  return async (...args: A): Promise<T> => {
    const key = keyFn(...args);
    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;
    const promise = (async () => {
      const result = await fn(...args);
      await cache.set(key, result, ttlSeconds);
      return result;
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };
}
