import type {
  Logger,
  Context,
  TracerAdapter,
  MetricsAdapter,
  Instrumentable,
} from '@mariachi/core';
import { withSpan, getContainer, KEYS, SearchError } from '@mariachi/core';
import type { SearchClient, SearchQuery, SearchResult, SearchDocument } from './types';
import { SearchIndexer } from './indexer';
import type { SearchAnalytics } from './analytics';

export abstract class Search implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly client: SearchClient;
  protected readonly indexer: SearchIndexer;
  protected readonly analytics?: SearchAnalytics;

  constructor(config: { client: SearchClient; analytics?: SearchAnalytics }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.client = config.client;
    this.indexer = new SearchIndexer(config.client);
    this.analytics = config.analytics;
  }

  async search<T>(ctx: Context, indexName: string, query: SearchQuery): Promise<SearchResult<T>> {
    return withSpan(this.tracer, 'search.query', { index: indexName, query: query.query }, async () => {
      const start = performance.now();
      const result = await this.client.search<T>(indexName, query);
      const durationMs = performance.now() - start;
      this.logger.info({ traceId: ctx.traceId, index: indexName, query: query.query, hits: result.total, durationMs }, 'Search query');
      this.metrics?.histogram('search.query.latency', durationMs, { index: indexName });
      this.metrics?.increment('search.query.count', 1, { index: indexName });
      if (result.total === 0) this.metrics?.increment('search.query.zero_results', 1, { index: indexName });
      await this.analytics?.record({
        query: query.query,
        index: indexName,
        totalHits: result.total,
        latencyMs: durationMs,
        timestamp: new Date(),
      });
      return result;
    });
  }

  async indexDocument(ctx: Context, indexName: string, document: SearchDocument): Promise<void> {
    return withSpan(this.tracer, 'search.indexDocument', { index: indexName, docId: document.id }, async () => {
      await this.indexer.syncDocument(indexName, document);
      this.logger.info({ traceId: ctx.traceId, index: indexName, docId: document.id }, 'Document indexed');
      this.metrics?.increment('search.document.indexed', 1, { index: indexName });
    });
  }

  async removeDocument(ctx: Context, indexName: string, documentId: string): Promise<void> {
    return withSpan(this.tracer, 'search.removeDocument', { index: indexName, docId: documentId }, async () => {
      await this.indexer.removeDocument(indexName, documentId);
      this.logger.info({ traceId: ctx.traceId, index: indexName, docId: documentId }, 'Document removed');
      this.metrics?.increment('search.document.removed', 1, { index: indexName });
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}

export class DefaultSearch extends Search {}
