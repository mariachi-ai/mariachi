export interface SearchConfig {
  adapter: string;
  url?: string;
  apiKey?: string;
}

export interface SearchDocument {
  id: string;
  [key: string]: unknown;
}

export interface SearchQuery {
  query: string;
  filters?: Record<string, string | number | boolean>;
  facets?: string[];
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface SearchResult<T = SearchDocument> {
  hits: Array<{
    document: T;
    score: number;
    highlights?: Record<string, string>;
  }>;
  total: number;
  page: number;
  pageSize: number;
  facetCounts?: Record<
    string,
    Array<{ value: string; count: number }>
  >;
  queryTimeMs: number;
}

export interface SearchIndex {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    facet?: boolean;
    sort?: boolean;
    index?: boolean;
  }>;
}

export interface SearchClient {
  createIndex(index: SearchIndex): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  indexDocument(indexName: string, document: SearchDocument): Promise<void>;
  indexDocuments(
    indexName: string,
    documents: SearchDocument[]
  ): Promise<void>;
  removeDocument(indexName: string, documentId: string): Promise<void>;
  search<T = SearchDocument>(
    indexName: string,
    query: SearchQuery
  ): Promise<SearchResult<T>>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
