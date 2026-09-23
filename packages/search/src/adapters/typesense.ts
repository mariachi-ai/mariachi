import Typesense from 'typesense';
import { SearchError } from '@mariachi/core';
import { isText, mapFieldType } from '../field-types';
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

/**
 * Builds `filter_by` from equality filters. Strings are backtick-quoted so values containing
 * `&&`, `,` or `:` stay values; a value containing a backtick is rejected.
 */
export function buildFilterBy(filters?: Record<string, string | number | boolean>): string | undefined {
  if (!filters || Object.keys(filters).length === 0) return undefined;
  return Object.entries(filters)
    .map(([k, v]) => {
      if (!/^[A-Za-z0-9_.]+$/.test(k)) throw new SearchError('search/invalid-input', `Invalid filter field "${k}"`);
      if (typeof v === 'boolean' || typeof v === 'number') return `${k}:=${v}`;
      if (v.includes('`')) throw new SearchError('search/invalid-input', `Filter value for "${k}" cannot contain a backtick`);
      return `${k}:=\`${v}\``;
    })
    .join(' && ');
}

/** Maps a Typesense client error to a SearchError, keeping 404 and 409 distinguishable. */
function toSearchError(e: unknown, fallback: string, message: string, meta: Record<string, unknown> = {}): SearchError {
  if (e instanceof SearchError) return e;
  const status = (e as { httpStatus?: number }).httpStatus;
  const code = status === 404 ? 'search/index-not-found' : status === 409 ? 'search/index-exists' : fallback;
  return new SearchError(code, message, { ...meta, cause: e instanceof Error ? e.message : String(e) });
}

export class TypesenseSearchAdapter implements SearchClient {
  private client: InstanceType<typeof Typesense.Client>;
  private schemas = new Map<string, SearchIndex>();

  constructor(config: { url: string; apiKey: string }) {
    const parsed = new URL(config.url);
    const protocol = parsed.protocol.replace(':', '') as 'http' | 'https';
    const port = Number.parseInt(parsed.port || (protocol === 'https' ? '443' : '80'), 10);
    this.client = new Typesense.Client({
      nodes: [{ host: parsed.hostname, port, protocol }],
      apiKey: config.apiKey,
    });
  }

  /** Loads every collection schema and alias from the server, which is where they persist. */
  async connect(): Promise<void> {
    const collections = await this.client.collections().retrieve();
    for (const collection of collections) this.schemas.set(collection.name, toIndex(collection.name, collection.fields));
    const { aliases } = await this.client.aliases().retrieve();
    for (const alias of aliases) {
      const target = this.schemas.get(alias.collection_name);
      if (target) this.schemas.set(alias.name, { ...target, name: alias.name });
    }
  }

  /** Cached schema, else read from the server (Typesense resolves aliases), so other processes' indexes work. */
  private async schemaFor(name: string): Promise<SearchIndex | undefined> {
    const cached = this.schemas.get(name);
    if (cached) return cached;
    try {
      const collection = await this.client.collections(name).retrieve();
      const index = toIndex(name, collection.fields);
      this.schemas.set(name, index);
      return index;
    } catch {
      return undefined;
    }
  }

  async disconnect(): Promise<void> {}

  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.client.health.retrieve();
      return health.ok === true;
    } catch {
      return false;
    }
  }

  async createIndex(index: SearchIndex): Promise<void> {
    const sortName = index.defaultSortingField;
    const fields = index.fields.map((f) => {
      const type = mapFieldType(f.type);
      return {
        name: f.name,
        type,
        facet: f.facet ?? false,
        // Typesense refuses an optional default sorting field.
        optional: f.name !== sortName,
        sort: f.sort ?? (!type.endsWith('[]') && type !== 'string'),
        index: f.index ?? true,
      };
    });
    const sortField = sortName ? fields.find((f) => f.name === sortName) : undefined;
    if (sortName && (!sortField || !['int32', 'int64', 'float'].includes(sortField.type))) {
      throw new SearchError('search/invalid-input', `defaultSortingField ${sortName} must be a numeric field of ${index.name}`);
    }
    try {
      await this.client.collections().create({ name: index.name, fields, ...(sortName ? { default_sorting_field: sortName } : {}) });
    } catch (e) {
      throw toSearchError(e, 'search/request-failed', `Failed to create index ${index.name}`);
    }
    this.schemas.set(index.name, index);
  }

  async deleteIndex(name: string): Promise<void> {
    this.schemas.delete(name);
    try {
      await this.client.collections(name).delete();
    } catch (e) {
      throw toSearchError(e, 'search/request-failed', 'Failed to delete index');
    }
  }

  async indexDocument(indexName: string, document: SearchDocument): Promise<void> {
    try {
      await this.client.collections(indexName).documents().upsert(document);
    } catch (e) {
      throw toSearchError(e, 'search/request-failed', 'Failed to index document');
    }
  }

  async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
    try {
      await this.client.collections(indexName).documents().import(documents, {
        action: 'upsert',
      });
    } catch (e) {
      throw toSearchError(e, 'search/request-failed', 'Failed to index documents');
    }
  }

  async removeDocument(indexName: string, documentId: string): Promise<void> {
    try {
      await this.client.collections(indexName).documents(documentId).delete();
    } catch (e) {
      throw toSearchError(e, 'search/request-failed', 'Failed to remove document');
    }
  }

  async search<T = SearchDocument>(
    indexName: string,
    query: SearchQuery
  ): Promise<SearchResult<T>> {
    const schema = query.queryBy?.length ? undefined : await this.schemaFor(indexName);
    const stringFields = schema?.fields.filter((f) => isText(f.type)).map((f) => f.name);
    const queryByFields = query.queryBy?.length ? query.queryBy : stringFields;
    if (!queryByFields?.length) {
      throw new SearchError('search/missing-query-fields', `Collection ${indexName} has no string fields to query. Pass query.queryBy.`);
    }
    const queryBy = queryByFields.join(',');
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
      throw toSearchError(e, 'search/query-failed', `Search on ${indexName} failed`);
    }
  }

  /**
   * Builds a new physical collection, points `alias` at it, then drops the collection the alias
   * used before. Readers never see a half-built index.
   */
  async reindexAlias(alias: string, index: SearchIndex, documents: SearchDocument[]): Promise<void> {
    let previous: string | undefined;
    try {
      previous = (await this.client.aliases(alias).retrieve()).collection_name;
    } catch {
      previous = undefined;
    }
    if (!previous && (await this.collectionExists(alias))) {
      throw new SearchError(
        'search/alias-conflict',
        `A collection named ${alias} exists; rename or delete it before reindexing through an alias`,
      );
    }
    const physical = `${alias}_${Date.now()}`;
    await this.createIndex({ ...index, name: physical });
    try {
      if (documents.length > 0) await this.indexDocuments(physical, documents);
      await this.client.aliases().upsert(alias, { collection_name: physical });
    } catch (e) {
      await this.client.collections(physical).delete().catch(() => undefined);
      throw toSearchError(e, 'search/request-failed', `Failed to reindex ${alias}`);
    }
    this.schemas.set(alias, { ...index, name: alias });
    if (previous && previous !== physical) {
      this.schemas.delete(previous);
      await this.client.collections(previous).delete().catch(() => undefined);
    }
  }

  private async collectionExists(name: string): Promise<boolean> {
    try {
      await this.client.collections(name).retrieve();
      return true;
    } catch {
      return false;
    }
  }
}

function toIndex(name: string, fields: Array<{ name: string; type: string; facet?: boolean; index?: boolean; sort?: boolean }> | undefined): SearchIndex {
  return {
    name,
    // Fields of types the framework doesn't model (geopoint, object, auto) are skipped, not fatal.
    fields: (fields ?? []).flatMap((field) => {
      if (field.name === 'id' || field.name.includes('.*')) return [];
      try {
        mapFieldType(field.type);
      } catch {
        return [];
      }
      return [{ name: field.name, type: field.type as SearchIndex['fields'][number]['type'], facet: field.facet, index: field.index, sort: field.sort }];
    }),
  };
}
