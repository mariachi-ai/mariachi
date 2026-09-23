import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { DrizzleBillingStore, billingTables } from './index';
import type { Subscription } from '../types';

let database: PostgresDatabase;
let store: DrizzleBillingStore;

const sub = (status: Subscription['status']): Subscription => ({
  id: 'sub_pg',
  customerId: 'cus_pg',
  tenantId: 't1',
  planId: 'price_pro',
  quantity: 1,
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
    const plan = { id: 'price_pg', productId: 'prod_1', name: 'Pro', description: null, amount: 2000, currency: 'usd', interval: 'month' as const, active: true, metadata: { tier: 'pro' } };
    await store.upsertPlan(plan, new Date(2000));
    await store.upsertPlan({ ...plan, amount: 1000 }, new Date(1000));
    expect(await store.listPlans()).toMatchObject([{ id: 'price_pg', amount: 2000, metadata: { tier: 'pro' } }]);
    await store.upsertPlan({ ...plan, active: false }, new Date(3000));
    expect(await store.listPlans()).toEqual([]);
    expect(await store.listPlans({ activeOnly: false })).toHaveLength(1);
  });
});
