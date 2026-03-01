import Redis from 'ioredis';
import { CacheError } from '@mariachi/core';
import type { CacheConfig, CacheClient } from '../types';

export class RedisCacheAdapter implements CacheClient {
  private client: Redis;
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(config: CacheConfig) {
    const url = config.url ?? 'redis://localhost:6379';
    this.client = new Redis(url);
    this.prefix = config.prefix ?? 'mariachi';
    this.defaultTtl = config.defaultTtl ?? 3600;
  }

  key(...segments: string[]): string {
    return [this.prefix, ...segments].join(':');
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as T;
      }
    } catch (e) {
      throw new CacheError('cache/get-failed', 'Failed to get from cache', { key, cause: e });
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const ttl = ttlSeconds ?? this.defaultTtl;
      if (ttl > 0) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
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
    const result = await this.client.exists(key);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    const fullPattern = pattern.startsWith(this.prefix) ? pattern : `${this.prefix}:${pattern}`;
    const keys = await this.client.keys(fullPattern);
    return keys;
  }

  async flush(): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.prefix}:*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (e) {
      throw new CacheError('cache/flush-failed', 'Failed to flush cache', { cause: e });
    }
  }

  async connect(): Promise<void> {
    await this.client.ping();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
