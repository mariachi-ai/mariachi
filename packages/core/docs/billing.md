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

Add the tables from `@mariachi/billing/schema` to your schema so `mariachi db generate` creates them.
Use `adapter: 'memory'` (with `MemoryBillingStore`) in tests.

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
