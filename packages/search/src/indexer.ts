import type { SearchClient, SearchDocument, SearchIndex } from './types';

export class SearchIndexer {
  constructor(private client: SearchClient) {}

  async syncDocument(indexName: string, document: SearchDocument): Promise<void> {
    await this.client.indexDocument(indexName, document);
  }

  async removeDocument(indexName: string, documentId: string): Promise<void> {
    await this.client.removeDocument(indexName, documentId);
  }

  async reindexAll(
    indexName: string,
    index: SearchIndex,
    documents: SearchDocument[]
  ): Promise<void> {
    await this.client.deleteIndex(indexName);
    await this.client.createIndex(index);
    if (documents.length > 0) {
      await this.client.indexDocuments(indexName, documents);
    }
  }
}
