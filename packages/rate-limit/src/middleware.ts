import type { Context, Middleware } from '@mariachi/core';
import { RateLimitError } from '@mariachi/core';
import type { RateLimiter, RateLimitRule } from './types';

export function createRateLimitMiddleware(
  limiter: RateLimiter,
  rule: RateLimitRule,
): Middleware {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const key = ctx.userId ?? ctx.apiKeyId ?? 'anonymous';
    const result = await limiter.check(key, rule);

    if (!result.allowed) {
      throw new RateLimitError('rate-limit/exceeded', 'Rate limit exceeded', {
        retryAfterMs: result.retryAfterMs,
      });
    }

    await next();
  };
}
