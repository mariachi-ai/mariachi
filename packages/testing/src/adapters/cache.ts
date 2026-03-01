import type { CacheClient } from '../types';

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

export class TestCacheClient implements CacheClient {
  private store = new Map<string, MemoryEntry>();
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(config?: { prefix?: string; defaultTtl?: number }) {
    this.prefix = config?.prefix ?? 'mariachi';
    this.defaultTtl = config?.defaultTtl ?? 3600;
  }

  key(...segments: string[]): string {
    return [this.prefix, ...segments].filter(Boolean).join(':');
  }

  private evictIfExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
    }
  }

  async get<T = string>(key: string): Promise<T | null> {
    this.evictIfExpired(key);
    const entry = this.store.get(key);
    if (!entry) return null;
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl;
    const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : 0;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    this.evictIfExpired(key);
    return this.store.has(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    const result: string[] = [];
    for (const key of this.store.keys()) {
      this.evictIfExpired(key);
      if (regex.test(key)) result.push(key);
    }
    return result;
  }

  async flush(): Promise<void> {
    this.store.clear();
  }

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}
