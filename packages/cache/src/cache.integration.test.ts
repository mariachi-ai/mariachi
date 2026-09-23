import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { createContext, runOnce, type Logger } from '@mariachi/core';
import { startRedis, stopAll } from '../../../test/setup';
import { DefaultCache, RedisCacheAdapter, RedisDistributedLock, RedisIdempotencyStore } from './index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const ctx = createContext({ logger });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let url: string;
let admin: Redis;

beforeAll(async () => {
  url = await startRedis();
  admin = new Redis(url);
});

afterAll(async () => {
  await admin?.quit();
  await stopAll();
});

describe('RedisCacheAdapter', () => {
  it('lists with SCAN and flushes only its own prefix', async () => {
    const a = new RedisCacheAdapter({ adapter: 'redis', url, prefix: 'scan-a' });
    const b = new RedisCacheAdapter({ adapter: 'redis', url, prefix: 'scan-b' });
    await a.connect();
    await b.connect();
    try {
      const pipeline = admin.pipeline();
      for (let i = 0; i < 1500; i++) pipeline.set(`scan-a:item:${i}`, '1');
      await pipeline.exec();
      await b.set(b.key('keep'), 'yes');
      expect(await a.keys('item:*')).toHaveLength(1500);
      await a.flush();
      expect(await a.keys('*')).toHaveLength(0);
      expect(await b.get(b.key('keep'))).toBe('yes');
    } finally {
      await a.disconnect();
      await b.disconnect();
    }
  });

  it('round-trips JSON, applies TTLs and setIfAbsent', async () => {
    const c = new RedisCacheAdapter({ adapter: 'redis', url, prefix: 'rt' });
    await c.connect();
    try {
      await c.set('rt:obj', { a: [1, 2] }, 30);
      expect(await c.get('rt:obj')).toEqual({ a: [1, 2] });
      expect(await c.ttl('rt:obj')).toBeGreaterThan(25);
      expect(await c.setIfAbsent('rt:once', 1, 30)).toBe(true);
      expect(await c.setIfAbsent('rt:once', 2, 30)).toBe(false);
      expect(await c.incr('rt:n', 5, 30)).toBe(5);
      expect(await c.incr('rt:n', 1, 30)).toBe(6);
    } finally {
      await c.disconnect();
    }
  });
});

describe('distributed stampede protection', () => {
  it('only one instance recomputes a cold key', async () => {
    const make = () =>
      new DefaultCache(
        { client: new RedisCacheAdapter({ adapter: 'redis', url, prefix: 'stampede' }), lock: new RedisDistributedLock({ adapter: 'redis', url }) },
        { logger },
      );
    const instances = [make(), make(), make()];
    await Promise.all(instances.map((c) => c.connect()));
    try {
      let computed = 0;
      const fn = async () => {
        computed++;
        await sleep(100);
        return 'value';
      };
      const results = await Promise.all(
        instances.flatMap((c) => Array.from({ length: 5 }, () => c.getOrSet(ctx, 'stampede:hot', fn, 60, { lockWaitMs: 2_000 }))),
      );
      expect(new Set(results)).toEqual(new Set(['value']));
      expect(computed).toBe(1);
    } finally {
      await Promise.all(instances.map((c) => c.disconnect()));
    }
  });
});

describe('RedisDistributedLock', () => {
  it('withLock excludes concurrent holders and auto-extends past the TTL', async () => {
    const l1 = new RedisDistributedLock({ adapter: 'redis', url });
    const l2 = new RedisDistributedLock({ adapter: 'redis', url });
    await l1.connect();
    await l2.connect();
    try {
      const order: string[] = [];
      const first = l1.withLock('lock:job', 200, async () => {
        order.push('1-start');
        await sleep(500);
        order.push('1-end');
      });
      await sleep(50);
      await expect(l2.withLock('lock:job', 200, async () => {}, { waitMs: 100 })).rejects.toMatchObject({ code: 'lock/not-acquired' });
      const second = l2.withLock('lock:job', 200, async () => void order.push('2'), { waitMs: 2_000 });
      await Promise.all([first, second]);
      expect(order).toEqual(['1-start', '1-end', '2']);
    } finally {
      await l1.disconnect();
      await l2.disconnect();
    }
  });

  it('owned locks can be released only by their owner', async () => {
    const lock = new RedisDistributedLock({ adapter: 'redis', url });
    await lock.connect();
    try {
      const got = await lock.acquireOwned('doc:1', { owner: 'alice', ttlMs: 5_000, metadata: { tab: 1 } });
      expect(got.acquired).toBe(true);
      const denied = await lock.acquireOwned('doc:1', { owner: 'bob', ttlMs: 5_000 });
      expect(denied).toMatchObject({ acquired: false, info: { owner: 'alice', metadata: { tab: 1 } } });
      expect(await lock.releaseOwned('doc:1', 'bob')).toBe(false);
      expect(await lock.extendOwned('doc:1', 'alice', 10_000)).toMatchObject({ owner: 'alice' });
      expect(await lock.releaseOwned('doc:1', 'alice')).toBe(true);
      expect(await lock.inspect('doc:1')).toBeNull();
    } finally {
      await lock.disconnect();
    }
  });
});

describe('RedisIdempotencyStore', () => {
  it('runs a keyed operation once across callers and allows retry after failure', async () => {
    const client = new Redis(url);
    const store = new RedisIdempotencyStore(client, 'it-idem');
    try {
      let runs = 0;
      const op = async () => {
        runs++;
        await sleep(50);
        return 'done';
      };
      const results = await Promise.all([runOnce(store, 'evt_1', op), runOnce(store, 'evt_1', op)]);
      expect(results.map((r) => r.status).sort()).toEqual(['in-progress', 'processed']);
      expect(await runOnce(store, 'evt_1', op)).toEqual({ status: 'duplicate' });
      expect(runs).toBe(1);

      await expect(
        runOnce(store, 'evt_2', async () => {
          throw new Error('fail');
        }),
      ).rejects.toThrow('fail');
      await runOnce(store, 'evt_2', op);
      expect(runs).toBe(2);
    } finally {
      await client.quit();
    }
  });
});

describe('shared clients', () => {
  it('does not close a client it did not open', async () => {
    const shared = new Redis(url, { lazyConnect: true });
    const cache = new DefaultCache(
      { client: new RedisCacheAdapter({ adapter: 'redis', client: shared }), lock: new RedisDistributedLock({ adapter: 'redis', client: shared }) },
      { logger },
    );
    await cache.connect();
    await cache.disconnect();
    expect(await shared.ping()).toBe('PONG');
    await shared.quit();
  });
});
