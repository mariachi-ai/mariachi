import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { CacheError } from '@mariachi/core';
import type { CacheConfig, DistributedLock } from './types';

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const EXTEND_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

export class RedisDistributedLock implements DistributedLock {
  private client: Redis;
  private tokens = new Map<string, string>();

  constructor(config: CacheConfig) {
    const url = config.url ?? 'redis://localhost:6379';
    this.client = new Redis(url);
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const token = randomBytes(16).toString('hex');
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      this.tokens.set(key, token);
      return true;
    }
    return false;
  }

  async release(key: string): Promise<void> {
    const token = this.tokens.get(key);
    if (!token) return;
    try {
      await this.client.eval(RELEASE_SCRIPT, 1, key, token);
    } catch (e) {
      throw new CacheError('lock/release-failed', 'Failed to release lock', { key, cause: e });
    } finally {
      this.tokens.delete(key);
    }
  }

  async extend(key: string, ttlMs: number): Promise<boolean> {
    const token = this.tokens.get(key);
    if (!token) return false;
    try {
      const result = await this.client.eval(EXTEND_SCRIPT, 1, key, token, String(ttlMs));
      return result === 1;
    } catch (e) {
      throw new CacheError('lock/extend-failed', 'Failed to extend lock', { key, cause: e });
    }
  }
}
