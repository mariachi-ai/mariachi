import type {
  Logger,
  Context,
  TracerAdapter,
  MetricsAdapter,
  Instrumentable,
} from '@mariachi/core';
import { withSpan, SearchError, resolveInstrumentation, type InstrumentationDeps } from '@mariachi/core';
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

  constructor(config: { client: SearchClient; analytics?: SearchAnalytics }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
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
      // Analytics is best-effort: a failing store must not fail the search.
      await this.analytics
        ?.record({ query: query.query, index: indexName, totalHits: result.total, latencyMs: durationMs, timestamp: new Date() })
        .catch((error: unknown) => {
          this.logger.warn({ traceId: ctx.traceId, index: indexName, error: (error as Error).message }, 'Search analytics write failed');
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

  isHealthy(): Promise<boolean> {
    return this.client.isHealthy();
  }
}

export class DefaultSearch extends Search {}
