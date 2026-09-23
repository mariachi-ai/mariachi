import { SearchError } from '@mariachi/core';
import { mapFieldType } from '../field-types';
import type { SearchClient, SearchDocument, SearchIndex, SearchQuery, SearchResult } from '../types';

interface Collection {
  index: SearchIndex;
  documents: Map<string, SearchDocument>;
}

/** In-process search used by tests and by the contract suite next to the Typesense adapter. */
export class MemorySearchAdapter implements SearchClient {
  private readonly collections = new Map<string, Collection>();
  private readonly aliases = new Map<string, string>();
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async isHealthy(): Promise<boolean> {
    return this.connected;
  }

  async createIndex(index: SearchIndex): Promise<void> {
    for (const field of index.fields) mapFieldType(field.type);
    if (this.collections.has(index.name)) throw new SearchError('search/index-exists', `Collection ${index.name} already exists`);
    this.collections.set(index.name, { index, documents: new Map() });
  }

  async deleteIndex(name: string): Promise<void> {
    this.collections.delete(this.resolve(name));
    this.aliases.delete(name);
  }

  async indexDocument(indexName: string, document: SearchDocument): Promise<void> {
    this.collection(indexName).documents.set(document.id, document);
  }

  async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
    for (const document of documents) await this.indexDocument(indexName, document);
  }

  async removeDocument(indexName: string, documentId: string): Promise<void> {
    this.collection(indexName).documents.delete(documentId);
  }

  async search<T = SearchDocument>(indexName: string, query: SearchQuery): Promise<SearchResult<T>> {
    const collection = this.collection(indexName);
    const fields = query.queryBy?.length
      ? query.queryBy
      : collection.index.fields.filter((f) => f.type === 'string' || f.type === 'string[]').map((f) => f.name);
    if (fields.length === 0 && query.query !== '*') {
      throw new SearchError('search/missing-query-fields', `Collection ${indexName} has no string fields to query. Pass query.queryBy.`);
    }
    const needle = query.query.toLowerCase();
    const hits = [...collection.documents.values()].filter((doc) => {
      if (query.filters) {
        for (const [key, value] of Object.entries(query.filters)) {
          const actual = doc[key];
          // Like Typesense, `field:=value` on an array field matches when the array contains it.
          if (Array.isArray(actual) ? !actual.includes(value) : actual !== value) return false;
        }
      }
      if (!needle || needle === '*') return true;
      return fields.some((field) => String(doc[field] ?? '').toLowerCase().includes(needle));
    });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const start = (page - 1) * pageSize;
    return {
      hits: hits.slice(start, start + pageSize).map((document) => ({ document: document as T, score: 1 })),
      total: hits.length,
      page,
      pageSize,
      queryTimeMs: 0,
    };
  }

  async reindexAlias(alias: string, index: SearchIndex, documents: SearchDocument[]): Promise<void> {
    const previous = this.aliases.get(alias);
    const physical = `${alias}_${Date.now()}_${this.collections.size}`;
    await this.createIndex({ ...index, name: physical });
    await this.indexDocuments(physical, documents);
    this.aliases.set(alias, physical);
    if (previous) this.collections.delete(previous);
  }

  private resolve(name: string): string {
    return this.aliases.get(name) ?? name;
  }

  private collection(name: string): Collection {
    const collection = this.collections.get(this.resolve(name));
    if (!collection) throw new SearchError('search/index-not-found', `Collection ${name} not found`);
    return collection;
  }
}
