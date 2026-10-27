import { beforeEach, describe, expect, it } from 'vitest';
import { createContext, InMemoryIdempotencyStore } from '@mariachi/core';
import {
  DefaultBilling,
  MemoryBillingAdapter,
  MemoryBillingStore,
  createBillingWebhookHandler,
  type BillingEvent,
  type Plan,
} from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const deps = { logger: silent };
const SECRET = 'whsec_test_secret';

function stripeEvent(id: string, type: string, object: Record<string, unknown>, created: number, previous?: Record<string, unknown>) {
  return JSON.stringify({ id, type, created, livemode: false, data: { object, previous_attributes: previous } });
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'price_basic',
    productId: 'prod_1',
    name: 'Plan',
    description: null,
    amount: 500,
    currency: 'usd',
    interval: 'month',
    active: true,
    lookupKey: null,
    metadata: {},
    productMetadata: {},
    ...overrides,
  };
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

  it('mirrors every subscription item', async () => {
    const items = { data: [{ id: 'si_a', price: { id: 'price_seat' }, quantity: 2 }, { id: 'si_b', price: { id: 'price_metered' } }] };
    await deliver(handler(), stripeEvent('evt_items', 'customer.subscription.created', subscriptionObject('active', { items }), 100));
    expect((await store.findSubscription('sub_1'))?.items).toEqual([
      { id: 'si_a', priceId: 'price_seat', quantity: 2 },
      { id: 'si_b', priceId: 'price_metered', quantity: null },
    ]);
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

  it('replaces, when asked to verify, a stored customer the provider no longer has, keeping its credits', async () => {
    const adapter = new MemoryBillingAdapter();
    const store = new MemoryBillingStore();
    billing = new DefaultBilling({ adapter, store }, deps);
    await store.upsertCustomer({ id: 'cus_gone', email: 'a@t1', name: null, tenantId: 't1', delinquent: false, metadata: {} }, new Date(0));
    await billing.grantCredits(t1, 100, { description: 'grant', idempotencyKey: 'grant' });
    await billing.reportUsage(t1, { metricName: 'm', quantity: 2, idempotencyKey: 'u1' });

    expect((await billing.ensureCustomer(t1, { email: 'a@t1' })).id).toBe('cus_gone');
    const replaced = await billing.ensureCustomer(t1, { email: 'a@t1' }, { verify: true });
    expect(replaced.id).not.toBe('cus_gone');
    expect(await adapter.getCustomer(replaced.id)).not.toBeNull();
    expect((await billing.getCustomer(t1))?.id).toBe(replaced.id);
    expect(await billing.getCreditBalance(t1)).toBe(100);
    expect(store.usage.every((u) => u.customerId === replaced.id)).toBe(true);
    expect((await billing.ensureCustomer(t1, { email: 'a@t1' }, { verify: true })).id).toBe(replaced.id);
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
    adapter.plans.push(plan({ id: 'price_basic', name: 'Basic' }));
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

describe('subscriptions with several prices', () => {
  let adapter: MemoryBillingAdapter;
  let billing: DefaultBilling;
  const ctx = createContext({ logger: silent, tenantId: 't1' });

  beforeEach(async () => {
    adapter = new MemoryBillingAdapter();
    billing = new DefaultBilling({ adapter, store: new MemoryBillingStore() }, deps);
    await billing.ensureCustomer(ctx, { email: 'a@t1' });
  });

  it('subscribes to several prices; planId is the first, entitlement matches any', async () => {
    const sub = await billing.subscribe(ctx, { items: [{ priceId: 'price_base', quantity: 2 }, { priceId: 'price_metered' }], idempotencyKey: 's1' });
    expect(sub.planId).toBe('price_base');
    expect(sub.quantity).toBe(2);
    expect(sub.items.map((i) => [i.priceId, i.quantity])).toEqual([
      ['price_base', 2],
      ['price_metered', null],
    ]);
    expect(await billing.hasActiveSubscription(ctx, ['price_metered'])).toBe(true);
    expect(await billing.hasActiveSubscription(ctx, ['price_other'])).toBe(false);
    expect((await billing.getSubscription(ctx, sub.id)).items).toHaveLength(2);
  });

  it('replaces the item set on changePlan, keeping the items whose price stays', async () => {
    const sub = await billing.subscribe(ctx, { items: [{ priceId: 'price_base' }, { priceId: 'price_addon' }], idempotencyKey: 's1' });
    const base = sub.items[0];
    const next = await billing.changePlan(ctx, sub.id, {
      items: [{ priceId: 'price_base', quantity: 4 }, { priceId: 'price_new' }],
      prorationBehavior: 'none',
      idempotencyKey: 'c1',
    });
    expect(next.items[0]).toEqual({ id: base.id, priceId: 'price_base', quantity: 4 });
    expect(next.items.map((i) => i.priceId)).toEqual(['price_base', 'price_new']);
    expect(await billing.hasActiveSubscription(ctx, ['price_addon'])).toBe(false);
    expect(await billing.hasActiveSubscription(ctx, ['price_new'])).toBe(true);
  });

  it('keeps the single-price form', async () => {
    const sub = await billing.subscribe(ctx, { priceId: 'price_pro', quantity: 3, idempotencyKey: 's1' });
    expect(sub).toMatchObject({ planId: 'price_pro', quantity: 3, items: [{ priceId: 'price_pro', quantity: 3 }] });
    const next = await billing.changePlan(ctx, sub.id, { priceId: 'price_team', idempotencyKey: 'c1' });
    expect(next).toMatchObject({ planId: 'price_team', quantity: 3, items: [{ priceId: 'price_team', quantity: 3 }] });
  });

  it('requires exactly one of priceId or items', async () => {
    const invalid = { code: 'billing/invalid-input' };
    await expect(billing.subscribe(ctx, { idempotencyKey: 's' })).rejects.toMatchObject(invalid);
    await expect(billing.subscribe(ctx, { priceId: 'a', items: [{ priceId: 'b' }], idempotencyKey: 's' })).rejects.toMatchObject(invalid);
    await expect(billing.subscribe(ctx, { items: [], idempotencyKey: 's' })).rejects.toMatchObject(invalid);
    await expect(billing.subscribe(ctx, { items: [{ priceId: 'a' }, { priceId: 'a' }], idempotencyKey: 's' })).rejects.toMatchObject(invalid);
    await expect(billing.subscribe(ctx, { items: [{ priceId: 'a', quantity: 1.5 }], idempotencyKey: 's' })).rejects.toMatchObject(invalid);
    await expect(billing.subscribe(ctx, { items: [{ priceId: 'a' }], quantity: 2, idempotencyKey: 's' })).rejects.toMatchObject(invalid);
    const sub = await billing.subscribe(ctx, { priceId: 'price_pro', idempotencyKey: 's1' });
    await expect(billing.changePlan(ctx, sub.id, { priceId: 'a', items: [{ priceId: 'b' }] })).rejects.toMatchObject(invalid);
    await expect(billing.createCheckout(ctx, { mode: 'subscription', successUrl: 'u', cancelUrl: 'c' })).rejects.toMatchObject(invalid);
  });

  it('previews a plan change without making it, prorated by the time left', async () => {
    adapter.plans.push(plan({ id: 'price_small', amount: 500 }), plan({ id: 'price_big', amount: 2_000 }));
    const sub = await billing.subscribe(ctx, { items: [{ priceId: 'price_small', quantity: 1 }] });
    const half = new Date((sub.currentPeriodStart!.getTime() + sub.currentPeriodEnd!.getTime()) / 2);
    const preview = await billing.previewPlanChange(ctx, sub.id, { items: [{ priceId: 'price_big', quantity: 1 }], prorationDate: half });
    expect(preview.prorationAmount).toBe(750);
    expect(preview.invoiceTotal).toBe(2_750);
    expect(preview.invoiceAt).toEqual(sub.currentPeriodEnd);
    expect(preview.prorationDate).toBe(half);
    expect((await billing.getSubscription(ctx, sub.id)).planId).toBe('price_small');
    const other = createContext({ logger: silent, tenantId: 't2' });
    await expect(billing.previewPlanChange(other, sub.id, { items: [{ priceId: 'price_big' }] })).rejects.toThrow();
  });

  it('creates a checkout for several prices', async () => {
    const items = [{ priceId: 'price_base', quantity: 1 }, { priceId: 'price_metered' }];
    const session = await billing.createCheckout(ctx, { mode: 'subscription', items, successUrl: 'u', cancelUrl: 'c', idempotencyKey: 'co1' });
    expect(adapter.checkouts.get(session.id)?.items).toEqual(items);
    const single = await billing.createCheckout(ctx, { mode: 'payment', priceId: 'price_once', successUrl: 'u', cancelUrl: 'c' });
    expect(adapter.checkouts.get(single.id)?.items).toEqual([{ priceId: 'price_once', quantity: 1 }]);
  });
});

describe('plans by lookup key', () => {
  const ctx = createContext({ logger: silent, tenantId: 't1' });

  it('finds a plan in the mirror first, then from the provider', async () => {
    const adapter = new MemoryBillingAdapter();
    const store = new MemoryBillingStore();
    const billing = new DefaultBilling({ adapter, store }, deps);
    adapter.plans.push(
      plan({ id: 'price_pro', lookupKey: 'pro_monthly', productMetadata: { allowance: '1000' } }),
      plan({ id: 'price_team', lookupKey: 'team_monthly' }),
    );
    expect((await billing.findPlanByLookupKey(ctx, 'pro_monthly'))?.id).toBe('price_pro');
    expect(await billing.findPlanByLookupKey(ctx, 'missing')).toBeNull();

    await store.upsertPlan(plan({ id: 'price_pro_mirrored', lookupKey: 'pro_monthly' }), new Date());
    expect((await billing.findPlanByLookupKey(ctx, 'pro_monthly'))?.id).toBe('price_pro_mirrored');
    await store.upsertPlan(plan({ id: 'price_pro_old', lookupKey: 'pro_monthly', active: false }), new Date());
    expect((await billing.findPlanByLookupKey(ctx, 'pro_monthly'))?.id).toBe('price_pro_mirrored');
  });

  it('filters listPlans by lookup keys, asking the provider when the mirror lacks one', async () => {
    const adapter = new MemoryBillingAdapter();
    const store = new MemoryBillingStore();
    const billing = new DefaultBilling({ adapter, store }, deps);
    adapter.plans.push(plan({ id: 'price_a', lookupKey: 'a' }), plan({ id: 'price_b', lookupKey: 'b' }), plan({ id: 'price_c' }));
    await billing.syncPlans(ctx);
    expect((await billing.listPlans(ctx, { lookupKeys: ['a', 'b'] })).map((p) => p.id)).toEqual(['price_a', 'price_b']);

    adapter.plans.push(plan({ id: 'price_d', lookupKey: 'd' }));
    expect((await billing.listPlans(ctx, { lookupKeys: ['a'] })).map((p) => p.id)).toEqual(['price_a']);
    expect((await billing.listPlans(ctx, { lookupKeys: ['a', 'd'] })).map((p) => p.id)).toEqual(['price_a', 'price_d']);
  });

  it('keeps mirrored product fields when a price webhook carries only the product id', async () => {
    const adapter = new MemoryBillingAdapter();
    const store = new MemoryBillingStore();
    await store.upsertPlan(plan({ id: 'price_pro', name: 'Pro', description: 'For teams', lookupKey: 'pro', productMetadata: { allowance: '1000' } }), new Date(1000));
    const h = createBillingWebhookHandler({ adapter, secret: SECRET, store, idempotency: new InMemoryIdempotencyStore() }, deps);
    const body = stripeEvent(
      'evt_price_upd',
      'price.updated',
      { id: 'price_pro', product: 'prod_1', unit_amount: 900, currency: 'usd', active: true, lookup_key: 'pro_v2' },
      10,
    );
    await h.handle(undefined, Buffer.from(body), MemoryBillingAdapter.sign(body, SECRET));
    expect(await store.findPlan('price_pro')).toMatchObject({
      name: 'Pro',
      description: 'For teams',
      amount: 900,
      lookupKey: 'pro_v2',
      productMetadata: { allowance: '1000' },
    });
  });
});

describe('credit balance resets', () => {
  let billing: DefaultBilling;
  const ctx = createContext({ logger: silent, tenantId: 't1' });

  beforeEach(async () => {
    billing = new DefaultBilling({ adapter: new MemoryBillingAdapter(), store: new MemoryBillingStore() }, deps);
    await billing.ensureCustomer(ctx, { email: 'a@t1' });
  });

  it('appends the one entry that reaches the target, up or down', async () => {
    await billing.grantCredits(ctx, 300, { description: 'top-up', idempotencyKey: 'g1' });
    const up = await billing.setCreditBalance(ctx, 1_000, { description: 'allowance', idempotencyKey: 'period-1' });
    expect(up).toMatchObject({ changed: true, balance: 1_000, transaction: { amount: 700, balanceAfter: 1_000 } });
    await billing.consumeCredits(ctx, 100, { description: 'use', idempotencyKey: 'u1' });
    const down = await billing.setCreditBalance(ctx, 200, { description: 'allowance', idempotencyKey: 'period-2' });
    expect(down).toMatchObject({ changed: true, balance: 200, transaction: { amount: -700 } });
    expect(await billing.getCreditBalance(ctx)).toBe(200);
  });

  it('records nothing for an unchanged balance without a key, and claims a given key', async () => {
    await billing.grantCredits(ctx, 500, { description: 'top-up', idempotencyKey: 'g1' });
    expect(await billing.setCreditBalance(ctx, 500, { description: 'allowance' })).toEqual({ changed: false, balance: 500, transaction: null });
    expect(await billing.listCreditTransactions(ctx)).toHaveLength(1);

    const keyed = await billing.setCreditBalance(ctx, 500, { description: 'allowance', idempotencyKey: 'period-1' });
    expect(keyed).toMatchObject({ changed: false, balance: 500, transaction: { amount: 0, balanceAfter: 500 } });
    // A retry of the same period's reset after spending must not refill.
    await billing.consumeCredits(ctx, 200, { description: 'use', idempotencyKey: 'u1' });
    const retry = await billing.setCreditBalance(ctx, 500, { description: 'allowance', idempotencyKey: 'period-1' });
    expect(retry.transaction?.id).toBe(keyed.transaction?.id);
    expect(await billing.getCreditBalance(ctx)).toBe(300);
  });

  it('returns the original entry when the key is reused', async () => {
    const first = await billing.setCreditBalance(ctx, 1_000, { description: 'allowance', idempotencyKey: 'period-1' });
    const again = await billing.setCreditBalance(ctx, 2_000, { description: 'allowance', idempotencyKey: 'period-1' });
    expect(again).toEqual(first);
    expect(await billing.getCreditBalance(ctx)).toBe(1_000);
  });

  it('accepts any integer target and rejects the rest', async () => {
    expect((await billing.setCreditBalance(ctx, -50, { description: 'debt' })).balance).toBe(-50);
    expect(await billing.getCreditBalance(ctx)).toBe(-50);
    expect((await billing.setCreditBalance(ctx, 0, { description: 'clear' })).transaction?.amount).toBe(50);
    await expect(billing.setCreditBalance(ctx, 1.5, { description: 'x' })).rejects.toMatchObject({ code: 'billing/invalid-input' });
    await expect(billing.setCreditBalance(ctx, 1, { description: 'x', idempotencyKey: '' })).rejects.toMatchObject({
      code: 'billing/idempotency-key-required',
    });
  });

  it('stays exact with concurrent consumes', async () => {
    await billing.grantCredits(ctx, 100, { description: 'top-up', idempotencyKey: 'g1' });
    await Promise.allSettled([
      ...Array.from({ length: 5 }, (_, i) => billing.consumeCredits(ctx, 10, { description: 'use', idempotencyKey: `u${i}` })),
      billing.setCreditBalance(ctx, 1_000, { description: 'allowance', idempotencyKey: 'period-1' }),
      ...Array.from({ length: 5 }, (_, i) => billing.consumeCredits(ctx, 10, { description: 'use', idempotencyKey: `v${i}` })),
    ]);
    const entries = await billing.listCreditTransactions(ctx);
    const sum = entries.reduce((total, t) => total + t.amount, 0);
    expect(await billing.getCreditBalance(ctx)).toBe(sum);
    expect(entries.find((t) => t.idempotencyKey === 'period-1')?.balanceAfter).toBe(1_000);
  });
});

describe('ledger units', () => {
  it('holds a non-money unit end to end', async () => {
    const billing = new DefaultBilling({ adapter: new MemoryBillingAdapter(), store: new MemoryBillingStore() }, deps);
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    await billing.ensureCustomer(ctx, { email: 'a@t1' });
    await billing.grantCredits(ctx, 5_000, { description: 'grant', currency: 'MCR', idempotencyKey: 'g1' });
    await billing.consumeCredits(ctx, 1_250, { description: 'use', currency: 'mcr', idempotencyKey: 'u1' });
    expect(await billing.getCreditBalance(ctx, 'mcr')).toBe(3_750);
    expect(await billing.getCreditBalance(ctx)).toBe(0); // the usd ledger is separate
    const reset = await billing.setCreditBalance(ctx, 10_000, { description: 'allowance', currency: 'mcr', idempotencyKey: 'p1' });
    expect(reset).toMatchObject({ changed: true, balance: 10_000, transaction: { amount: 6_250, currency: 'mcr' } });
    await expect(billing.consumeCredits(ctx, 10_001, { description: 'use', currency: 'mcr', idempotencyKey: 'u2' })).rejects.toMatchObject({
      code: 'billing/insufficient-credits',
    });
  });
});

describe('dimensions', () => {
  let billing: DefaultBilling;
  const t1 = createContext({ logger: silent, tenantId: 't1' });
  const t2 = createContext({ logger: silent, tenantId: 't2' });
  const range = () => ({ from: new Date(0), to: new Date(Date.now() + 60_000) });

  beforeEach(async () => {
    billing = new DefaultBilling({ adapter: new MemoryBillingAdapter(), store: new MemoryBillingStore() }, deps);
    await billing.ensureCustomer(t1, { email: 'a@t1' });
    await billing.ensureCustomer(t2, { email: 'b@t2' });
  });

  it('sums credits and debits per dimension value', async () => {
    await billing.grantCredits(t1, 1_000, { description: 'grant', idempotencyKey: 'g1' });
    await billing.consumeCredits(t1, 100, { description: 'use', dimensions: { project: 'p1', region: 'eu' }, idempotencyKey: 'u1' });
    await billing.consumeCredits(t1, 50, { description: 'use', dimensions: { project: 'p1' }, idempotencyKey: 'u2' });
    await billing.consumeCredits(t1, 30, { description: 'use', dimensions: { project: 'p2' }, idempotencyKey: 'u3' });
    await billing.grantCredits(t1, 20, { description: 'refund', dimensions: { project: 'p2' }, idempotencyKey: 'g2' });
    await billing.grantCredits(t2, 99, { description: 'other tenant', dimensions: { project: 'p1' }, idempotencyKey: 'g3' });

    const summary = await billing.summarizeCredits(t1, { ...range(), groupBy: 'project' });
    expect(summary).toMatchObject({ currency: 'usd', groupBy: 'project' });
    expect(summary.groups).toEqual([
      { value: 'p1', credited: 0, debited: 150 },
      { value: 'p2', credited: 20, debited: 30 },
      { value: null, credited: 1_000, debited: 0 },
    ]);
    expect((await billing.listCreditTransactions(t1, { limit: 5 })).find((t) => t.idempotencyKey === 'u1')?.dimensions).toEqual({
      project: 'p1',
      region: 'eu',
    });
    expect((await billing.summarizeCredits(t1, { ...range(), groupBy: 'project', currency: 'mcr' })).groups).toEqual([]);
  });

  it('breaks usage down per dimension value', async () => {
    await billing.reportUsage(t1, { metricName: 'requests', quantity: 3, dimensions: { project: 'p1' }, idempotencyKey: 'r1' });
    await billing.reportUsage(t1, { metricName: 'requests', quantity: 4, dimensions: { project: 'p1' }, idempotencyKey: 'r2' });
    await billing.reportUsage(t1, { metricName: 'requests', quantity: 5, idempotencyKey: 'r3' });
    await billing.reportUsage(t1, { metricName: 'other', quantity: 7, dimensions: { project: 'p1' }, idempotencyKey: 'r4' });
    await billing.reportUsage(t2, { metricName: 'requests', quantity: 9, dimensions: { project: 'p1' }, idempotencyKey: 'r5' });
    const breakdown = await billing.getUsageBreakdown(t1, 'requests', { ...range(), groupBy: 'project' });
    expect(breakdown).toMatchObject({ metricName: 'requests', groupBy: 'project' });
    expect(breakdown.groups).toEqual([
      { value: 'p1', totalQuantity: 7 },
      { value: null, totalQuantity: 5 },
    ]);
    expect((await billing.getUsage(t1, 'requests', range())).totalQuantity).toBe(12);
  });

  it('validates dimensions and groupBy', async () => {
    const invalid = { code: 'billing/invalid-input' };
    const tooMany = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v']));
    await expect(billing.grantCredits(t1, 1, { description: 'x', dimensions: tooMany })).rejects.toMatchObject(invalid);
    await expect(billing.grantCredits(t1, 1, { description: 'x', dimensions: { k: 'v'.repeat(129) } })).rejects.toMatchObject(invalid);
    await expect(billing.reportUsage(t1, { metricName: 'm', quantity: 1, dimensions: { ['k'.repeat(129)]: 'v' } })).rejects.toMatchObject(invalid);
    await expect(billing.setCreditBalance(t1, 1, { description: 'x', dimensions: { k: 1 as unknown as string } })).rejects.toMatchObject(invalid);
    await expect(billing.summarizeCredits(t1, { ...range(), groupBy: '' })).rejects.toMatchObject(invalid);
    await expect(billing.getUsageBreakdown(t1, 'm', { ...range(), groupBy: 'k'.repeat(129) })).rejects.toMatchObject(invalid);
    const sixteen = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, 'v'.repeat(128)]));
    expect((await billing.grantCredits(t1, 1, { description: 'x', dimensions: sixteen })).dimensions).toEqual(sixteen);
  });
});
