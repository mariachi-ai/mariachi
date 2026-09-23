import type { Context, Logger, Instrumentable, Disposable } from '@mariachi/core';
import { withSpan, resolveInstrumentation, type InstrumentationDeps } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { CacheClient, DistributedLock } from './types';

export interface GetOrSetOptions {
  /**
   * Take a distributed lock around recomputation so only one instance fills a cold key.
   * Requires `lock` to be configured. Default true when a lock is available.
   */
  distributed?: boolean;
  /** How long other callers wait for the lock holder before computing anyway. Default 5000ms. */
  lockWaitMs?: number;
  /** Cache `null`/`undefined` results too (as a sentinel). Default false. */
  cacheNull?: boolean;
}

const NULL_SENTINEL = '__mariachi_null__';

export abstract class Cache implements Instrumentable, Disposable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly client: CacheClient;
  protected readonly lock?: DistributedLock;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(config: { client: CacheClient; lock?: DistributedLock }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.client = config.client;
    this.lock = config.lock;
  }

  private keyGroup(key: string): string {
    const parts = key.split(':');
    return parts[1] ?? parts[0] ?? 'unknown';
  }

  async get<T = string>(_ctx: Context, key: string): Promise<T | null> {
    return withSpan(this.tracer, 'cache.get', { key }, async () => {
      const result = await this.client.get<T>(key);
      this.metrics?.increment(result !== null ? 'cache.hit' : 'cache.miss', 1, { group: this.keyGroup(key) });
      return result;
    });
  }

  async set(_ctx: Context, key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return withSpan(this.tracer, 'cache.set', { key }, async () => {
      await this.client.set(key, value, ttlSeconds);
      this.metrics?.increment('cache.set', 1, { group: this.keyGroup(key) });
    });
  }

  async del(_ctx: Context, key: string): Promise<void> {
    return withSpan(this.tracer, 'cache.del', { key }, async () => {
      await this.client.del(key);
      this.metrics?.increment('cache.del', 1, { group: this.keyGroup(key) });
    });
  }

  async incr(_ctx: Context, key: string, by = 1, ttlSeconds?: number): Promise<number> {
    return this.client.incr(key, by, ttlSeconds);
  }

  /**
   * Read-through cache with stampede protection: concurrent callers in this process share one
   * computation, and (with a lock configured) only one instance recomputes a cold key.
   */
  async getOrSet<T>(ctx: Context, key: string, fn: () => Promise<T>, ttlSeconds: number, options: GetOrSetOptions = {}): Promise<T> {
    const cached = await this.readThrough<T>(ctx, key);
    if (cached.hit) return cached.value;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const run = async (): Promise<T> => {
      const useLock = (options.distributed ?? true) && this.lock;
      if (!useLock) return this.compute(ctx, key, fn, ttlSeconds, options);
      const lockKey = `${key}:__fill`;
      try {
        return await this.lock!.withLock(
          lockKey,
          Math.max(1000, ttlSeconds * 1000),
          async () => {
            const again = await this.readThrough<T>(ctx, key);
            if (again.hit) return again.value;
            return this.compute(ctx, key, fn, ttlSeconds, options);
          },
          { waitMs: options.lockWaitMs ?? 5000 },
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'lock/not-acquired') throw error;
        this.logger.warn({ key }, 'cache fill lock wait exceeded; computing without lock');
        return this.compute(ctx, key, fn, ttlSeconds, options);
      }
    };

    const promise = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async readThrough<T>(ctx: Context, key: string): Promise<{ hit: true; value: T } | { hit: false }> {
    const raw = await this.get<T | typeof NULL_SENTINEL>(ctx, key);
    if (raw === null) return { hit: false };
    if (raw === NULL_SENTINEL) return { hit: true, value: null as T };
    return { hit: true, value: raw as T };
  }

  private async compute<T>(ctx: Context, key: string, fn: () => Promise<T>, ttlSeconds: number, options: GetOrSetOptions): Promise<T> {
    const value = await fn();
    if (value === null || value === undefined) {
      if (options.cacheNull) await this.set(ctx, key, NULL_SENTINEL, ttlSeconds);
      return value;
    }
    await this.set(ctx, key, value, ttlSeconds);
    return value;
  }

  key(...segments: string[]): string {
    return this.client.key(...segments);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.lock?.connect();
  }

  async disconnect(): Promise<void> {
    await this.lock?.disconnect();
    await this.client.disconnect();
  }

  async isHealthy(): Promise<boolean> {
    return this.client.isHealthy();
  }
}

export class DefaultCache extends Cache {}
