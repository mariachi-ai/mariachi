export interface SearchAnalyticsEntry {
  query: string;
  index: string;
  totalHits: number;
  latencyMs: number;
  userId?: string;
  tenantId?: string;
  timestamp: Date;
}

export class SearchAnalytics {
  private readonly entries: SearchAnalyticsEntry[] = [];
  private onRecord?: (entry: SearchAnalyticsEntry) => Promise<void>;

  constructor(config?: { onRecord?: (entry: SearchAnalyticsEntry) => Promise<void> }) {
    this.onRecord = config?.onRecord;
  }

  async record(entry: SearchAnalyticsEntry): Promise<void> {
    this.entries.push(entry);
    if (this.onRecord) {
      await this.onRecord(entry);
    }
  }

  getEntries(): SearchAnalyticsEntry[] {
    return [...this.entries];
  }

  getZeroResultQueries(): SearchAnalyticsEntry[] {
    return this.entries.filter(e => e.totalHits === 0);
  }
}
