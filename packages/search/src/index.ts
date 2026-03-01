import type { SearchConfig, SearchClient } from './types';
import { SearchError } from '@mariachi/core';
import { TypesenseSearchAdapter } from './adapters/typesense';

export type {
  SearchConfig,
  SearchDocument,
  SearchQuery,
  SearchResult,
  SearchIndex,
  SearchClient,
} from './types';

export function createSearch(config: SearchConfig): SearchClient {
  if (config.adapter === 'typesense') {
    const url = config.url ?? 'http://localhost:8108';
    const apiKey = config.apiKey ?? '';
    return new TypesenseSearchAdapter({ url, apiKey });
  }
  throw new SearchError('search/unknown-adapter', `Unknown search adapter: ${config.adapter}`);
}

export { SearchIndexer } from './indexer';
export { TypesenseSearchAdapter } from './adapters/typesense';
export { Search, DefaultSearch } from './search';
export { SearchAnalytics } from './analytics';
export type { SearchAnalyticsEntry } from './analytics';
