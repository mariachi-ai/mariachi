import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, timed, getContainer, KEYS, CacheError } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { CacheClient, DistributedLock } from './types';

export abstract class Cache implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly client: CacheClient;
  protected readonly lock?: DistributedLock;

  constructor(config: { client: CacheClient; lock?: DistributedLock }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.client = config.client;
    this.lock = config.lock;
  }

  async get<T = string>(ctx: Context, key: string): Promise<T | null> {
    return withSpan(this.tracer, 'cache.get', { key }, async () => {
      const result = await this.client.get<T>(key);
      this.metrics?.increment(result ? 'cache.hit' : 'cache.miss', 1, { key: key.split(':')[0] ?? 'unknown' });
      return result;
    });
  }

  async set(ctx: Context, key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return withSpan(this.tracer, 'cache.set', { key }, async () => {
      await this.client.set(key, value, ttlSeconds);
      this.metrics?.increment('cache.set', 1);
    });
  }

  async del(ctx: Context, key: string): Promise<void> {
    return withSpan(this.tracer, 'cache.del', { key }, async () => {
      await this.client.del(key);
      this.metrics?.increment('cache.del', 1);
    });
  }

  async getOrSet<T>(ctx: Context, key: string, fn: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await this.get<T>(ctx, key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(ctx, key, value, ttlSeconds);
    return value;
  }

  key(...segments: string[]): string {
    return this.client.key(...segments);
  }

  async connect(): Promise<void> { await this.client.connect(); }
  async disconnect(): Promise<void> { await this.client.disconnect(); }
}

export class DefaultCache extends Cache {}
