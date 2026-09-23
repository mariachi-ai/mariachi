import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, RateLimitError, resolveInstrumentation, type InstrumentationDeps } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { RateLimiter, RateLimitRule, RateLimitResult, RateLimitTier, TierResolver } from './types';

export abstract class RateLimiting implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly limiter: RateLimiter;
  protected readonly resolveTier?: TierResolver;

  constructor(config: { limiter: RateLimiter; resolveTier?: TierResolver }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.limiter = config.limiter;
    this.resolveTier = config.resolveTier;
  }

  async check(ctx: Context, key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return withSpan(this.tracer, 'ratelimit.check', { key, traceId: ctx.traceId }, async () => {
      const result = await this.limiter.check(key, rule);
      const group = key.split(':')[0] ?? 'unknown';
      this.metrics?.increment('ratelimit.checked', 1, { group });
      if (!result.allowed) {
        this.metrics?.increment('ratelimit.throttled', 1, { group });
        this.logger.debug({ traceId: ctx.traceId, key }, 'Rate limit exceeded');
        await this.onRateLimitExceeded?.(ctx, key, result);
      }
      return result;
    });
  }

  /** Like `check`, but throws `RateLimitError('rate-limit/exceeded')` when over the limit. */
  async consume(ctx: Context, key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const result = await this.check(ctx, key, rule);
    if (!result.allowed) {
      throw new RateLimitError('rate-limit/exceeded', 'Rate limit exceeded', {
        retryAfterMs: result.retryAfterMs,
        retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        limit: result.limit,
      });
    }
    return result;
  }

  /**
   * Checks `action` against the tenant's tier. The tier is `tierName`, else `resolveTier(ctx)`
   * (e.g. the tenant's plan), else `default`; anonymous contexts use `anonymous` when defined.
   * Each tenant has its own counter per action.
   */
  async checkTier(ctx: Context, action: string, tiers: Record<string, RateLimitTier>, tierName?: string): Promise<RateLimitResult> {
    const explicit = tierName ?? (ctx.tenantId ? await this.resolveTier?.(ctx) : undefined);
    if (explicit !== undefined && !tiers[explicit]) {
      throw new RateLimitError('rate-limit/unknown-tier', `No rate limit tier named ${explicit}`);
    }
    const name = explicit ?? (!ctx.tenantId && tiers.anonymous ? 'anonymous' : 'default');
    const tier = tiers[name];
    if (!tier) throw new RateLimitError('rate-limit/unknown-tier', `No rate limit tier named ${name}`);
    const key = `tenant:${ctx.tenantId ?? 'anonymous'}:${action}`;
    return this.check(ctx, key, tier.rule);
  }

  /** Like `checkTier`, but throws `RateLimitError('rate-limit/exceeded')` when over the limit. */
  async consumeTier(ctx: Context, action: string, tiers: Record<string, RateLimitTier>, tierName?: string): Promise<RateLimitResult> {
    const result = await this.checkTier(ctx, action, tiers, tierName);
    if (!result.allowed) {
      throw new RateLimitError('rate-limit/exceeded', 'Rate limit exceeded', {
        retryAfterMs: result.retryAfterMs,
        retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        limit: result.limit,
      });
    }
    return result;
  }

  async connect(): Promise<void> { await this.limiter.connect(); }
  async disconnect(): Promise<void> { await this.limiter.disconnect(); }
  isHealthy(): Promise<boolean> { return this.limiter.isHealthy(); }

  protected onRateLimitExceeded?(ctx: Context, key: string, result: RateLimitResult): Promise<void>;
}

export class DefaultRateLimiting extends RateLimiting {}
