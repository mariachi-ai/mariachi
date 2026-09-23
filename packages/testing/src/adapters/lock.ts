import { CacheError } from '@mariachi/core';
import type { DistributedLock, LockAcquireOptions, LockAcquireResult, LockInfo } from '@mariachi/cache';

interface Held {
  token: string;
  owner?: string;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

/** Single-process lock double. Enough for tests that need acquire/release ordering. */
export class TestLock implements DistributedLock {
  private readonly held = new Map<string, Held>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> { this.held.clear(); }
  async isHealthy(): Promise<boolean> { return true; }

  private live(key: string): Held | undefined {
    const item = this.held.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      this.held.delete(key);
      return undefined;
    }
    return item;
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    return (await this.acquireToken(key, ttlMs)) !== null;
  }

  async acquireToken(key: string, ttlMs: number): Promise<string | null> {
    if (this.live(key)) return null;
    const token = crypto.randomUUID();
    this.held.set(key, { token, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async release(key: string): Promise<void> { this.held.delete(key); }

  async releaseToken(key: string, token: string): Promise<boolean> {
    const item = this.live(key);
    if (!item || item.token !== token) return false;
    this.held.delete(key);
    return true;
  }

  async extend(key: string, ttlMs: number): Promise<boolean> {
    const item = this.live(key);
    if (!item) return false;
    item.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async extendToken(key: string, token: string, ttlMs: number): Promise<boolean> {
    const item = this.live(key);
    if (!item || item.token !== token) return false;
    item.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = await this.acquireToken(key, ttlMs);
    if (!token) throw new CacheError('lock/not-acquired', `Lock ${key} is held`);
    try { return await fn(); } finally { await this.releaseToken(key, token); }
  }

  async acquireOwned(key: string, opts: LockAcquireOptions): Promise<LockAcquireResult> {
    const current = this.live(key);
    if (current && current.owner !== opts.owner) return { acquired: false, info: this.info(key, current) };
    this.held.set(key, { token: opts.owner, owner: opts.owner, expiresAt: Date.now() + opts.ttlMs, metadata: opts.metadata });
    return { acquired: true, info: this.info(key, this.held.get(key)!) };
  }

  async releaseOwned(key: string, owner: string): Promise<boolean> {
    const item = this.live(key);
    if (!item || item.owner !== owner) return false;
    this.held.delete(key);
    return true;
  }

  async extendOwned(key: string, owner: string, ttlMs: number): Promise<LockInfo | null> {
    const item = this.live(key);
    if (!item || item.owner !== owner) return null;
    item.expiresAt = Date.now() + ttlMs;
    return this.info(key, item);
  }

  async inspect(key: string): Promise<LockInfo | null> {
    const item = this.live(key);
    return item ? this.info(key, item) : null;
  }

  private info(_key: string, item: Held): LockInfo {
    return { owner: item.owner ?? item.token, metadata: item.metadata ?? null, acquiredAt: Date.now(), expiresAt: item.expiresAt };
  }
}
