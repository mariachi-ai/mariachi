import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { CacheError } from '@mariachi/core';
import type {
  CacheConfig,
  DistributedLock,
  LockAcquireOptions,
  LockAcquireResult,
  LockInfo,
  WithLockOptions,
} from './types';
import { connectRedis, createRedisClient, disconnectRedis, pingRedis } from './redis-client';

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

// Owned-lock scripts work on a JSON blob stored at the lock key. The blob
// contains `{ owner, metadata, acquiredAt, expiresAt }`. Scripts decode it to
// verify ownership before mutating, so any node that knows the owner token may
// release/extend (unlike the in-memory token used by acquire/release above).
const RELEASE_OWNED_SCRIPT = `
  local raw = redis.call("get", KEYS[1])
  if not raw then return 0 end
  local ok, data = pcall(cjson.decode, raw)
  if not ok then return 0 end
  if data.owner == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const EXTEND_OWNED_SCRIPT = `
  local raw = redis.call("get", KEYS[1])
  if not raw then return nil end
  local ok, data = pcall(cjson.decode, raw)
  if not ok then return nil end
  if data.owner ~= ARGV[1] then return nil end
  data.expiresAt = tonumber(ARGV[3])
  local encoded = cjson.encode(data)
  redis.call("set", KEYS[1], encoded, "PX", ARGV[2])
  return encoded
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RedisDistributedLock implements DistributedLock {
  private readonly client: Redis;
  private readonly ownsClient: boolean;
  private tokens = new Map<string, string>();

  constructor(config: CacheConfig) {
    this.client = config.client ?? createRedisClient(config.url);
    this.ownsClient = !config.client;
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

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const token = await this.acquireToken(key, ttlMs);
    if (!token) return false;
    this.tokens.set(key, token);
    return true;
  }

  async acquireToken(key: string, ttlMs: number): Promise<string | null> {
    const token = randomBytes(16).toString('hex');
    try {
      const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
      return result === 'OK' ? token : null;
    } catch (e) {
      throw new CacheError('lock/acquire-failed', 'Failed to acquire lock', { key, cause: e });
    }
  }

  async releaseToken(key: string, token: string): Promise<boolean> {
    try {
      return (await this.client.eval(RELEASE_SCRIPT, 1, key, token)) === 1;
    } catch (e) {
      throw new CacheError('lock/release-failed', 'Failed to release lock', { key, cause: e });
    }
  }

  async extendToken(key: string, token: string, ttlMs: number): Promise<boolean> {
    try {
      return (await this.client.eval(EXTEND_SCRIPT, 1, key, token, String(ttlMs))) === 1;
    } catch (e) {
      throw new CacheError('lock/extend-failed', 'Failed to extend lock', { key, cause: e });
    }
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>, options: WithLockOptions = {}): Promise<T> {
    const { waitMs = 0, retryIntervalMs = 50, autoExtend = true } = options;
    const deadline = Date.now() + waitMs;
    let token = await this.acquireToken(key, ttlMs);
    while (!token && Date.now() < deadline) {
      await sleep(retryIntervalMs);
      token = await this.acquireToken(key, ttlMs);
    }
    if (!token) throw new CacheError('lock/not-acquired', `Could not acquire lock ${key}`, { key });

    const held = token;
    const timer = autoExtend
      ? setInterval(() => {
          this.extendToken(key, held, ttlMs).catch(() => undefined);
        }, Math.max(10, Math.floor(ttlMs / 2)))
      : undefined;
    timer?.unref?.();
    try {
      return await fn();
    } finally {
      if (timer) clearInterval(timer);
      await this.releaseToken(key, held).catch(() => undefined);
    }
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

  async acquireOwned(key: string, opts: LockAcquireOptions): Promise<LockAcquireResult> {
    const now = Date.now();
    const info: LockInfo = {
      owner: opts.owner,
      metadata: opts.metadata ?? null,
      acquiredAt: now,
      expiresAt: now + opts.ttlMs,
    };
    const payload = JSON.stringify(info);

    try {
      const result = await this.client.set(key, payload, 'PX', opts.ttlMs, 'NX');
      if (result === 'OK') {
        return { acquired: true, info };
      }

      // Existing holder — surface their info so callers can show "locked by X".
      const existing = await this.inspect(key);
      if (!existing) {
        // Rare race: lock expired between our SET NX and GET. Retry once.
        const retry = await this.client.set(key, payload, 'PX', opts.ttlMs, 'NX');
        if (retry === 'OK') return { acquired: true, info };
      }
      return { acquired: false, info: existing ?? info };
    } catch (e) {
      throw new CacheError('lock/acquire-failed', 'Failed to acquire owned lock', { key, cause: e });
    }
  }

  async releaseOwned(key: string, owner: string): Promise<boolean> {
    try {
      const result = await this.client.eval(RELEASE_OWNED_SCRIPT, 1, key, owner);
      return result === 1;
    } catch (e) {
      throw new CacheError('lock/release-failed', 'Failed to release owned lock', { key, cause: e });
    }
  }

  async extendOwned(key: string, owner: string, ttlMs: number): Promise<LockInfo | null> {
    const newExpiresAt = Date.now() + ttlMs;
    try {
      const result = (await this.client.eval(
        EXTEND_OWNED_SCRIPT,
        1,
        key,
        owner,
        String(ttlMs),
        String(newExpiresAt),
      )) as string | null;
      if (!result) return null;
      return JSON.parse(result) as LockInfo;
    } catch (e) {
      throw new CacheError('lock/extend-failed', 'Failed to extend owned lock', { key, cause: e });
    }
  }

  async inspect(key: string): Promise<LockInfo | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<LockInfo>;
        if (typeof parsed?.owner !== 'string') return null;
        return {
          owner: parsed.owner,
          metadata: parsed.metadata ?? null,
          acquiredAt: typeof parsed.acquiredAt === 'number' ? parsed.acquiredAt : 0,
          expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
        };
      } catch {
        // Not an owned-lock payload (e.g. a random token from `acquire`).
        return null;
      }
    } catch (e) {
      throw new CacheError('lock/inspect-failed', 'Failed to inspect lock', { key, cause: e });
    }
  }
}
