export interface SearchConfig {
  adapter: string;
  url?: string;
  apiKey?: string;
}

export interface SearchDocument {
  id: string;
  [key: string]: unknown;
}

export type SearchScalarType = 'string' | 'number' | 'int' | 'int32' | 'int64' | 'float' | 'bool' | 'boolean';
/** A scalar type, or an array of one (`'string[]'`). */
export type SearchFieldType = SearchScalarType | `${SearchScalarType}[]`;

export interface SearchQuery {
  query: string;
  /** Fields to search. Required when the collection schema has no string fields. */
  queryBy?: string[];
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

export interface SearchField {
  name: string;
  type: SearchFieldType;
  facet?: boolean;
  sort?: boolean;
  index?: boolean;
}

export interface SearchIndex {
  name: string;
  fields: SearchField[];
  /**
   * Numeric field used to rank ties when no `sort` is given (Typesense `default_sorting_field`).
   * Every document must then have it; other fields are optional.
   */
  defaultSortingField?: string;
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
  /**
   * Builds a new physical collection and points `alias` at it, so readers keep
   * using the alias while the previous collection is replaced.
   */
  reindexAlias?(alias: string, index: SearchIndex, documents: SearchDocument[]): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
