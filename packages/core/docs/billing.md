# Billing

`@mariachi/billing` takes payments through Stripe and mirrors what matters into your Postgres
database: customers, subscriptions, plans, charges, refunds, invoices, disputes, usage and a prepaid
credit ledger. Your code reads the mirror (fast, tenant-scoped, works when Stripe is slow) and Stripe
webhooks keep it current.

## Wire it

```ts
import { DefaultBilling, createBillingAdapter, createBillingWebhookHandler } from '@mariachi/billing';
import { DrizzleBillingStore } from '@mariachi/billing/postgres';
import { RedisIdempotencyStore } from '@mariachi/cache';

const adapter = createBillingAdapter({ adapter: 'stripe', secretKey: config.billing.secretKey });
const store = new DrizzleBillingStore(db);
const billing = new DefaultBilling({ adapter, store, defaultCurrency: 'usd' }, instrumentation);

const stripeWebhooks = createBillingWebhookHandler({
  adapter,
  store,
  secret: config.billing.webhookSecret,
  idempotency: new RedisIdempotencyStore(redis),   // cross-instance dedup; memory is single-instance only
  requireLivemode: config.env === 'production',
  on: {
    'subscription.canceled': async (ctx, event) => entitlements.revoke(ctx, event.subscription),
    'invoice.payment_failed': async (ctx, event) => dunning.start(ctx, event.invoice),
  },
}, instrumentation);
```

Add the tables from `@mariachi/billing/schema` to your schema so `mariachi db generate` creates them,
and run it again after upgrading the package, since new versions can add columns. Use
`adapter: 'memory'` (with `MemoryBillingStore`) in tests.

## Every call is tenant-scoped

Service methods take `ctx` and use `ctx.tenantId`. A tenant has one Stripe customer
(`ensureCustomer` is safe to call concurrently), and a subscription, charge or invoice id belonging to
another tenant is reported as not found. Calls without a tenant throw `billing/tenant-required`.

```ts
await billing.ensureCustomer(ctx, { email: user.email, name: org.name });
const sub = await billing.subscribe(ctx, { priceId: 'price_pro', trialDays: 14, idempotencyKey: `signup:${org.id}` });
await billing.changePlan(ctx, sub.id, { priceId: 'price_team', quantity: 5 });
await billing.pauseSubscription(ctx, sub.id);    // and resumeSubscription, cancelSubscription(ctx, id, { atPeriodEnd })
if (!(await billing.hasActiveSubscription(ctx, ['price_pro', 'price_team']))) {
  throw new BillingError('billing/payment-failed', 'An active Pro or Team plan is required'); // 402
}
```

`hasActiveSubscription` counts `active`, `trialing` and `past_due` (`ENTITLED_STATUSES`).

## Several prices on one subscription

Pass `items` instead of `priceId` to put several prices on one subscription, for example a base
fee plus a metered price. Give exactly one of the two (`billing/invalid-input` otherwise). Leave
`quantity` off a metered price: Stripe rejects a quantity there, so it is only sent when you give
one.

```ts
const sub = await billing.subscribe(ctx, {
  items: [{ priceId: 'price_base', quantity: 5 }, { priceId: 'price_usage' }],
  idempotencyKey: `signup:${org.id}`,
});
sub.items;   // [{ id: 'si_…', priceId: 'price_base', quantity: 5 }, { id: 'si_…', priceId: 'price_usage', quantity: null }]
sub.planId;  // 'price_base': the first item's price

// Replaces the item set: price_base is kept with the new quantity, price_usage removed, price_extra added.
await billing.changePlan(ctx, sub.id, {
  items: [{ priceId: 'price_base', quantity: 8 }, { priceId: 'price_extra' }],
  prorationBehavior: 'create_prorations',
});

await billing.createCheckout(ctx, { mode: 'subscription', items: [{ priceId: 'price_base', quantity: 1 }, { priceId: 'price_usage' }], successUrl, cancelUrl });
```

`planId` and `quantity` describe the first item; `hasActiveSubscription(ctx, planIds)` matches any
item's price. With `items`, checkout sends a quantity only when you give one, so give it for
licensed prices. The single-price form (`priceId`, `quantity`) works as before: on `changePlan` it
changes the first item only.

## Money movement and idempotency

Stripe calls carry an idempotency key. Pass your own for anything a user or a job can retry, so
the retry reuses it and Stripe returns the first result instead of charging twice. When you omit
it, a unique key is generated for that call, which protects against network-level retries inside
the SDK only. An empty string is rejected (`billing/idempotency-key-required`).

```ts
const charge = await billing.charge(ctx, { amount: 4_900, idempotencyKey: `order:${order.id}` }); // minor units
await billing.refund(ctx, charge.id, { amount: 1_000, reason: 'requested_by_customer', idempotencyKey: `refund:${ticket.id}` });
```

Amounts are integers in the currency's minor unit (cents).

## Plans

`syncPlans(ctx)` copies Stripe's prices into `billing_plans`, and `price.created/updated/deleted`
webhooks keep the mirror current after that. `listPlans(ctx)` reads the mirror once it has rows,
and Stripe otherwise; pass `{ source: 'provider' }` to always ask Stripe.

Give prices a Stripe lookup key and refer to plans by it rather than by price id, so a price can be
replaced (move the key with `transfer_lookup_key`) without a deploy:

```ts
const pro = await billing.findPlanByLookupKey(ctx, 'pro_monthly');   // mirror first, then Stripe; null if none
await billing.listPlans(ctx, { lookupKeys: ['pro_monthly', 'pro_yearly'] });
Number(pro?.productMetadata.allowance ?? 0);                           // the product's metadata
```

`Plan.lookupKey` is the price's `lookup_key`, `metadata` the price's metadata and `productMetadata`
the product's. `findPlanByLookupKey` can return an archived price (check `active`). `listPlans`
with `lookupKeys` asks Stripe when the mirror lacks one of the keys. Price webhooks carry only the
product id, so the mirror keeps the product fields from the last `syncPlans`: run it again after
changing a product.

## Usage and credits

```ts
await billing.reportUsage(ctx, { metricName: 'api_calls', quantity: 1, idempotencyKey: requestId }); // false on a duplicate
await billing.getUsage(ctx, 'api_calls', { from: monthStart, to: now });

await billing.grantCredits(ctx, 1_000, { description: 'Welcome credits', idempotencyKey: `welcome:${org.id}` });
await billing.consumeCredits(ctx, 25, { description: 'Report export', referenceType: 'export', referenceId: exportId });
await billing.getCreditBalance(ctx);
```

Usage is recorded locally first (deduplicated by key), then reported to Stripe. The credit ledger is
local and append-only: each entry stores `balanceAfter`, computed under a per-customer Postgres
advisory lock, so concurrent consumers can't overdraw. Insufficient balance throws
`billing/insufficient-credits` (HTTP 402) unless you pass `allowNegative`.

### The ledger's unit

A ledger is kept per `currency`, which is any 3-letter unit code: an ISO currency (`usd`) or a unit
of your own, so a ledger can hold credits rather than money. Amounts are integers in that unit,
so pick a unit small enough to need no fractions, for example `mcr` for millicredits:

```ts
await billing.grantCredits(ctx, 5_000, { currency: 'mcr', description: 'Starter pack', idempotencyKey: `pack:${order.id}` });
await billing.consumeCredits(ctx, 1_250, { currency: 'mcr', description: 'Job', referenceType: 'job', referenceId: job.id });
await billing.getCreditBalance(ctx, 'mcr');   // 3_750; each unit has its own balance
```

Codes are lowercased, and `defaultCurrency` is the unit used when you pass none.

### Allowances that reset

`setCreditBalance(ctx, target, options)` appends the one entry that brings the balance to exactly
`target`, computed under the same lock as consumption, so a concurrent consume lands either before
or after the reset, never half way. For a monthly allowance that doesn't roll over, reset at each
period start with a key per period:

```ts
const result = await billing.setCreditBalance(ctx, plan.allowance, {
  currency: 'mcr',
  description: 'Monthly allowance',
  idempotencyKey: `allowance:${sub.id}:${sub.currentPeriodStart!.toISOString()}`,
});
// { changed: true, balance: 10_000, transaction: { amount: 6_250, ... } }
```

`target` is any integer (a negative one records a debt). When the balance already is the target,
`changed` is false: without an `idempotencyKey` nothing is recorded (`transaction: null`); with one,
a zero-amount entry claims the key, so a retry of the same reset after the customer has spent
stays a no-op instead of refilling. Reusing a key returns the original entry, as with
`grantCredits`.

### Breakdowns by dimension

Ledger entries and usage records take optional `dimensions`, string labels of your own (at most
16 keys, keys and values up to 128 characters), to attribute spend to a sub-account, region, cost
centre or anything else. Read them back summed per value of one key:

```ts
await billing.consumeCredits(ctx, 40, { description: 'Run', dimensions: { project: project.id, region: 'eu' } });
await billing.reportUsage(ctx, { metricName: 'api_calls', quantity: 1, dimensions: { project: project.id } });

await billing.summarizeCredits(ctx, { from: monthStart, to: now, groupBy: 'project' });
// { currency: 'usd', groupBy: 'project', groups: [{ value: 'prj_1', credited: 0, debited: 40 }, { value: null, ... }] }
await billing.getUsageBreakdown(ctx, 'api_calls', { from: monthStart, to: now, groupBy: 'project' });
// { metricName: 'api_calls', groupBy: 'project', groups: [{ value: 'prj_1', totalQuantity: 1 }, ...] }
```

Entries without the key are grouped under `null`, listed last. `credited` and `debited` include
`setCreditBalance` resets. Dimensions stay local; they aren't sent to Stripe. Breakdowns read the
tenant's rows in the range through the existing indexes; if you often group a large ledger by one
key, add an expression index for it in your own migration, e.g.
`create index on billing_credit_transactions (tenant_id, (dimensions->>'project'))`.

## Webhooks

Pass the raw request body and the `stripe-signature` header. Parsed JSON won't verify.

```ts
const result = await stripeWebhooks.handle(ctx, rawBody, headers['stripe-signature']);
// result.outcome: 'processed' | 'duplicate' | 'in-progress' | 'ignored'
```

What the handler guarantees:

1. The signature is checked before anything else.
2. The event id is claimed and marked complete only after the mirror update and every handler
   succeed. If a handler throws, the claim is released and Stripe's retry is processed, not dropped.
3. Mirror updates are versioned by Stripe's event time, so a late delivery never overwrites newer
   state.
4. Each event is stored in `billing_webhook_events` with its status (`processing`, `processed`,
   `failed`, `ignored`), attempt count and payload. Fix the cause, then re-run a failed event with
   `stripeWebhooks.replay(ctx, eventId)`.

Handlers receive a `ctx` whose `tenantId` is the event's tenant (from `metadata.tenantId` or the
mirrored customer). Normalized event types: `customer.synced`, `customer.deleted`,
`subscription.synced`, `subscription.canceled`, `subscription.trial_will_end`, `invoice.paid`,
`invoice.payment_failed`, `payment.succeeded`, `payment.failed`, `charge.refunded`,
`dispute.created`, `dispute.closed`, `checkout.completed` and `plan.synced`.

## Errors

`BillingError` codes include `billing/tenant-required`, `billing/idempotency-key-required`,
`billing/invalid-input`, `billing/subscription-exists`, `billing/subscription-not-found`,
`billing/insufficient-credits`, `billing/webhook-not-replayable` and `billing/webhook-not-found`.
Stripe errors are mapped by `mapStripeError`, and card declines keep Stripe's decline code in the
metadata.
