import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startRedis, stopAll } from '../../../../test/setup';
import type { RateLimitRule } from '../types';
import { RedisRateLimiter } from './redis';

let a: RedisRateLimiter;
let b: RedisRateLimiter;
const run = crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  const url = await startRedis();
  a = new RedisRateLimiter({ url, prefix: `rl-${run}` });
  b = new RedisRateLimiter({ url, prefix: `rl-${run}` }); // a second instance sharing the budget
  await a.connect();
  await b.connect();
}, 180_000);

afterAll(async () => {
  await a?.disconnect();
  await b?.disconnect();
  await stopAll();
});

const algorithms: Array<NonNullable<RateLimitRule['algorithm']>> = ['sliding-window', 'fixed-window', 'token-bucket'];

describe('RedisRateLimiter', () => {
  for (const algorithm of algorithms) {
    it(`${algorithm}: admits exactly the limit across instances under concurrency`, async () => {
      const rule: RateLimitRule = { algorithm, maxRequests: 5, windowMs: 10_000 };
      const key = `burst:${algorithm}`;
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).check(key, rule)));
      expect(results.filter((r) => r.allowed)).toHaveLength(5);
      const denied = results.find((r) => !r.allowed)!;
      expect(denied.remaining).toBe(0);
      expect(denied.retryAfterMs).toBeGreaterThan(0);
      await a.reset(key);
      expect((await b.check(key, rule)).allowed).toBe(true);
    });
  }

  it('token-bucket refills gradually', async () => {
    const rule: RateLimitRule = { algorithm: 'token-bucket', maxRequests: 2, windowMs: 400 };
    const key = 'refill';
    expect((await a.check(key, rule)).allowed).toBe(true);
    expect((await a.check(key, rule)).allowed).toBe(true);
    const denied = await a.check(key, rule);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(200); // one token, not the whole window
    await new Promise((r) => setTimeout(r, 250)); // > one token's worth (200ms)
    expect((await a.check(key, rule)).allowed).toBe(true);
    expect((await a.check(key, rule)).allowed).toBe(false);
  });

  it('counts weighted requests', async () => {
    const rule: RateLimitRule = { algorithm: 'fixed-window', maxRequests: 10, windowMs: 10_000, cost: 4 };
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await a.check('weighted', rule)).allowed);
    expect(results).toEqual([true, true, false]);
  });
});
