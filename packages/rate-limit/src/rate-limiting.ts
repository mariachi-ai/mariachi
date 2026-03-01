import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, getContainer, KEYS, RateLimitError } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { RateLimiter, RateLimitRule, RateLimitResult } from './types';

export abstract class RateLimiting implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly limiter: RateLimiter;

  constructor(config: { limiter: RateLimiter }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.limiter = config.limiter;
  }

  async check(ctx: Context, key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return withSpan(this.tracer, 'ratelimit.check', { key, traceId: ctx.traceId }, async () => {
      this.logger.info({ traceId: ctx.traceId, key }, 'Checking rate limit');
      const result = await this.limiter.check(key, rule);
      this.metrics?.increment('ratelimit.checked', 1, { key: key.split(':')[0] ?? 'unknown' });
      if (!result.allowed) {
        this.metrics?.increment('ratelimit.throttled', 1, { key: key.split(':')[0] ?? 'unknown' });
        await this.onRateLimitExceeded?.(ctx, key, result);
      }
      return result;
    });
  }

  async connect(): Promise<void> { await this.limiter.connect(); }
  async disconnect(): Promise<void> { await this.limiter.disconnect(); }

  protected onRateLimitExceeded?(ctx: Context, key: string, result: RateLimitResult): Promise<void>;
}

export class DefaultRateLimiting extends RateLimiting {}
