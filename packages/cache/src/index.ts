import { CacheError } from '@mariachi/core';
import type { CacheConfig, CacheClient, DistributedLock } from './types';
import { RedisCacheAdapter } from './adapters/redis';
import { RedisDistributedLock } from './lock';
import { memoize } from './memo';

export type { CacheConfig, CacheClient, DistributedLock } from './types';
export { RedisCacheAdapter } from './adapters/redis';
export { RedisDistributedLock } from './lock';
export { memoize } from './memo';
export { Cache, DefaultCache } from './cache';

export function createCache(config: CacheConfig): CacheClient {
  if (config.adapter === 'redis') {
    return new RedisCacheAdapter(config);
  }
  throw new CacheError('cache/unknown-adapter', `Unknown cache adapter: ${config.adapter}`);
}

export function createLock(config: CacheConfig): DistributedLock {
  if (config.adapter !== 'redis') {
    throw new CacheError('cache/lock-requires-redis', 'Distributed lock requires redis adapter');
  }
  return new RedisDistributedLock(config);
}
