export interface CacheConfig {
  adapter: string;
  url?: string;
  prefix?: string;
  defaultTtl?: number;
}

export interface CacheClient {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
  flush(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  key(...segments: string[]): string;
}

export interface DistributedLock {
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
  extend(key: string, ttlMs: number): Promise<boolean>;
}
