import { RateLimitError } from '@mariachi/core';
import type { RateLimitConfig, RateLimiter } from './types';
import { RedisRateLimiter } from './adapters/redis';
import { MemoryRateLimiter } from './adapters/memory';

export { createRateLimitMiddleware, defaultRateLimitKey } from './middleware';
export type { RateLimitConfig, RateLimitRule, RateLimitResult, RateLimitTier, RateLimiter, TierResolver } from './types';
export { RedisRateLimiter } from './adapters/redis';
export { MemoryRateLimiter } from './adapters/memory';
export { RateLimiting, DefaultRateLimiting } from './rate-limiting';

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  if (config.adapter === 'redis') return new RedisRateLimiter(config);
  if (config.adapter === 'memory') return new MemoryRateLimiter();
  throw new RateLimitError('rate-limit/unknown-adapter', `Unknown rate limit adapter: ${config.adapter}`);
}
