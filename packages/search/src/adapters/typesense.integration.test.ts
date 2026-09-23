import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Typesense from 'typesense';
import { startTypesense, stopAll } from '../../../../test/setup';
import { TypesenseSearchAdapter } from './typesense';

let config: { url: string; apiKey: string };
const run = crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  config = await startTypesense();
}, 180_000);

afterAll(async () => {
  await stopAll();
});

function admin() {
  const url = new URL(config.url);
  return new Typesense.Client({ nodes: [{ host: url.hostname, port: Number(url.port), protocol: 'http' }], apiKey: config.apiKey });
}

describe('TypesenseSearchAdapter', () => {
  it('searches an alias from a fresh process and drops the replaced collection', async () => {
    const writer = new TypesenseSearchAdapter(config);
    await writer.connect();
    const alias = `products_${run}`;
    const index = { name: alias, fields: [{ name: 'title', type: 'string' as const }, { name: 'price', type: 'float' as const }] };
    await writer.reindexAlias(alias, index, [{ id: '1', title: 'hat', price: 10 }]);
    const first = (await admin().aliases(alias).retrieve()).collection_name;
    await writer.reindexAlias(alias, index, [{ id: '2', title: 'scarf', price: 20 }]);
    await expect(admin().collections(first).retrieve()).rejects.toBeDefined();

    // A process that never created the index: schema comes from the server, through the alias.
    const reader = new TypesenseSearchAdapter(config);
    expect((await reader.search(alias, { query: 'scarf' })).total).toBe(1);
    const restarted = new TypesenseSearchAdapter(config);
    await restarted.connect();
    expect((await restarted.search(alias, { query: 'scarf' })).total).toBe(1);
    expect(await restarted.isHealthy()).toBe(true);
  });

  it('refuses to shadow an existing collection with an alias', async () => {
    const search = new TypesenseSearchAdapter(config);
    const name = `plain_${run}`;
    await search.createIndex({ name, fields: [{ name: 'title', type: 'string' }] });
    await expect(search.reindexAlias(name, { name, fields: [{ name: 'title', type: 'string' }] }, [])).rejects.toMatchObject({
      code: 'search/alias-conflict',
    });
  });

  it('ranks ties by a declared default sorting field', async () => {
    const search = new TypesenseSearchAdapter(config);
    const name = `ranked_${run}`;
    await search.createIndex({ name, defaultSortingField: 'score', fields: [{ name: 'title', type: 'string' }, { name: 'score', type: 'int32' }] });
    await search.indexDocuments(name, [{ id: 'a', title: 'item', score: 1 }, { id: 'b', title: 'item', score: 9 }]);
    expect((await search.search(name, { query: 'item' })).hits.map((h) => h.document.id)).toEqual(['b', 'a']);
    await expect(search.createIndex({ name: `bad_${run}`, defaultSortingField: 'title', fields: [{ name: 'title', type: 'string' }] }))
      .rejects.toMatchObject({ code: 'search/invalid-input' });
  });
});
