import type { CacheClient, CacheConfig } from '../types';

interface Entry {
  value: string;
  expiresAt: number | null;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** Single-process cache for local development and tests. Values are JSON-serialized like Redis. */
export class MemoryCacheAdapter implements CacheClient {
  private readonly store = new Map<string, Entry>();
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(config: Partial<CacheConfig> = {}) {
    this.prefix = config.prefix ?? 'mariachi';
    this.defaultTtl = config.defaultTtl ?? 3600;
  }

  key(...segments: string[]): string {
    return [this.prefix, ...segments].join(':');
  }

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private write(key: string, value: unknown, ttlSeconds: number) {
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async get<T = string>(key: string): Promise<T | null> {
    const entry = this.live(key);
    return entry ? (JSON.parse(entry.value) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.write(key, value, ttlSeconds ?? this.defaultTtl);
  }

  async setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    if (this.live(key)) return false;
    this.write(key, value, ttlSeconds);
    return true;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.live(key) !== undefined;
  }

  async incr(key: string, by = 1, ttlSeconds = 0): Promise<number> {
    const entry = this.live(key);
    if (!entry) {
      this.write(key, by, ttlSeconds);
      return by;
    }
    const next = Number(JSON.parse(entry.value)) + by;
    entry.value = JSON.stringify(next);
    return next;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  async keys(pattern: string): Promise<string[]> {
    const full = pattern.startsWith(`${this.prefix}:`) ? pattern : `${this.prefix}:${pattern}`;
    const re = globToRegExp(full);
    return [...this.store.keys()].filter((k) => this.live(k) && re.test(k));
  }

  async flush(): Promise<void> {
    for (const k of [...this.store.keys()]) if (k.startsWith(`${this.prefix}:`)) this.store.delete(k);
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isHealthy(): Promise<boolean> {
    return true;
  }
}
