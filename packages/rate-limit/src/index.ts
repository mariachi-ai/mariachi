import { RateLimitError } from '@mariachi/core';
import type { RateLimitConfig, RateLimiter } from './types';
import { RedisRateLimiter } from './adapters/redis';

export { createRateLimitMiddleware } from './middleware';
export type {
  RateLimitConfig,
  RateLimitRule,
  RateLimitResult,
  RateLimiter,
} from './types';
export { RedisRateLimiter } from './adapters/redis';
export { RateLimiting, DefaultRateLimiting } from './rate-limiting';

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  if (config.adapter === 'redis') {
    const url = config.url ?? 'redis://localhost:6379';
    return new RedisRateLimiter(url);
  }
  throw new RateLimitError('ratelimit/unknown-adapter', `Unknown rate limit adapter: ${config.adapter}`);
}
