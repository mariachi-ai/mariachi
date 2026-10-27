import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { StripeAdapter } from './stripe';
import { mapPrice, mapSubscription } from './stripe-mappers';

type Call = { params: Record<string, any>; opts?: Record<string, any> };

/** Records the payloads the adapter sends; answers with just enough of Stripe's shapes. */
function stubStripe(options: { currentItems?: Array<Record<string, any>>; prices?: Array<Record<string, any>> } = {}) {
  const calls = { createSubscription: [] as Call[], updateSubscription: [] as Call[], checkout: [] as Call[], listPrices: [] as Call[], preview: [] as Call[] };
  const subscription = (items: Array<Record<string, any>>) => ({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: items }, metadata: {} });
  const client = {
    customers: { retrieve: async () => ({ id: 'cus_1', metadata: { tenantId: 't1' } }) },
    subscriptions: {
      create: async (params: Record<string, any>, opts: Record<string, any>) => {
        calls.createSubscription.push({ params, opts });
        return subscription(params.items.map((i: Record<string, any>, n: number) => ({ id: `si_${n}`, price: { id: i.price }, quantity: i.quantity })));
      },
      retrieve: async () => subscription(options.currentItems ?? []),
      update: async (_id: string, params: Record<string, any>, opts: Record<string, any>) => {
        calls.updateSubscription.push({ params, opts });
        return subscription(options.currentItems ?? []);
      },
    },
    invoices: {
      createPreview: async (params: Record<string, any>) => {
        calls.preview.push({ params });
        return {
          currency: 'usd',
          total: 9_900 + 5_000,
          next_payment_attempt: 1_800_000_000,
          period_end: 1_800_000_000,
          lines: {
            data: [
              { description: 'Unused time on Starter', amount: -1_000, proration: true },
              { description: 'Remaining time on Team', amount: 6_000, proration: true },
              { description: 'Team', amount: 9_900, proration: false },
            ],
          },
        };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, any>, opts: Record<string, any>) => {
          calls.checkout.push({ params, opts });
          return { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' };
        },
      },
    },
    prices: {
      list: (params: Record<string, any>) => {
        calls.listPrices.push({ params });
        const all = options.prices ?? [];
        const matching = params.lookup_keys ? all.filter((p) => params.lookup_keys.includes(p.lookup_key)) : all;
        return (async function* () {
          yield* matching;
        })();
      },
    },
  };
  return { calls, adapter: new StripeAdapter({ secretKey: '', client: client as unknown as Stripe }) };
}

describe('StripeAdapter subscription items', () => {
  it('creates a subscription with several prices and no quantity for a metered one', async () => {
    const { adapter, calls } = stubStripe();
    const sub = await adapter.createSubscription(
      { customerId: 'cus_1', items: [{ priceId: 'price_seat', quantity: 3 }, { priceId: 'price_metered' }] },
      { idempotencyKey: 'k1' },
    );
    expect(calls.createSubscription[0].params.items).toStrictEqual([{ price: 'price_seat', quantity: 3 }, { price: 'price_metered' }]);
    expect(calls.createSubscription[0].opts).toEqual({ idempotencyKey: 'k1' });
    expect(sub.planId).toBe('price_seat');
    expect(sub.items).toEqual([
      { id: 'si_0', priceId: 'price_seat', quantity: 3 },
      { id: 'si_1', priceId: 'price_metered', quantity: null },
    ]);
  });

  it('keeps the single-price form', async () => {
    const { adapter, calls } = stubStripe();
    await adapter.createSubscription({ customerId: 'cus_1', priceId: 'price_pro' });
    expect(calls.createSubscription[0].params.items).toStrictEqual([{ price: 'price_pro' }]);
    await adapter.createSubscription({ customerId: 'cus_1', priceId: 'price_pro', quantity: 2 });
    expect(calls.createSubscription[1].params.items).toStrictEqual([{ price: 'price_pro', quantity: 2 }]);
  });

  it('replaces the item set on update: keeps, deletes and adds by price', async () => {
    const { adapter, calls } = stubStripe({
      currentItems: [
        { id: 'si_seat', price: { id: 'price_seat' }, quantity: 3 },
        { id: 'si_old', price: { id: 'price_old' }, quantity: 1 },
        { id: 'si_metered', price: { id: 'price_metered' } },
      ],
    });
    await adapter.updateSubscription(
      'sub_1',
      { items: [{ priceId: 'price_seat', quantity: 5 }, { priceId: 'price_metered' }, { priceId: 'price_new' }], prorationBehavior: 'none' },
      { idempotencyKey: 'k2' },
    );
    expect(calls.updateSubscription[0].params).toMatchObject({
      items: [{ id: 'si_seat', quantity: 5 }, { id: 'si_old', deleted: true }, { price: 'price_new' }],
      proration_behavior: 'none',
    });
    expect(calls.updateSubscription[0].opts).toEqual({ idempotencyKey: 'k2' });
  });

  it('sends no items when the set is unchanged, and keeps the single-price update', async () => {
    const { adapter, calls } = stubStripe({ currentItems: [{ id: 'si_seat', price: { id: 'price_seat' }, quantity: 3 }] });
    await adapter.updateSubscription('sub_1', { items: [{ priceId: 'price_seat' }], metadata: { a: 'b' } });
    expect(calls.updateSubscription[0].params.items).toBeUndefined();
    await adapter.updateSubscription('sub_1', { priceId: 'price_team', quantity: 4 });
    expect(calls.updateSubscription[1].params.items).toEqual([{ id: 'si_seat', price: 'price_team', quantity: 4 }]);
  });

  it('previews a change with the same item set the update sends, and updates at the previewed time', async () => {
    const { adapter, calls } = stubStripe({
      currentItems: [
        { id: 'si_base', price: { id: 'price_starter' }, quantity: 1 },
        { id: 'si_over', price: { id: 'price_over_starter' } },
      ],
    });
    const items = [{ priceId: 'price_team', quantity: 1 }, { priceId: 'price_over_team' }];
    const at = new Date(1_790_000_000_000);
    const preview = await adapter.previewSubscriptionChange('sub_1', { items, prorationBehavior: 'create_prorations', prorationDate: at });
    expect(calls.preview[0].params).toStrictEqual({
      customer: 'cus_1',
      subscription: 'sub_1',
      subscription_details: {
        items: [{ id: 'si_base', deleted: true }, { id: 'si_over', deleted: true }, { price: 'price_team', quantity: 1 }, { price: 'price_over_team' }],
        proration_behavior: 'create_prorations',
        proration_date: 1_790_000_000,
      },
    });
    expect(preview.prorationAmount).toBe(5_000);
    expect(preview.invoiceTotal).toBe(14_900);
    expect(preview.invoiceAt).toEqual(new Date(1_800_000_000_000));
    expect(preview.prorationDate).toBe(at);

    await adapter.updateSubscription('sub_1', { items, prorationBehavior: 'create_prorations', prorationDate: preview.prorationDate });
    expect(calls.updateSubscription[0].params.proration_date).toBe(1_790_000_000);
    expect(calls.updateSubscription[0].params.items).toStrictEqual(calls.preview[0].params.subscription_details.items);
  });

  it('builds checkout line items from items, quantity only when given', async () => {
    const { adapter, calls } = stubStripe();
    const base = { customerId: 'cus_1', mode: 'subscription' as const, successUrl: 'https://a.test/ok', cancelUrl: 'https://a.test/no' };
    await adapter.createCheckoutSession({ ...base, items: [{ priceId: 'price_seat', quantity: 2 }, { priceId: 'price_metered' }] });
    expect(calls.checkout[0].params.line_items).toStrictEqual([{ price: 'price_seat', quantity: 2 }, { price: 'price_metered' }]);
    await adapter.createCheckoutSession({ ...base, priceId: 'price_pro' });
    expect(calls.checkout[1].params.line_items).toStrictEqual([{ price: 'price_pro', quantity: 1 }]);
  });
});

describe('StripeAdapter plans', () => {
  const price = (id: string, lookupKey: string | null) => ({
    id,
    product: { id: 'prod_1', name: 'Product', metadata: { allowance: '1000' } },
    unit_amount: 500,
    currency: 'usd',
    active: true,
    lookup_key: lookupKey,
    metadata: { tier: 'pro' },
  });

  it('lists prices by lookup key, at most 10 keys per request', async () => {
    const keys = Array.from({ length: 12 }, (_, i) => `key_${i}`);
    const { adapter, calls } = stubStripe({ prices: [price('price_a', 'key_0'), price('price_b', 'key_11'), price('price_c', null)] });
    const plans = await adapter.listPlans({ lookupKeys: keys });
    expect(calls.listPrices.map((c) => c.params.lookup_keys)).toEqual([keys.slice(0, 10), keys.slice(10)]);
    expect(calls.listPrices[0].params).toMatchObject({ active: true, expand: ['data.product'] });
    expect(plans.map((p) => p.id)).toEqual(['price_a', 'price_b']);
    expect(plans[0]).toMatchObject({ lookupKey: 'key_0', metadata: { tier: 'pro' }, productMetadata: { allowance: '1000' } });
  });

  it('lists every price, active or not, when activeOnly is false', async () => {
    const { adapter, calls } = stubStripe({ prices: [price('price_a', null)] });
    await adapter.listPlans({ activeOnly: false });
    expect(calls.listPrices[0].params.active).toBeUndefined();
    expect(calls.listPrices[0].params.lookup_keys).toBeUndefined();
  });
});

describe('Stripe mappers', () => {
  it('maps every subscription item, metered ones without a quantity', () => {
    const sub = mapSubscription({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      items: { data: [{ id: 'si_1', price: { id: 'price_seat' }, quantity: 2 }, { id: 'si_2', price: 'price_metered' }] },
    });
    expect(sub).toMatchObject({ planId: 'price_seat', quantity: 2 });
    expect(sub.items).toEqual([
      { id: 'si_1', priceId: 'price_seat', quantity: 2 },
      { id: 'si_2', priceId: 'price_metered', quantity: null },
    ]);
  });

  it('maps lookup keys, and product metadata only from an expanded product', () => {
    expect(mapPrice({ id: 'price_1', product: 'prod_1', lookup_key: 'pro_monthly', active: true })).toMatchObject({
      lookupKey: 'pro_monthly',
      productMetadata: {},
    });
    expect(mapPrice({ id: 'price_1', product: { id: 'prod_1', metadata: { a: 'b' } }, active: true })).toMatchObject({
      productId: 'prod_1',
      lookupKey: null,
      productMetadata: { a: 'b' },
    });
  });
});
