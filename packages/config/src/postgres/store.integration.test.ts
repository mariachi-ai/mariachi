import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { createFeatureFlags } from '../flags/index';
import { featureFlagsTable } from '../schema/index';
import { DrizzleFeatureFlagStore } from './index';

const run = crypto.randomUUID().slice(0, 8);
let database: PostgresDatabase;
let store: DrizzleFeatureFlagStore;

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, [featureFlagsTable]);
  store = new DrizzleFeatureFlagStore(database.db);
}, 180_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DrizzleFeatureFlagStore', () => {
  it('evaluates defaults and per-tenant overrides, with cache invalidation', async () => {
    const key = `beta-${run}`;
    await store.set({ key, enabled: false, metadata: { variant: 'v1' }, description: 'beta' });
    const flags = createFeatureFlags({ adapter: 'store', store, cacheTtlMs: 60_000 });
    expect(await flags.isEnabled(key, { tenantId: 'acme' })).toBe(false);

    await Promise.all([
      store.setTenantOverride(key, 'acme', true),
      store.setTenantOverride(key, 'globex', { enabled: true, variant: 'v2' }),
    ]);
    expect(await flags.isEnabled(key, { tenantId: 'acme' })).toBe(false); // cached
    flags.invalidate?.(key);
    expect(await flags.isEnabled(key, { tenantId: 'acme' })).toBe(true);
    expect(await flags.getVariant(key, { tenantId: 'globex' })).toBe('v2');
    expect(await flags.isEnabled(key, { tenantId: 'initech' })).toBe(false);

    await store.setTenantOverride(key, 'acme', null);
    await store.set({ key, enabled: true, metadata: null });
    flags.invalidate?.();
    expect(await flags.isEnabled(key, { tenantId: 'acme' })).toBe(true);
    expect((await store.get(key))?.tenantOverrides).toEqual({ globex: { enabled: true, variant: 'v2' } });
    expect(await store.setTenantOverride(`missing-${run}`, 'acme', true)).toBe(false);
  });

  it('rolls out by percentage deterministically', async () => {
    const key = `rollout-${run}`;
    await store.set({ key, enabled: true, metadata: { rolloutPercent: 50 } });
    const flags = createFeatureFlags({ adapter: 'store', store, cacheTtlMs: 0 });
    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => flags.isEnabled(key, { userId: `u${i}` })));
    const on = results.filter(Boolean).length;
    expect(on).toBeGreaterThan(60);
    expect(on).toBeLessThan(140);
    expect(await flags.isEnabled(key, { userId: 'u7' })).toBe(results[7]);
  });
});
