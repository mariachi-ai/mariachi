export interface SearchAnalyticsEntry {
  query: string;
  index: string;
  totalHits: number;
  latencyMs: number;
  userId?: string;
  tenantId?: string;
  timestamp: Date;
}

export interface SearchAnalyticsStore {
  record(entry: SearchAnalyticsEntry): Promise<void>;
  recent(index: string, limit?: number): Promise<SearchAnalyticsEntry[]>;
}

/** Keeps analytics in memory. Use `RedisListAnalytics` when more than one instance is running. */
export class MemorySearchAnalytics implements SearchAnalyticsStore {
  readonly entries: SearchAnalyticsEntry[] = [];

  async record(entry: SearchAnalyticsEntry): Promise<void> {
    this.entries.push(entry);
  }

  async recent(index: string, limit = 100): Promise<SearchAnalyticsEntry[]> {
    return this.entries.filter((e) => e.index === index).slice(-limit);
  }
}

export interface RedisList {
  lpush(key: string, value: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

/** Appends analytics to a Redis list. Pass an ioredis client; this package does not open one. */
export class RedisListAnalytics implements SearchAnalyticsStore {
  constructor(private readonly redis: RedisList, private readonly key = 'search:analytics', private readonly max = 10_000) {}

  async record(entry: SearchAnalyticsEntry): Promise<void> {
    await this.redis.lpush(this.key, JSON.stringify({ ...entry, timestamp: entry.timestamp.toISOString() }));
    await this.redis.ltrim(this.key, 0, this.max - 1);
  }

  async recent(index: string, limit = 100): Promise<SearchAnalyticsEntry[]> {
    const raw = await this.redis.lrange(this.key, 0, this.max - 1);
    return raw
      .map((line) => JSON.parse(line) as SearchAnalyticsEntry & { timestamp: string })
      .filter((e) => e.index === index)
      .slice(0, limit)
      .map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  }
}

export class SearchAnalytics {
  private readonly entries: SearchAnalyticsEntry[] = [];
  private onRecord?: (entry: SearchAnalyticsEntry) => Promise<void>;
  private readonly store?: SearchAnalyticsStore;

  constructor(config?: { onRecord?: (entry: SearchAnalyticsEntry) => Promise<void>; store?: SearchAnalyticsStore }) {
    this.onRecord = config?.onRecord;
    this.store = config?.store;
  }

  async record(entry: SearchAnalyticsEntry): Promise<void> {
    this.entries.push(entry);
    if (this.store) await this.store.record(entry);
    if (this.onRecord) await this.onRecord(entry);
  }

  getEntries(): SearchAnalyticsEntry[] {
    return [...this.entries];
  }

  getZeroResultQueries(): SearchAnalyticsEntry[] {
    return this.entries.filter(e => e.totalHits === 0);
  }
}
