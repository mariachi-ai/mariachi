import { MemoryCacheAdapter } from '@mariachi/cache';

/**
 * Cache double. The memory adapter (prefix-scoped `keys` and `flush`, TTLs, atomic `incr`),
 * so the cache contract suite holds for both it and Redis.
 */
export class TestCacheClient extends MemoryCacheAdapter {
  constructor(config?: { prefix?: string; defaultTtl?: number }) {
    super({ adapter: 'memory', ...config });
  }
}
