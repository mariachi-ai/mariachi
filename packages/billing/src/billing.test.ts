import { beforeEach, describe, expect, it } from 'vitest';
import { createContext, InMemoryIdempotencyStore } from '@mariachi/core';
import {
  DefaultBilling,
  MemoryBillingAdapter,
  MemoryBillingStore,
  createBillingWebhookHandler,
  type BillingEvent,
} from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const deps = { logger: silent };
const SECRET = 'whsec_test_secret';

function stripeEvent(id: string, type: string, object: Record<string, unknown>, created: number, previous?: Record<string, unknown>) {
  return JSON.stringify({ id, type, created, livemode: false, data: { object, previous_attributes: previous } });
}

function subscriptionObject(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status,
    items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_592_000,
    cancel_at_period_end: false,
    metadata: {},
    ...overrides,
  };
}

describe('billing webhooks', () => {
  let adapter: MemoryBillingAdapter;
  let store: MemoryBillingStore;
  let received: BillingEvent[];

  beforeEach(async () => {
    adapter = new MemoryBillingAdapter();
    store = new MemoryBillingStore();
    received = [];
    await store.upsertCustomer(
      { id: 'cus_1', email: 'a@b.c', name: null, tenantId: 't1', delinquent: false, metadata: { tenantId: 't1' } },
      new Date(0),
    );
  });

  function handler(onEvent?: (e: BillingEvent) => Promise<void>) {
    return createBillingWebhookHandler(
      {
        adapter,
        secret: SECRET,
        store,
        idempotency: new InMemoryIdempotencyStore(),
        onEvent: async (_ctx, e) => {
          if (onEvent) await onEvent(e);
          received.push(e);
        },
      },
      deps,
    );
  }

  async function deliver(h: ReturnType<typeof handler>, body: string) {
    return h.handle(undefined, Buffer.from(body), MemoryBillingAdapter.sign(body, SECRET));
  }

  it('rejects bad signatures before touching state', async () => {
    const body = stripeEvent('evt_1', 'customer.subscription.created', subscriptionObject('active'), 100);
    await expect(handler().handle(undefined, body, MemoryBillingAdapter.sign(body, 'wrong'))).rejects.toMatchObject({
      code: 'billing/webhook-invalid-signature',
    });
    await expect(handler().handle(undefined, body, undefined)).rejects.toMatchObject({ code: 'billing/webhook-invalid-signature' });
    expect(store.subscriptions.size).toBe(0);
  });

  it('only dedups after success, so a failed delivery is retried', async () => {
    let fail = true;
    const h = handler(async () => {
      if (fail) throw new Error('downstream outage');
    });
    const body = stripeEvent('evt_2', 'customer.subscription.created', subscriptionObject('active'), 100);
    await expect(deliver(h, body)).rejects.toThrow('downstream outage');
    expect(store.webhookEvents.get('evt_2')?.status).toBe('failed');

    fail = false;
    const retry = await deliver(h, body);
    expect(retry.outcome).toBe('processed');
    expect(received.map((e) => e.type)).toEqual(['subscription.synced']);

    received.length = 0;
    const replayed = await h.replay(undefined, 'evt_2');
    expect(replayed.outcome).toBe('processed');
    expect(received.map((e) => e.type)).toEqual(['subscription.synced']);

    const dup = await deliver(h, body);
    expect(dup.outcome).toBe('duplicate');
    expect(received).toHaveLength(1);
  });

  it('resolves the tenant from the mirrored customer', async () => {
    await deliver(handler(), stripeEvent('evt_3', 'customer.subscription.created', subscriptionObject('active'), 100));
    expect(received[0].tenantId).toBe('t1');
    expect((await store.findSubscription('sub_1'))?.tenantId).toBe('t1');
  });

  it('ignores stale out-of-order events and emits cancellation once', async () => {
    const h = handler();
    await deliver(h, stripeEvent('evt_new', 'customer.subscription.deleted', subscriptionObject('canceled', { canceled_at: 300 }), 300));
    await deliver(h, stripeEvent('evt_old', 'customer.subscription.updated', subscriptionObject('active'), 200));
    expect((await store.findSubscription('sub_1'))?.status).toBe('canceled');
    expect(received.map((e) => e.type)).toEqual(['subscription.synced', 'subscription.canceled']);
  });

  it('records refunds and keeps the highest refunded amount', async () => {
    const charge = { id: 'ch_1', payment_intent: 'pi_1', customer: 'cus_1', amount: 1000, currency: 'usd', status: 'succeeded' };
    const h = handler();
    await deliver(h, stripeEvent('evt_r1', 'charge.refunded', { ...charge, amount_refunded: 500, refunds: { data: [{ id: 're_1', amount: 500, status: 'succeeded', currency: 'usd' }] } }, 100));
    await deliver(h, stripeEvent('evt_r2', 'charge.refunded', { ...charge, amount_refunded: 300 }, 100));
    expect(store.charges.get('pi_1')?.value.amountRefunded).toBe(500);
    expect(store.refunds.get('re_1')?.chargeId).toBe('pi_1');
  });

  it('marks unknown event types as ignored', async () => {
    const res = await deliver(handler(), stripeEvent('evt_x', 'radar.early_fraud_warning.created', { id: 'x' }, 100));
    expect(res.outcome).toBe('ignored');
    expect(store.webhookEvents.get('evt_x')?.status).toBe('ignored');
  });
});

describe('Billing service', () => {
  let billing: DefaultBilling;
  const t1 = createContext({ logger: silent, tenantId: 't1' });
  const t2 = createContext({ logger: silent, tenantId: 't2' });

  beforeEach(() => {
    billing = new DefaultBilling({ adapter: new MemoryBillingAdapter(), store: new MemoryBillingStore() }, deps);
  });

  it('creates exactly one customer per tenant', async () => {
    const [a, b] = await Promise.all([billing.ensureCustomer(t1, { email: 'a@t1' }), billing.ensureCustomer(t1, { email: 'a@t1' })]);
    expect(a.id).toBe(b.id);
    expect(a.tenantId).toBe('t1');
  });

  it('isolates subscriptions between tenants', async () => {
    await billing.ensureCustomer(t1, { email: 'a@t1' });
    await billing.ensureCustomer(t2, { email: 'b@t2' });
    const sub = await billing.subscribe(t1, { priceId: 'price_pro', idempotencyKey: 'sub-t1' });
    expect(await billing.hasActiveSubscription(t1, ['price_pro'])).toBe(true);
    expect(await billing.hasActiveSubscription(t2)).toBe(false);
    await expect(billing.getSubscription(t2, sub.id)).rejects.toMatchObject({ code: 'billing/subscription-not-found' });
    await expect(billing.cancelSubscription(t2, sub.id)).rejects.toMatchObject({ code: 'billing/subscription-not-found' });
    await expect(billing.subscribe(t1, { priceId: 'price_pro', idempotencyKey: 'sub-t1-again' })).rejects.toMatchObject({
      code: 'billing/subscription-exists',
    });
  });

  it('requires idempotency keys and a tenant for money movement', async () => {
    await billing.ensureCustomer(t1, { email: 'a@t1' });
    await expect(billing.charge(t1, { amount: 100, idempotencyKey: '' })).rejects.toMatchObject({ code: 'billing/idempotency-key-required' });
    await expect(billing.charge(createContext({ logger: silent }), { amount: 100, idempotencyKey: 'k' })).rejects.toMatchObject({
      code: 'billing/tenant-required',
    });
    await expect(billing.charge(t1, { amount: 1.5, idempotencyKey: 'k' })).rejects.toMatchObject({ code: 'billing/invalid-input' });
  });

  it('maintains an idempotent credit ledger that cannot go negative', async () => {
    await billing.ensureCustomer(t1, { email: 'a@t1' });
    await billing.grantCredits(t1, 100, { description: 'signup bonus', idempotencyKey: 'grant-1' });
    await billing.grantCredits(t1, 100, { description: 'signup bonus', idempotencyKey: 'grant-1' });
    expect(await billing.getCreditBalance(t1)).toBe(100);
    await billing.consumeCredits(t1, 60, { description: 'ai call', idempotencyKey: 'use-1' });
    await expect(billing.consumeCredits(t1, 60, { description: 'ai call', idempotencyKey: 'use-2' })).rejects.toMatchObject({
      code: 'billing/insufficient-credits',
    });
    expect(await billing.getCreditBalance(t1)).toBe(40);
  });

  it('deduplicates usage reports', async () => {
    await billing.ensureCustomer(t1, { email: 'a@t1' });
    expect(await billing.reportUsage(t1, { metricName: 'tokens', quantity: 10, idempotencyKey: 'u1' })).toBe(true);
    expect(await billing.reportUsage(t1, { metricName: 'tokens', quantity: 10, idempotencyKey: 'u1' })).toBe(false);
    const summary = await billing.getUsage(t1, 'tokens', { from: new Date(0), to: new Date(Date.now() + 1000) });
    expect(summary.totalQuantity).toBe(10);
  });
});

describe('plan catalog', () => {
  it('syncs plans into the mirror and keeps them current from price webhooks', async () => {
    const adapter = new MemoryBillingAdapter();
    adapter.plans.push({ id: 'price_basic', productId: 'prod_1', name: 'Basic', description: null, amount: 500, currency: 'usd', interval: 'month', active: true, metadata: {} });
    const store = new MemoryBillingStore();
    const billing = new DefaultBilling({ adapter, store }, deps);
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    expect(await billing.syncPlans(ctx)).toBe(1);
    adapter.plans.length = 0; // the provider is no longer consulted once the mirror has data
    expect((await billing.listPlans(ctx)).map((p) => p.id)).toEqual(['price_basic']);
    expect(await billing.listPlans(ctx, { source: 'provider' })).toEqual([]);

    const received: BillingEvent[] = [];
    const h = createBillingWebhookHandler(
      { adapter, secret: SECRET, store, idempotency: new InMemoryIdempotencyStore(), onEvent: async (_c, e) => { received.push(e); } },
      deps,
    );
    const body = stripeEvent('evt_price', 'price.deleted', { id: 'price_basic', product: 'prod_1', unit_amount: 500, currency: 'usd', active: true }, Date.now() / 1000 + 10);
    await h.handle(undefined, Buffer.from(body), MemoryBillingAdapter.sign(body, SECRET));
    expect(received.map((e) => e.type)).toEqual(['plan.synced']);
    expect(await billing.listPlans(ctx, { activeOnly: false })).toMatchObject([{ id: 'price_basic', active: false }]);
  });
});
