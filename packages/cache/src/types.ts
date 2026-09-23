import type Redis from 'ioredis';

export interface CacheConfig {
  adapter: string;
  url?: string;
  prefix?: string;
  defaultTtl?: number;
  /** Reuse an existing ioredis client instead of opening a new connection. */
  client?: Redis;
}

export interface CacheClient {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  /** Sets only if absent. Returns true if the value was written. */
  setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /** Atomically increments `key` by `by`. `ttlSeconds` is applied only when the key is created. */
  incr(key: string, by?: number, ttlSeconds?: number): Promise<number>;
  /** Remaining TTL in seconds; -1 = no TTL, -2 = missing. */
  ttl(key: string): Promise<number>;
  /** Iterates keys with SCAN (never KEYS). Prefix is applied automatically. */
  keys(pattern: string): Promise<string[]>;
  /** Deletes every key under this client's prefix (SCAN + UNLINK in batches). */
  flush(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
  key(...segments: string[]): string;
}

/**
 * Metadata returned when inspecting or successfully acquiring an owned lock.
 *
 * Owned locks (see `acquireOwned`) identify their holder by a caller-supplied
 * `owner` string (e.g. a user id, session id, or pod id). This enables
 * collaborative scenarios where multiple actors share a single lock service
 * process and ownership must survive restarts or span multiple nodes.
 * The owner string is a capability: anyone who knows it can release the lock.
 */
export interface LockInfo {
  owner: string;
  metadata: Record<string, unknown> | null;
  acquiredAt: number;
  expiresAt: number;
}

export interface LockAcquireOptions {
  owner: string;
  ttlMs: number;
  metadata?: Record<string, unknown>;
}

export interface LockAcquireResult {
  acquired: boolean;
  /**
   * When `acquired` is true, this is the newly-acquired lock's info.
   * When `acquired` is false, this is the current holder's info (or the
   * requested lock info if the holder record could not be read for any reason).
   */
  info: LockInfo;
}

export interface WithLockOptions {
  /** How long to keep retrying acquisition. Default 0 (fail immediately). */
  waitMs?: number;
  retryIntervalMs?: number;
  /** Extend the lock every ttl/2 while `fn` runs. Default true. */
  autoExtend?: boolean;
}

export interface DistributedLock {
  /**
   * Acquire a transient, node-local lock. The underlying token is stored
   * in-memory on this process; only this process instance can release it.
   * Prefer `acquireToken` or `withLock` for cross-process work.
   */
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
  extend(key: string, ttlMs: number): Promise<boolean>;

  /** Acquire and return the fencing token (or null). Release with `releaseToken`. */
  acquireToken(key: string, ttlMs: number): Promise<string | null>;
  releaseToken(key: string, token: string): Promise<boolean>;
  extendToken(key: string, token: string, ttlMs: number): Promise<boolean>;

  /**
   * Runs `fn` while holding `key`, extending the lock while `fn` runs and always releasing it.
   * Throws `CacheError('lock/not-acquired')` if the lock can't be taken within `waitMs`.
   */
  withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>, options?: WithLockOptions): Promise<T>;

  /**
   * Acquire an owner-identified lock. The caller supplies an `owner` token
   * (e.g. a user id) which is stored in Redis alongside optional metadata.
   * Any process that knows the owner token can release or extend the lock,
   * which makes this the right primitive for:
   *   - collaborative editing (only the holder user may release)
   *   - presence indicators (UIs need to see who currently holds the lock)
   *   - cross-instance coordination (ownership survives app restarts)
   */
  acquireOwned(key: string, opts: LockAcquireOptions): Promise<LockAcquireResult>;
  /** Atomically release an owned lock iff `owner` matches the current holder. */
  releaseOwned(key: string, owner: string): Promise<boolean>;
  /** Atomically extend an owned lock's TTL iff `owner` matches. Returns updated info or `null`. */
  extendOwned(key: string, owner: string, ttlMs: number): Promise<LockInfo | null>;
  /** Read the current lock info without taking or modifying the lock. Returns `null` if unheld. */
  inspect(key: string): Promise<LockInfo | null>;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
