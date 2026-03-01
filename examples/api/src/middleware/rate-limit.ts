import type { HttpContext } from '@mariachi/api-facade';
import { getContainer, KEYS, RateLimitError } from '@mariachi/core';
import { DefaultRateLimiting } from '@mariachi/rate-limit';
import type { RateLimiter } from '@mariachi/rate-limit';

export async function rateLimitMiddleware(ctx: HttpContext, next: () => Promise<void>) {
  const limiter = getContainer().resolve<RateLimiter>(KEYS.RateLimit);
  const rateLimiting = new DefaultRateLimiting({ limiter });
  const key = ctx.identity?.userId ?? ctx.identity?.tenantId ?? 'anonymous';
  const result = await rateLimiting.check(ctx, key, {
    maxRequests: 100,
    windowMs: 60_000,
  });
  if (!result.allowed) {
    throw new RateLimitError('rate-limit/exceeded', `Rate limit exceeded. Retry after ${result.retryAfterMs}ms`);
  }
  await next();
}
