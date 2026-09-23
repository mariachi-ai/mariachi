import { describe, expect, it } from 'vitest';
import type { SearchClient } from '@mariachi/search';

/** Behavior every `SearchClient` must share: Typesense, the memory adapter and the test double. */
export function searchContract(name: string, create: () => SearchClient | Promise<SearchClient>) {
  describe(`search contract: ${name}`, () => {
    const unique = (base: string) => `${base}_${crypto.randomUUID().slice(0, 8)}`;

    it('indexes, queries, filters and removes documents', async () => {
      const client = await create();
      await client.connect();
      expect(await client.isHealthy()).toBe(true);
      const posts = unique('posts');
      await client.createIndex({
        name: posts,
        fields: [{ name: 'title', type: 'string' }, { name: 'tags', type: 'string[]', facet: true }, { name: 'views', type: 'int32' }],
      });
      await client.indexDocuments(posts, [
        { id: '1', title: 'Mariachi band', tags: ['music', 'a&&b'], views: 10 },
        { id: '2', title: 'Brass section', tags: ['music'], views: 5 },
      ]);
      expect((await client.search(posts, { query: 'mariachi' })).hits.map((h) => h.document.id)).toEqual(['1']);
      expect((await client.search(posts, { query: '*', filters: { tags: 'a&&b' } })).hits.map((h) => h.document.id)).toEqual(['1']);
      expect((await client.search(posts, { query: '*' })).total).toBe(2);
      await client.removeDocument(posts, '1');
      expect((await client.search(posts, { query: 'mariachi' })).total).toBe(0);
      await client.deleteIndex(posts);
    });

    it('rejects unknown field types, duplicate and missing indexes', async () => {
      const client = await create();
      await client.connect();
      // @ts-expect-error an unsupported type must fail at runtime too
      await expect(client.createIndex({ name: unique('bad'), fields: [{ name: 't', type: 'mystery' }] })).rejects.toMatchObject({
        code: 'search/invalid-field-type',
      });
      const metrics = unique('metrics');
      await client.createIndex({ name: metrics, fields: [{ name: 'count', type: 'int32' }] });
      await expect(client.createIndex({ name: metrics, fields: [{ name: 'count', type: 'int32' }] })).rejects.toMatchObject({
        code: 'search/index-exists',
      });
      await expect(client.search(metrics, { query: '1' })).rejects.toMatchObject({ code: 'search/missing-query-fields' });
      await expect(client.search(unique('missing'), { query: 'x', queryBy: ['title'] })).rejects.toMatchObject({ code: 'search/index-not-found' });
      await client.deleteIndex(metrics);
    });

    it('swaps an alias to a rebuilt index', async () => {
      const client = await create();
      await client.connect();
      if (!client.reindexAlias) return;
      const alias = unique('products');
      const index = { name: alias, fields: [{ name: 'title', type: 'string' as const }] };
      await client.reindexAlias(alias, index, [{ id: '1', title: 'hat' }]);
      await client.reindexAlias(alias, index, [{ id: '2', title: 'scarf' }]);
      expect((await client.search(alias, { query: 'hat' })).total).toBe(0);
      expect((await client.search(alias, { query: 'scarf' })).total).toBe(1);
    });
  });
}
