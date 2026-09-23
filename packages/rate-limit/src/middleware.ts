import type { Context, Middleware } from '@mariachi/core';
import { RateLimitError } from '@mariachi/core';
import type { RateLimiter, RateLimitRule } from './types';

/** Default key: tenant-scoped user, then api key, then a shared anonymous bucket. */
export function defaultRateLimitKey(ctx: Context): string {
  if (ctx.apiKeyId) return `key:${ctx.apiKeyId}`;
  if (ctx.userId) return `user:${ctx.tenantId ?? '-'}:${ctx.userId}`;
  return 'anonymous';
}

export function createRateLimitMiddleware(
  limiter: RateLimiter,
  rule: RateLimitRule | ((ctx: Context) => RateLimitRule),
  options: { key?: (ctx: Context) => string; scope?: string } = {},
): Middleware {
  const keyFn = options.key ?? defaultRateLimitKey;
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const resolved = typeof rule === 'function' ? rule(ctx) : rule;
    const key = options.scope ? `${options.scope}:${keyFn(ctx)}` : keyFn(ctx);
    const result = await limiter.check(key, resolved);
    if (!result.allowed) {
      throw new RateLimitError('rate-limit/exceeded', 'Rate limit exceeded', {
        retryAfterMs: result.retryAfterMs,
        retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        limit: result.limit,
      });
    }
    await next();
  };
}
