import { CacheError } from '@mariachi/core';
import type { CacheConfig, CacheClient, DistributedLock } from './types';
import { RedisCacheAdapter } from './adapters/redis';
import { MemoryCacheAdapter } from './adapters/memory';
import { RedisDistributedLock } from './lock';

export type {
  CacheConfig,
  CacheClient,
  DistributedLock,
  LockAcquireOptions,
  LockAcquireResult,
  LockInfo,
  WithLockOptions,
} from './types';
export { RedisCacheAdapter } from './adapters/redis';
export { MemoryCacheAdapter } from './adapters/memory';
export { RedisDistributedLock } from './lock';
export { RedisIdempotencyStore } from './idempotency';
export { createRedisClient, scanKeys } from './redis-client';
export { memoize } from './memo';
export { Cache, DefaultCache, type GetOrSetOptions } from './cache';

export function createCache(config: CacheConfig): CacheClient {
  if (config.adapter === 'redis') return new RedisCacheAdapter(config);
  if (config.adapter === 'memory') return new MemoryCacheAdapter(config);
  throw new CacheError('cache/unknown-adapter', `Unknown cache adapter: ${config.adapter}`);
}

export function createLock(config: CacheConfig): DistributedLock {
  if (config.adapter !== 'redis') {
    throw new CacheError('cache/lock-requires-redis', 'Distributed lock requires redis adapter');
  }
  return new RedisDistributedLock(config);
}
