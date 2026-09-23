import { describe, expect, it } from 'vitest';
import type { CacheClient, DistributedLock } from '@mariachi/cache';

/** Behavior every `CacheClient` must share: Redis, memory and the test double. */
export function cacheContract(name: string, create: (prefix: string) => CacheClient | Promise<CacheClient>) {
  describe(`cache contract: ${name}`, () => {
    it('gets, sets, expires and counts', async () => {
      const cache = await create(`c${crypto.randomUUID().slice(0, 8)}`);
      await cache.connect();
      await cache.set(cache.key('obj'), { a: 1 }, 60);
      expect(await cache.get(cache.key('obj'))).toEqual({ a: 1 });
      expect(await cache.has(cache.key('obj'))).toBe(true);
      expect(await cache.get(cache.key('missing'))).toBeNull();
      expect(await cache.setIfAbsent(cache.key('once'), 1, 60)).toBe(true);
      expect(await cache.setIfAbsent(cache.key('once'), 2, 60)).toBe(false);
      expect(await cache.incr(cache.key('n'))).toBe(1);
      expect(await cache.incr(cache.key('n'), 5)).toBe(6);
      expect(await cache.ttl(cache.key('missing'))).toBe(-2);
      expect(await cache.ttl(cache.key('obj'))).toBeGreaterThan(0);
      await cache.del(cache.key('obj'));
      expect(await cache.get(cache.key('obj'))).toBeNull();
      await cache.disconnect();
    });

    it('lists and flushes only its own prefix', async () => {
      const id = crypto.randomUUID().slice(0, 8);
      const cache = await create(`a${id}`);
      await cache.connect();
      await cache.set(cache.key('x', '1'), 1, 60);
      await cache.set(cache.key('x', '2'), 2, 60);
      await cache.set(cache.key('y'), 3, 60);
      expect((await cache.keys('x:*')).sort()).toEqual([cache.key('x', '1'), cache.key('x', '2')]);
      await cache.flush();
      expect(await cache.keys('*')).toEqual([]);
      await cache.disconnect();
    });
  });
}

/** Behavior every `DistributedLock` must share: Redis and the test double. */
export function lockContract(name: string, create: () => DistributedLock | Promise<DistributedLock>) {
  describe(`lock contract: ${name}`, () => {
    it('grants a lock to one holder and releases only with its token', async () => {
      const lock = await create();
      const key = `lock-${crypto.randomUUID()}`;
      const token = await lock.acquireToken(key, 5_000);
      expect(token).toBeTruthy();
      expect(await lock.acquireToken(key, 5_000)).toBeNull();
      expect(await lock.releaseToken(key, 'wrong')).toBe(false);
      expect(await lock.extendToken(key, token!, 5_000)).toBe(true);
      expect(await lock.releaseToken(key, token!)).toBe(true);
      expect(await lock.acquireToken(key, 5_000)).toBeTruthy();
    });

    it('expires a lock after its ttl', async () => {
      const lock = await create();
      const key = `lock-${crypto.randomUUID()}`;
      expect(await lock.acquireToken(key, 50)).toBeTruthy();
      await new Promise((r) => setTimeout(r, 120));
      expect(await lock.acquireToken(key, 5_000)).toBeTruthy();
    });

    it('runs withLock exclusively', async () => {
      const lock = await create();
      const key = `lock-${crypto.randomUUID()}`;
      let inside = 0;
      let max = 0;
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          lock.withLock(key, 5_000, async () => {
            inside += 1;
            max = Math.max(max, inside);
            await new Promise((r) => setTimeout(r, 20));
            inside -= 1;
          }),
        ),
      );
      expect(max).toBe(1);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    });
  });
}
