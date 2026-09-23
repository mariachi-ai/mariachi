import { describe, expect, it } from 'vitest';
import { MemorySearchAdapter } from './adapters/memory';
import { MemorySearchAnalytics, RedisListAnalytics } from './analytics';

describe('MemorySearchAdapter', () => {
  it('refuses a query when the schema has no string fields and no queryBy', async () => {
    const search = new MemorySearchAdapter();
    await search.connect();
    await search.createIndex({ name: 'counts', fields: [{ name: 'n', type: 'int' }] });
    await expect(search.search('counts', { query: '1' })).rejects.toMatchObject({ code: 'search/missing-query-fields' });
  });

  it('swaps an alias onto a new collection', async () => {
    const search = new MemorySearchAdapter();
    await search.connect();
    await search.reindexAlias('products', { name: 'products', fields: [{ name: 'title', type: 'string' }] }, [{ id: '1', title: 'hat' }]);
    const result = await search.search('products', { query: 'hat' });
    expect(result.total).toBe(1);
    expect(await search.isHealthy()).toBe(true);
  });
});

describe('RedisListAnalytics', () => {
  it('stores entries on the list client', async () => {
    const lines: string[] = [];
    const analytics = new RedisListAnalytics({
      async lpush(_key, value) { lines.unshift(value); },
      async ltrim() {},
      async lrange() { return lines; },
    });
    await analytics.record({ query: 'hat', index: 'products', totalHits: 1, latencyMs: 2, timestamp: new Date('2026-01-01') });
    expect((await analytics.recent('products'))[0]?.query).toBe('hat');
    const memory = new MemorySearchAnalytics();
    await memory.record({ query: 'q', index: 'products', totalHits: 0, latencyMs: 1, timestamp: new Date() });
    expect(memory.entries).toHaveLength(1);
  });
});

describe('buildFilterBy', () => {
  it('quotes string values and rejects unsafe input', async () => {
    const { buildFilterBy } = await import('./adapters/typesense');
    expect(buildFilterBy({ tag: 'a && b', n: 3, on: true })).toBe('tag:=`a && b` && n:=3 && on:=true');
    expect(() => buildFilterBy({ tag: 'x`y' })).toThrow(expect.objectContaining({ code: 'search/invalid-input' }));
    expect(() => buildFilterBy({ 'a || b': 'x' })).toThrow(expect.objectContaining({ code: 'search/invalid-input' }));
  });
});
