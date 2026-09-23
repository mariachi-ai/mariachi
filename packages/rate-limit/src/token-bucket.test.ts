import { describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { MemoryRateLimiter } from './adapters/memory';
import { DefaultRateLimiting } from './rate-limiting';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

describe('token bucket', () => {
  it('refills over the window', async () => {
    let now = 1_000;
    const limiter = new MemoryRateLimiter(() => now);
    const rule = { algorithm: 'token-bucket' as const, maxRequests: 2, windowMs: 1_000 };
    expect((await limiter.check('k', rule)).allowed).toBe(true);
    expect((await limiter.check('k', rule)).allowed).toBe(true);
    expect((await limiter.check('k', rule)).allowed).toBe(false);
    now += 500;
    expect((await limiter.check('k', rule)).allowed).toBe(true);
  });

  it('uses the tenant tier', async () => {
    const limiting = new DefaultRateLimiting({ limiter: new MemoryRateLimiter() }, { logger: silent });
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    const tiers = { default: { name: 'default', rule: { maxRequests: 1, windowMs: 60_000, algorithm: 'fixed-window' as const } } };
    expect((await limiting.checkTier(ctx, 'search', tiers)).allowed).toBe(true);
    expect((await limiting.checkTier(ctx, 'search', tiers)).allowed).toBe(false);
  });
});

describe('tiers', () => {
  const tiers = {
    default: { name: 'default', rule: { maxRequests: 1, windowMs: 60_000, algorithm: 'fixed-window' as const } },
    pro: { name: 'pro', rule: { maxRequests: 3, windowMs: 60_000, algorithm: 'fixed-window' as const } },
  };

  it('resolves the tier per tenant and rejects unknown names', async () => {
    const limiting = new DefaultRateLimiting(
      { limiter: new MemoryRateLimiter(), resolveTier: (ctx) => (ctx.tenantId === 'acme' ? 'pro' : undefined) },
      { logger: silent },
    );
    const acme = createContext({ logger: silent, tenantId: 'acme' });
    const small = createContext({ logger: silent, tenantId: 'small' });
    for (let i = 0; i < 3; i++) expect((await limiting.checkTier(acme, 'api', tiers)).allowed).toBe(true);
    expect((await limiting.checkTier(acme, 'api', tiers)).allowed).toBe(false);
    expect((await limiting.checkTier(small, 'api', tiers)).allowed).toBe(true);
    await expect(limiting.consumeTier(small, 'api', tiers)).rejects.toMatchObject({ code: 'rate-limit/exceeded' });
    await expect(limiting.checkTier(small, 'api', tiers, 'enterprize')).rejects.toMatchObject({ code: 'rate-limit/unknown-tier' });
  });
});
