# @mariachi/billing

Stripe billing with a local Postgres mirror: customers, subscriptions, plans, charges, refunds,
invoices, disputes, metered usage and a prepaid credit ledger, kept current by verified,
deduplicated and replayable webhooks. Every operation is scoped to `ctx.tenantId`.

**Status: beta.** Covered by unit tests and Postgres integration tests. The API can change before 1.0.

Guide: [billing.md](../core/docs/billing.md)

## Imports

| Import | Contents |
| --- | --- |
| `@mariachi/billing` | Service, adapters, webhook handler, memory store, types |
| `@mariachi/billing/schema` | `billing_*` tables for your schema |
| `@mariachi/billing/postgres` | `DrizzleBillingStore`, `billingTables` (needs `@mariachi/database-postgres`, `drizzle-orm`) |

## Public API

| Export | Purpose |
| --- | --- |
| `DefaultBilling` | Tenant-scoped service: `ensureCustomer`, `subscribe`, `changePlan`, `pauseSubscription`, `resumeSubscription`, `cancelSubscription`, `hasActiveSubscription`, `charge`, `refund`, `createCheckout`, `createPortal`, `listInvoices`, `listPlans`, `syncPlans`, `reportUsage`, `getUsage`, `grantCredits`, `consumeCredits`, `getCreditBalance`, `listCreditTransactions` |
| `createBillingAdapter(config)` | `StripeAdapter` or `MemoryBillingAdapter` |
| `createBillingWebhookHandler(config)` | `handle(ctx, rawBody, signature)` and `replay(ctx, eventId)` |
| `DrizzleBillingStore`, `MemoryBillingStore` | The local mirror (`BillingStore`) |
| `ENTITLED_STATUSES`, `mapStripeError`, `normalizeAndSync` | Helpers |

## Config

| Setting | Where | Notes |
| --- | --- | --- |
| `adapter` | `createBillingAdapter` | `'stripe'` or `'memory'` |
| `secretKey`, `apiVersion`, `maxNetworkRetries`, `timeoutMs` | Stripe adapter | From `useConfig()`, never `process.env` |
| `secret` | webhook handler | Stripe webhook signing secret (required) |
| `idempotency` | webhook handler | Cross-instance dedup; use `RedisIdempotencyStore` in production |
| `requireLivemode` | webhook handler | Reject test-mode events in production |
| `defaultCurrency` | `DefaultBilling` | Default `usd` |

Amounts are integers in the currency's minor unit. Errors are `BillingError`; see the guide.
