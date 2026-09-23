import type Redis from 'ioredis';
import { CacheError } from '@mariachi/core';
import type { CacheConfig, CacheClient } from '../types';
import { connectRedis, createRedisClient, disconnectRedis, pingRedis, scanKeys } from '../redis-client';

const INCR_SCRIPT = `
  local v = redis.call("incrby", KEYS[1], ARGV[1])
  if v == tonumber(ARGV[1]) and tonumber(ARGV[2]) > 0 then
    redis.call("expire", KEYS[1], ARGV[2])
  end
  return v
`;

export class RedisCacheAdapter implements CacheClient {
  private readonly client: Redis;
  private readonly ownsClient: boolean;
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(config: CacheConfig) {
    this.client = config.client ?? createRedisClient(config.url);
    this.ownsClient = !config.client;
    this.prefix = config.prefix ?? 'mariachi';
    this.defaultTtl = config.defaultTtl ?? 3600;
  }

  /** The underlying ioredis client, for sharing with locks or idempotency stores. */
  get redis(): Redis {
    return this.client;
  }

  key(...segments: string[]): string {
    return [this.prefix, ...segments].join(':');
  }

  private serialize(value: unknown): string {
    return JSON.stringify(value);
  }

  private deserialize<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : this.deserialize<T>(raw);
    } catch (e) {
      throw new CacheError('cache/get-failed', 'Failed to get from cache', { key, cause: e });
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      if (ttl > 0) await this.client.set(key, this.serialize(value), 'EX', ttl);
      else await this.client.set(key, this.serialize(value));
    } catch (e) {
      throw new CacheError('cache/set-failed', 'Failed to set in cache', { key, cause: e });
    }
  }

  async setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    try {
      return (await this.client.set(key, this.serialize(value), 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (e) {
      throw new CacheError('cache/set-failed', 'Failed to set in cache', { key, cause: e });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (e) {
      throw new CacheError('cache/del-failed', 'Failed to delete from cache', { key, cause: e });
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async incr(key: string, by = 1, ttlSeconds = 0): Promise<number> {
    try {
      return Number(await this.client.eval(INCR_SCRIPT, 1, key, String(by), String(ttlSeconds)));
    } catch (e) {
      throw new CacheError('cache/incr-failed', 'Failed to increment', { key, cause: e });
    }
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const fullPattern = pattern.startsWith(`${this.prefix}:`) ? pattern : `${this.prefix}:${pattern}`;
    return scanKeys(this.client, fullPattern);
  }

  async flush(): Promise<void> {
    try {
      const keys = await scanKeys(this.client, `${this.prefix}:*`);
      for (let i = 0; i < keys.length; i += 500) {
        await this.client.unlink(...keys.slice(i, i + 500));
      }
    } catch (e) {
      throw new CacheError('cache/flush-failed', 'Failed to flush cache', { cause: e });
    }
  }

  async connect(): Promise<void> {
    await connectRedis(this.client);
  }

  async disconnect(): Promise<void> {
    if (this.ownsClient) await disconnectRedis(this.client);
  }

  isHealthy(): Promise<boolean> {
    return pingRedis(this.client);
  }
}
