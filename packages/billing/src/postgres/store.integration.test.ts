import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { DrizzleBillingStore, billingTables } from './index';
import type { Plan, Subscription } from '../types';

let database: PostgresDatabase;
let store: DrizzleBillingStore;

const sub = (status: Subscription['status']): Subscription => ({
  id: 'sub_pg',
  customerId: 'cus_pg',
  tenantId: 't1',
  planId: 'price_pro',
  quantity: 1,
  items: [{ id: 'si_pg', priceId: 'price_pro', quantity: 1 }],
  status,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  trialEnd: null,
  metadata: {},
});

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, billingTables);
  store = new DrizzleBillingStore(database.db);
}, 180_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DrizzleBillingStore', () => {
  it('ignores stale subscription updates', async () => {
    expect((await store.upsertSubscription(sub('canceled'), new Date(3000))).applied).toBe(true);
    const stale = await store.upsertSubscription(sub('active'), new Date(2000));
    expect(stale).toEqual({ applied: false, previousStatus: 'canceled' });
    expect((await store.findSubscription('sub_pg'))?.status).toBe('canceled');
    expect(await store.listSubscriptionsByTenant('t1')).toHaveLength(1);
  });

  it('keeps the tenant when a later event lacks metadata', async () => {
    const customer = { id: 'cus_pg', email: 'a@b.c', name: null, tenantId: 't1', delinquent: false, metadata: {} };
    await store.upsertCustomer(customer, new Date(1000));
    await store.upsertCustomer({ ...customer, tenantId: null, email: 'new@b.c' }, new Date(2000));
    const found = await store.findCustomerByTenant('t1');
    expect(found?.email).toBe('new@b.c');
  });

  it('serializes concurrent ledger writes and never overdraws', async () => {
    const base = { tenantId: 't1', customerId: 'cus_pg', currency: 'usd', description: 'x' };
    await store.appendCreditTransaction({ ...base, amount: 100, idempotencyKey: 'grant' });
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => store.appendCreditTransaction({ ...base, amount: -30, idempotencyKey: `use-${i}` })),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(3);
    expect(await store.getCreditLedgerBalance('t1', 'cus_pg', 'usd')).toBe(10);
    const replay = await store.appendCreditTransaction({ ...base, amount: 100, idempotencyKey: 'grant' });
    expect(replay.balanceAfter).toBe(100);
    expect(await store.getCreditLedgerBalance('t1', 'cus_pg', 'usd')).toBe(10);
  });

  it('deduplicates usage by idempotency key', async () => {
    const rec = { tenantId: 't1', customerId: 'cus_pg', metricName: 'tokens', quantity: 5, timestamp: new Date(), idempotencyKey: 'u1' };
    expect(await store.recordUsage(rec)).toBe(true);
    expect(await store.recordUsage(rec)).toBe(false);
    const s = await store.summarizeUsage('t1', 'tokens', { from: new Date(0), to: new Date(Date.now() + 60_000) });
    expect(s.totalQuantity).toBe(5);
  });

  it('tracks webhook attempts', async () => {
    await store.recordWebhookEvent({ id: 'evt_pg', type: 'x', status: 'processing' });
    await store.recordWebhookEvent({ id: 'evt_pg', type: 'x', status: 'failed', error: 'boom' });
    await store.recordWebhookEvent({ id: 'evt_pg', type: 'x', status: 'processing' });
    await store.recordWebhookEvent({ id: 'evt_pg', type: 'x', status: 'processed' });
    const rows = await database.db.select().from(billingTables.webhookEvents);
    expect(rows[0]).toMatchObject({ status: 'processed', attempts: 2 });
  });

  it('mirrors plans and ignores stale price events', async () => {
    const plan: Plan = {
      id: 'price_pg',
      productId: 'prod_1',
      name: 'Pro',
      description: null,
      amount: 2000,
      currency: 'usd',
      interval: 'month',
      active: true,
      lookupKey: null,
      metadata: { tier: 'pro' },
      productMetadata: {},
    };
    await store.upsertPlan(plan, new Date(2000));
    await store.upsertPlan({ ...plan, amount: 1000 }, new Date(1000));
    expect(await store.listPlans()).toMatchObject([{ id: 'price_pg', amount: 2000, metadata: { tier: 'pro' } }]);
    await store.upsertPlan({ ...plan, active: false }, new Date(3000));
    expect(await store.listPlans()).toEqual([]);
    expect(await store.listPlans({ activeOnly: false })).toHaveLength(1);
  });

  it('persists every subscription item', async () => {
    const items = [
      { id: 'si_seat', priceId: 'price_seat', quantity: 3 },
      { id: 'si_metered', priceId: 'price_metered', quantity: null },
    ];
    await store.upsertSubscription({ ...sub('active'), id: 'sub_items', planId: 'price_seat', quantity: 3, items }, new Date(1000));
    expect((await store.findSubscription('sub_items'))?.items).toEqual(items);
    await store.upsertSubscription({ ...sub('active'), id: 'sub_items', items: items.slice(1) }, new Date(2000));
    expect((await store.findSubscription('sub_items'))?.items).toEqual(items.slice(1));
  });

  it('mirrors lookup keys and product metadata', async () => {
    const base: Plan = {
      id: 'price_lk_a',
      productId: 'prod_lk',
      name: 'A',
      description: null,
      amount: 100,
      currency: 'usd',
      interval: 'month',
      active: true,
      lookupKey: 'lk_a',
      metadata: {},
      productMetadata: { allowance: '1000' },
    };
    await store.upsertPlan(base, new Date(1000));
    await store.upsertPlan({ ...base, id: 'price_lk_b', lookupKey: 'lk_b', amount: 200, active: false }, new Date(1000));
    expect(await store.findPlan('price_lk_a')).toEqual(base);
    expect(await store.findPlan('price_missing')).toBeNull();
    expect((await store.listPlans({ lookupKeys: ['lk_a', 'lk_b'] })).map((p) => p.id)).toEqual(['price_lk_a']);
    expect((await store.listPlans({ lookupKeys: ['lk_a', 'lk_b'], activeOnly: false })).map((p) => p.id)).toEqual(['price_lk_a', 'price_lk_b']);
    expect(await store.listPlans({ lookupKeys: [] })).toEqual([]);
  });

  it('sets the ledger balance atomically with concurrent consumes', async () => {
    const base = { tenantId: 't1', customerId: 'cus_set', currency: 'usd', description: 'x' };
    await store.appendCreditTransaction({ ...base, amount: 100, idempotencyKey: 'set-grant' });
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => store.appendCreditTransaction({ ...base, amount: -10, idempotencyKey: `set-use-${i}` }).catch(() => null)),
      store.setCreditLedgerBalance({ ...base, idempotencyKey: 'set-period-1' }, 500),
      ...Array.from({ length: 10 }, (_, i) => store.appendCreditTransaction({ ...base, amount: -10, idempotencyKey: `set-use-b${i}` }).catch(() => null)),
    ]);
    // Every entry continues the previous one's balance, and the reset landed exactly on 500.
    const entries = (await store.listCreditTransactions('t1', 'cus_set', { limit: 100 })).reverse();
    let running = 0;
    for (const entry of entries) {
      running += entry.amount;
      expect(entry.balanceAfter).toBe(running);
    }
    expect(entries.find((e) => e.idempotencyKey === 'set-period-1')?.balanceAfter).toBe(500);
    expect(await store.getCreditLedgerBalance('t1', 'cus_set', 'usd')).toBe(running);

    const replay = await store.setCreditLedgerBalance({ ...base, idempotencyKey: 'set-period-1' }, 900);
    expect(replay?.balanceAfter).toBe(500);
    expect(await store.setCreditLedgerBalance({ ...base, idempotencyKey: null }, running)).toBeNull();
    expect(await store.setCreditLedgerBalance({ ...base, idempotencyKey: 'set-period-2' }, running)).toMatchObject({ amount: 0, balanceAfter: running });
    expect(await store.setCreditLedgerBalance({ ...base, currency: 'mcr', idempotencyKey: 'set-mcr' }, -25)).toMatchObject({ amount: -25, currency: 'mcr' });
    expect(await store.getCreditLedgerBalance('t1', 'cus_set', 'mcr')).toBe(-25);
  });

  it('stores dimensions and sums by one of them', async () => {
    const base = { tenantId: 't1', customerId: 'cus_dim', currency: 'usd', description: 'x' };
    await store.appendCreditTransaction({ ...base, amount: 1000, idempotencyKey: 'dim-grant' });
    await store.appendCreditTransaction({ ...base, amount: -100, idempotencyKey: 'dim-1', dimensions: { project: 'p1', region: 'eu' } });
    await store.appendCreditTransaction({ ...base, amount: -50, idempotencyKey: 'dim-2', dimensions: { project: 'p1' } });
    await store.appendCreditTransaction({ ...base, amount: 20, idempotencyKey: 'dim-3', dimensions: { project: 'p2' } });
    const range = { from: new Date(0), to: new Date(Date.now() + 60_000) };
    expect(await store.summarizeCreditsByDimension('t1', 'cus_dim', 'usd', range, 'project')).toEqual([
      { value: 'p1', credited: 0, debited: 150 },
      { value: 'p2', credited: 20, debited: 0 },
      { value: null, credited: 1000, debited: 0 },
    ]);
    expect(await store.summarizeCreditsByDimension('t1', 'cus_dim', 'usd', range, 'region')).toEqual([
      { value: 'eu', credited: 0, debited: 100 },
      { value: null, credited: 1020, debited: 50 },
    ]);
    const [latest] = await store.listCreditTransactions('t1', 'cus_dim', { limit: 1 });
    expect(latest.dimensions).toEqual({ project: 'p2' });

    const rec = { tenantId: 't1', customerId: 'cus_dim', metricName: 'requests', timestamp: new Date() };
    await store.recordUsage({ ...rec, quantity: 3, idempotencyKey: 'dim-u1', dimensions: { project: 'p1' } });
    await store.recordUsage({ ...rec, quantity: 4, idempotencyKey: 'dim-u2', dimensions: { project: 'p1' } });
    await store.recordUsage({ ...rec, quantity: 5, idempotencyKey: 'dim-u3' });
    expect(await store.summarizeUsageByDimension('t1', 'requests', range, 'project')).toEqual([
      { value: 'p1', totalQuantity: 7 },
      { value: null, totalQuantity: 5 },
    ]);
  });
});
