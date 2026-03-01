import Typesense from 'typesense';
import { SearchError } from '@mariachi/core';
import type {
  SearchClient,
  SearchDocument,
  SearchIndex,
  SearchQuery,
  SearchResult,
} from '../types';

interface TypesenseFacetCount {
  field_name: string;
  counts: Array<{ value: string; count: number }>;
}

const TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'float',
  int: 'int32',
  int32: 'int32',
  int64: 'int64',
  float: 'float',
  bool: 'bool',
  boolean: 'bool',
};

function mapFieldType(type: string): string {
  return TYPE_MAP[type.toLowerCase()] ?? 'string';
}

function buildFilterBy(filters?: Record<string, string | number | boolean>): string | undefined {
  if (!filters || Object.keys(filters).length === 0) return undefined;
  return Object.entries(filters)
    .map(([k, v]) => {
      if (typeof v === 'boolean') return `${k}:=${v}`;
      if (typeof v === 'number') return `${k}:=${v}`;
      return `${k}:=${String(v)}`;
    })
    .join(' && ');
}

export class TypesenseSearchAdapter implements SearchClient {
  private client: InstanceType<typeof Typesense.Client>;
  private schemas = new Map<string, SearchIndex>();

  constructor(config: { url: string; apiKey: string }) {
    const parsed = new URL(config.url);
    const protocol = parsed.protocol.replace(':', '') as 'http' | 'https';
    const port = parseInt(parsed.port || (protocol === 'https' ? '443' : '80'), 10);
    this.client = new Typesense.Client({
      nodes: [{ host: parsed.hostname, port, protocol }],
      apiKey: config.apiKey,
    });
  }

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async createIndex(index: SearchIndex): Promise<void> {
    this.schemas.set(index.name, index);
    const schema = {
      name: index.name,
      fields: index.fields.map((f) => ({
        name: f.name,
        type: mapFieldType(f.type) as 'string' | 'int32' | 'int64' | 'float' | 'bool',
        facet: f.facet ?? false,
        optional: true,
        sort: f.sort ?? (f.type !== 'string'),
        index: f.index ?? true,
      })),
      default_sorting_field: index.fields.find((f) => f.sort)?.name,
    };
    try {
      await this.client.collections().create(schema);
    } catch (e) {
      throw new SearchError('SEARCH_ERROR', 'Failed to create index', { cause: e });
    }
  }

  async deleteIndex(name: string): Promise<void> {
    this.schemas.delete(name);
    try {
      await this.client.collections(name).delete();
    } catch (e) {
      throw new SearchError('SEARCH_ERROR', 'Failed to delete index', { cause: e });
    }
  }

  async indexDocument(indexName: string, document: SearchDocument): Promise<void> {
    try {
      await this.client.collections(indexName).documents().upsert(document);
    } catch (e) {
      throw new SearchError('SEARCH_ERROR', 'Failed to index document', { cause: e });
    }
  }

  async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
    try {
      await this.client.collections(indexName).documents().import(documents, {
        action: 'upsert',
      });
    } catch (e) {
      throw new SearchError('SEARCH_ERROR', 'Failed to index documents', { cause: e });
    }
  }

  async removeDocument(indexName: string, documentId: string): Promise<void> {
    try {
      await this.client.collections(indexName).documents(documentId).delete();
    } catch (e) {
      throw new SearchError('SEARCH_ERROR', 'Failed to remove document', { cause: e });
    }
  }

  async search<T = SearchDocument>(
    indexName: string,
    query: SearchQuery
  ): Promise<SearchResult<T>> {
    const schema = this.schemas.get(indexName);
    const stringFields = schema?.fields
      .filter((f) => mapFieldType(f.type) === 'string')
      .map((f) => f.name);
    const queryBy = stringFields?.length ? stringFields.join(',') : '.*';
    const searchParams: Record<string, unknown> = {
      q: query.query || '*',
      query_by: queryBy,
      page: query.page ?? 1,
      per_page: query.pageSize ?? 10,
    };
    const filterBy = buildFilterBy(query.filters);
    if (filterBy) searchParams.filter_by = filterBy;
    if (query.facets?.length) searchParams.facet_by = query.facets.join(',');
    if (query.sort) searchParams.sort_by = query.sort;

    try {
      const result = await this.client
        .collections(indexName)
        .documents()
        .search(searchParams);

      const facetCounts: Record<string, Array<{ value: string; count: number }>> = {};
      if (result.facet_counts) {
        for (const fc of result.facet_counts as TypesenseFacetCount[]) {
          facetCounts[fc.field_name] = fc.counts.map((c: { value: string; count: number }) => ({
            value: c.value,
            count: c.count,
          }));
        }
      }

      const hits = result.hits ?? [];
      return {
        hits: hits.map((h) => {
          const doc = h.document;
          const highlights = h.highlights;
          const highlightMap: Record<string, string> = {};
          if (Array.isArray(highlights)) {
            for (const hl of highlights as Array<{ field: string; snippet?: string }>) {
              highlightMap[hl.field] = hl.snippet ?? '';
            }
          }
          return {
            document: doc as T,
            score: h.text_match ?? 0,
            highlights: Object.keys(highlightMap).length > 0 ? highlightMap : undefined,
          };
        }),
        total: result.found ?? 0,
        page: result.page ?? 1,
        pageSize: (result as { per_page?: number }).per_page ?? query.pageSize ?? 10,
        facetCounts: Object.keys(facetCounts).length > 0 ? facetCounts : undefined,
        queryTimeMs: result.search_time_ms ?? 0,
      };
    } catch (e) {
      throw new SearchError('SEARCH_ERROR', 'Search failed', { cause: e });
    }
  }
}
