import { describe, expect, it } from 'vitest';
import { createContext, type Logger } from '@mariachi/core';
import { DefaultCache, MemoryCacheAdapter, createCache, createLock, memoize } from './index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const ctx = createContext({ logger });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Cache (memory)', () => {
  it('getOrSet computes once for concurrent callers and then serves from cache', async () => {
    const cache = new DefaultCache({ client: new MemoryCacheAdapter() }, { logger });
    let computed = 0;
    const fn = async () => {
      computed++;
      await sleep(20);
      return { v: 1 };
    };
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.getOrSet(ctx, 'k', fn, 60)));
    expect(computed).toBe(1);
    expect(results.every((r) => r.v === 1)).toBe(true);
    await cache.getOrSet(ctx, 'k', fn, 60);
    expect(computed).toBe(1);
  });

  it('does not cache null unless asked, and caches null with cacheNull', async () => {
    const cache = new DefaultCache({ client: new MemoryCacheAdapter() }, { logger });
    let calls = 0;
    const miss = async () => {
      calls++;
      return null;
    };
    await cache.getOrSet(ctx, 'a', miss, 60);
    await cache.getOrSet(ctx, 'a', miss, 60);
    expect(calls).toBe(2);
    await cache.getOrSet(ctx, 'b', miss, 60, { cacheNull: true });
    expect(await cache.getOrSet(ctx, 'b', miss, 60, { cacheNull: true })).toBeNull();
    expect(calls).toBe(3);
  });

  it('does not cache failures and lets the next caller retry', async () => {
    const cache = new DefaultCache({ client: new MemoryCacheAdapter() }, { logger });
    let n = 0;
    const fn = async () => {
      n++;
      if (n === 1) throw new Error('boom');
      return 'ok';
    };
    await expect(cache.getOrSet(ctx, 'f', fn, 60)).rejects.toThrow('boom');
    expect(await cache.getOrSet(ctx, 'f', fn, 60)).toBe('ok');
  });

  it('memoize shares in-flight calls per key', async () => {
    const client = new MemoryCacheAdapter();
    let calls = 0;
    const load = memoize(
      client,
      (id: string) => `user:${id}`,
      async (id: string) => {
        calls++;
        await sleep(10);
        return { id };
      },
      60,
    );
    const [a, b, c] = await Promise.all([load('1'), load('1'), load('2')]);
    expect(a).toEqual({ id: '1' });
    expect(b).toEqual({ id: '1' });
    expect(c).toEqual({ id: '2' });
    expect(calls).toBe(2);
  });

  it('incr applies TTL only on creation', async () => {
    const client = new MemoryCacheAdapter();
    expect(await client.incr('c', 1, 10)).toBe(1);
    expect(await client.incr('c', 2, 999)).toBe(3);
    const ttl = await client.ttl('c');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it('rejects unknown adapters and locks without redis', () => {
    expect(() => createCache({ adapter: 'memcached' })).toThrow(expect.objectContaining({ code: 'cache/unknown-adapter' }));
    expect(() => createLock({ adapter: 'memory' })).toThrow(expect.objectContaining({ code: 'cache/lock-requires-redis' }));
  });
});
