# Mariachi Framework — Improvement Plan

> This document proposes structural improvements to every package in the Mariachi framework.
> The three pillars are:
> 1. **Abstract service classes** — every package gets an abstract class that layers observability, error handling, and extensibility on top of raw adapters
> 2. **No in-memory anything** — remove all in-memory adapters from production packages; test doubles live exclusively in `@mariachi/testing`
> 3. **Deep billing overhaul** — DB schemas, full webhook handling, usage-based billing, tracing

---

## Table of Contents

1. [Design Pattern: Abstract Service Classes](#1-design-pattern-abstract-service-classes)
2. [Remove All In-Memory Adapters](#2-remove-all-in-memory-adapters)
3. [Package-by-Package Improvements](#3-package-by-package-improvements)
4. [Billing Deep Dive](#4-billing-deep-dive)
5. [Cross-Cutting: Observability Everywhere](#5-cross-cutting-observability-everywhere)
6. [New Package: @mariachi/errors](#6-new-package-mariachiretry)

---

## 1. Design Pattern: Abstract Service Classes

### The Problem

Right now, most packages export raw adapter interfaces and factory functions. The consumer gets a `CacheClient` or `EmailAdapter` and calls methods directly. There is no built-in observability, no automatic error wrapping, no lifecycle hooks. Each consuming service has to wire these concerns manually — and when an AI generates code, it will skip them.

### The Solution

Every package that wraps an external dependency gets an **abstract service class** that:
- Holds all adapters and configuration for that domain
- Wraps every operation with observability (logging, tracing, metrics)
- Provides higher-level methods that compose raw adapter calls
- Is subclassed by the app when custom behavior is needed

### Pattern

```ts
// packages/notifications/src/notifications.ts
import type { Logger, Context } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/observability';

export interface NotificationsConfig {
  email: EmailAdapter;
  inApp: InAppNotificationStore;
  logger: Logger;
  tracer?: TracerAdapter;
  metrics?: MetricsAdapter;
}

export abstract class Notifications {
  protected readonly email: EmailAdapter;
  protected readonly inApp: InAppNotificationStore;
  protected readonly logger: Logger;
  protected readonly tracer?: TracerAdapter;
  protected readonly metrics?: MetricsAdapter;

  constructor(config: NotificationsConfig) {
    this.email = config.email;
    this.inApp = config.inApp;
    this.logger = config.logger;
    this.tracer = config.tracer;
    this.metrics = config.metrics;
  }

  async sendEmail(ctx: Context, message: EmailMessage): Promise<{ id: string }> {
    const span = this.tracer?.startSpan('notifications.sendEmail', {
      to: Array.isArray(message.to) ? message.to.join(',') : message.to,
      subject: message.subject,
    });

    try {
      this.logger.info({ traceId: ctx.traceId, to: message.to }, 'Sending email');
      const result = await this.email.send(message);
      this.metrics?.increment('notifications.email.sent', 1, { templateId: message.templateId ?? 'none' });
      span?.setStatus('ok');
      return result;
    } catch (error) {
      span?.setStatus('error', (error as Error).message);
      this.metrics?.increment('notifications.email.failed');
      this.logger.error({ traceId: ctx.traceId, error }, 'Email send failed');
      throw new NotificationError('notifications/email-send-failed', (error as Error).message, { to: message.to });
    } finally {
      span?.end();
    }
  }

  async sendInApp(ctx: Context, notification: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>): Promise<InAppNotification> {
    // Same pattern: span, log, metrics, error wrapping
  }

  // Hooks for subclasses
  protected onEmailSent?(ctx: Context, message: EmailMessage, result: { id: string }): Promise<void>;
  protected onEmailFailed?(ctx: Context, message: EmailMessage, error: Error): Promise<void>;
}
```

### Which packages get abstract classes

| Package | Abstract Class | Wraps |
|---|---|---|
| `@mariachi/notifications` | `Notifications` | EmailAdapter, InAppStore, SMS, Push |
| `@mariachi/billing` | `Billing` | BillingAdapter, WebhookHandler, DB repos |
| `@mariachi/storage` | `Storage` | StorageClient |
| `@mariachi/search` | `Search` | SearchClient, SearchIndexer |
| `@mariachi/ai` | `AI` | SessionManager, ToolRegistry, PromptRegistry, Telemetry |
| `@mariachi/cache` | `Cache` | CacheClient, DistributedLock |
| `@mariachi/events` | `Events` | EventBus |
| `@mariachi/jobs` | `Jobs` | JobQueue, JobWorker, JobScheduler |
| `@mariachi/auth` | `Auth` | AuthenticationAdapter, AuthorizationAdapter |
| `@mariachi/database` | `Database` | DatabaseClient, BaseRepository (already has this partially) |
| `@mariachi/audit` | `Audit` | AuditLogger, AuditQuery |
| `@mariachi/rate-limit` | `RateLimiting` | RateLimiter |

### What each abstract class provides

Every abstract class follows this contract:

1. **Constructor takes all dependencies** — adapters, logger, tracer, metrics
2. **Every public method wraps with**: span start/end, structured log entry, metric increment, typed error catch
3. **Lifecycle hooks** — `protected` methods that subclasses can override (`onBeforeX`, `onAfterX`, `onXFailed`)
4. **Context threading** — every public method takes `ctx: Context` as first arg

### Why abstract and not concrete?

The abstract class provides a default implementation for everything. But the app can subclass to:
- Override `sendEmail()` to add unsubscribe checking
- Override `createSubscription()` to add a custom approval flow
- Add business-specific hooks like `onPaymentFailed()` → suspend account

If no customization is needed, a `DefaultNotifications extends Notifications` is provided with no-op hooks.

---

## 2. Remove All In-Memory Adapters

### The Problem

If two pods of the same deployment share an in-memory cache, event bus, or rate limiter, state diverges immediately. In-memory adapters are a lie — they work in dev but break silently in production.

### What to remove

| Package | In-Memory Adapter | Replacement Strategy |
|---|---|---|
| `@mariachi/cache` | `MemoryCacheAdapter` | Remove. Use Redis always. For local dev: Redis via Docker or `redis-server`. |
| `@mariachi/events` | `MemoryEventBusAdapter` | Remove. Use Redis Pub/Sub always. Same local dev story. |
| `@mariachi/jobs` | `MemoryJobAdapter` | Remove. Use BullMQ + Redis always. |
| `@mariachi/rate-limit` | `MemoryRateLimiter` | Remove. Use Redis always. |
| `@mariachi/search` | `MemorySearchAdapter` | Remove. Use Typesense always. Local dev: Typesense Docker container. |
| `@mariachi/notifications` | `MemoryEmailAdapter`, `InMemoryInAppStore` | Remove. Email: use Resend (or mailpit for local). InApp: use database-backed store. |
| `@mariachi/config` | `MemoryFeatureFlagAdapter` | Remove. Use DB-backed flags or a real provider. |
| `@mariachi/auth` | RBAC in-memory roles | Move to database-backed RBAC. |
| `@mariachi/ai` | Sessions in-memory in SessionManager | Move to database-backed sessions. |

### Where in-memory is fine

- `@mariachi/testing` — test doubles are in-memory by design. This is the only place.
- `@mariachi/observability` — noop adapters stay (they're intentionally no-op, not pretending to work).

### Local dev story

Add a `docker-compose.dev.yml` to the root:

```yaml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: mariachi_dev
      POSTGRES_PASSWORD: dev

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  typesense:
    image: typesense/typesense:27.1
    ports: ["8108:8108"]
    environment:
      TYPESENSE_API_KEY: dev-key
      TYPESENSE_DATA_DIR: /data

  mailpit:
    image: axllent/mailpit
    ports: ["1025:1025", "8025:8025"]
```

This gives every developer (and AI agent) a one-command local environment: `docker compose -f docker-compose.dev.yml up -d`.

---

## 3. Package-by-Package Improvements

### @mariachi/core

**Current state:** Complete. Has Context, errors, Result type, container.

**Improvements:**
- Add `Instrumentable` interface that all abstract classes implement:
  ```ts
  interface Instrumentable {
    readonly logger: Logger;
    readonly tracer?: TracerAdapter;
    readonly metrics?: MetricsAdapter;
  }
  ```
- Add `withSpan<T>(tracer, name, attrs, fn): Promise<T>` utility to avoid repetitive span boilerplate
- Add `RetryConfig` and `retry<T>(fn, config): Promise<T>` utility with exponential backoff, jitter
- Add a standard `Disposable` interface (`connect()`, `disconnect()`, `isHealthy()`) for all infrastructure

### @mariachi/config

**Current state:** Loads .env, validates with Zod, has secrets adapter.

**Improvements:**
- Remove `MemoryFeatureFlagAdapter`
- Add `DatabaseFeatureFlagAdapter` that reads flags from a Drizzle table
- Add config watching / hot-reload support (watch .env changes, poll DB flags)
- Add `configSchema` extension point so each package can register its own config section
- Add typed `secrets.getOrThrow(key)` that throws `ConfigError` instead of returning undefined

### @mariachi/observability

**Current state:** Pino logger works. Tracing, metrics, errors are all noop.

**Improvements:**
- Implement real `OpenTelemetryTracerAdapter` using `@opentelemetry/sdk-node`
- Implement `PrometheusMetricsAdapter` for real metric collection
- Implement `SentryErrorTracker` for real error reporting
- Add `instrumentMethod(target, methodName, spanName)` decorator/utility for auto-instrumenting class methods
- Add `requestDuration`, `requestCount`, `errorCount` standard metrics
- Add log correlation: every log entry automatically includes traceId from active span

### @mariachi/lifecycle

**Current state:** Good. Bootstrap, startup/shutdown, health checks.

**Improvements:**
- Add dependency-aware startup ordering (e.g., DB before cache before events)
- Add readiness checks that verify real connectivity (ping DB, ping Redis, ping Typesense)
- Add `bootstrapForTest()` that wires everything with test doubles from `@mariachi/testing`
- Integrate the abstract service classes into bootstrap: create `Notifications`, `Billing`, `Storage`, etc. and register in container

### @mariachi/communication

**Current state:** InProcessAdapter with middleware pipeline.

**Improvements:**
- Add automatic tracing: every `call()` creates a span
- Add automatic metrics: request count, latency histogram, error rate per procedure
- Add timeout support: `call('name', ctx, input, { timeoutMs: 5000 })`
- Add circuit breaker for remote calls (when microservice mode is used)
- Remove in-process as the only option: the in-process adapter is fine for monolith — it's not "in-memory" in the cache sense, it's the intended transport

### @mariachi/database

**Current state:** BaseRepository abstract class, Drizzle + Postgres adapter.

**Improvements:**
- Add automatic query tracing: every repository method creates a span with query info
- Add query timing metrics
- Add connection pool health check for lifecycle
- Add `BaseRepository.withTransaction(ctx, fn)` for atomic operations
- Add optimistic locking support (`version` column)
- Add more schema definitions (customers, subscriptions, invoices, credit_transactions, feature_flags, api_keys, notifications, ai_sessions, ai_messages, ai_telemetry, audit_logs references)

### @mariachi/cache

**Current state:** Redis adapter + memory adapter. Lock. Memoize.

**Improvements:**
- Remove `MemoryCacheAdapter`
- Add abstract `Cache` class:
  ```ts
  abstract class Cache implements Instrumentable {
    async get<T>(ctx: Context, key: string): Promise<T | null> {
      // span, log, metric (hit/miss), delegate to adapter
    }
    async set(ctx: Context, key: string, value: unknown, ttl?: number): Promise<void> {
      // span, log, metric, delegate
    }
    // ... etc
  }
  ```
- Add cache stampede prevention (probabilistic early recomputation)
- Add `cache.getOrSet(key, fn, ttl)` pattern that handles cache-aside automatically
- Add health check (Redis PING)

### @mariachi/events

**Current state:** Redis Pub/Sub + memory bus.

**Improvements:**
- Remove `MemoryEventBusAdapter`
- Add abstract `Events` class with observability on every publish/subscribe
- Add dead letter handling: failed event handlers get retried, then sent to a dead letter topic
- Add event schema versioning: events carry a `version` field, consumers can handle migrations
- Add event tracing: each published event carries `traceId`, subscribers create child spans
- Add `Events.publishAndWait()` for request-reply patterns
- Add event replay: store recent events in Redis Streams (not just Pub/Sub) for at-least-once delivery

### @mariachi/jobs

**Current state:** BullMQ + memory adapter.

**Improvements:**
- Remove `MemoryJobAdapter`
- Add abstract `Jobs` class with observability on enqueue/process
- Add automatic job tracing: each job creates a span linked to the originating request's traceId
- Add job metrics: enqueued count, processed count, failed count, processing duration by job name
- Add dead letter queue handling
- Add job priority tiers (critical, high, normal, low)
- Add `Jobs.enqueueWithDedup(name, data, dedupKey)` — prevents duplicate jobs

### @mariachi/auth

**Current state:** JWT adapter, API key adapter, in-memory RBAC.

**Improvements:**
- Move RBAC to database-backed (Drizzle schema for `roles`, `permissions`, `user_roles`)
- Add abstract `Auth` class:
  ```ts
  abstract class Auth implements Instrumentable {
    async authenticate(ctx: Context, token: string): Promise<ResolvedIdentity> {
      // span, log, metric (success/failure), delegate
    }
    async authorize(ctx: Context, action: string, resource: string): Promise<boolean> {
      // span, log, metric, delegate
    }
  }
  ```
- Add OAuth adapter (authorization code flow, token refresh)
- Add session management (create, revoke, list active sessions)
- Add API key rotation support
- Add brute force protection (lock account after N failed attempts — stored in cache/DB, not memory)

### @mariachi/tenancy

**Current state:** Resolver + middleware. Lightweight.

**Improvements:**
- Add tenant provisioning: `createTenant()`, `suspendTenant()`, `deleteTenant()`
- Add per-tenant config overrides (stored in DB, resolved through config layer)
- Add tenant usage tracking (requests, storage, AI tokens — for billing)
- Add abstract `Tenancy` class with observability

### @mariachi/rate-limit

**Current state:** Redis sliding window + memory adapter.

**Improvements:**
- Remove `MemoryRateLimiter`
- Add abstract `RateLimiting` class
- Add multiple algorithm support: token bucket, fixed window, leaky bucket (not just sliding window)
- Add rate limit headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Add per-tenant rate limits (different tiers get different limits)
- Add rate limit metrics: how many requests are being throttled, by whom

### @mariachi/audit

**Current state:** Database-backed logger + query.

**Improvements:**
- Add abstract `Audit` class with guaranteed async write (never blocks request)
- Add retention policies: auto-archive entries older than N days
- Add export functionality (CSV, JSON)
- Add tamper detection (hash chain or signed entries)
- Add audit query performance: pagination, cursor-based, indexed queries

### @mariachi/api-facade

**Current state:** FastifyAdapter with auth strategies.

**Improvements:**
- Add automatic request/response logging (configurable verbosity)
- Add request ID propagation (`x-request-id` header → `ctx.traceId`)
- Add CORS configuration
- Add OpenAPI/Swagger auto-generation from route definitions
- Add request body size limits
- Add graceful shutdown with connection draining

### @mariachi/storage

**Current state:** S3 + local adapters.

**Improvements:**
- Add abstract `Storage` class with observability
- Add upload progress tracking
- Add file type validation (MIME type whitelist)
- Add file size limits (per-tenant configurable)
- Add virus scanning hook (`onBeforeUpload`)
- Add image processing hook (thumbnail generation)
- Add storage metrics: bytes uploaded/downloaded, operation counts

### @mariachi/notifications

**Current state:** Resend + memory email. In-memory in-app store.

**Improvements:**
- Remove `MemoryEmailAdapter` and `InMemoryInAppStore`
- Add abstract `Notifications` class (as shown in section 1)
- Add database-backed `InAppNotificationStore` (Drizzle schema)
- Add SMS adapter (Twilio)
- Add push notification adapter (Firebase FCM)
- Add template rendering: compile templates with variables before sending
- Add unsubscribe management: check opt-out before sending non-transactional
- Add notification preferences per user (email, SMS, push, in-app)
- Add batching: collect notifications and send digest emails
- Add Drizzle schemas: `notifications`, `notification_preferences`, `notification_templates`

### @mariachi/search

**Current state:** Typesense + memory adapter.

**Improvements:**
- Remove `MemorySearchAdapter`
- Add abstract `Search` class with observability
- Add search analytics: log what users search for, click-through rates
- Add synonym management
- Add search result ranking customization
- Add search metrics: query latency, zero-result rate, queries per second

### @mariachi/ai

**Current state:** OpenAI via Vercel AI SDK, in-memory sessions.

**Improvements:**
- Move sessions to database-backed (schemas already defined in CORE_CONCEPT.md)
- Add abstract `AI` class with per-call tracing and cost tracking
- Add streaming support with proper error recovery
- Add token budget enforcement (per-tenant monthly limits)
- Add model fallback: if primary model fails, try secondary
- Add prompt versioning with A/B testing support
- Add conversation summarization for long sessions (compress history)
- Add Drizzle schemas: `ai_sessions`, `ai_messages`, `ai_telemetry`

---

## 4. Billing Deep Dive

The billing package needs the most significant overhaul. Here's the full plan.

### 4.1 Abstract Billing Class

```ts
abstract class Billing implements Instrumentable {
  protected readonly adapter: BillingAdapter;
  protected readonly db: BillingRepository;
  protected readonly events: EventBus;
  protected readonly logger: Logger;
  protected readonly tracer?: TracerAdapter;
  protected readonly metrics?: MetricsAdapter;

  // --- Customer Management ---
  async createCustomer(ctx: Context, input: CreateCustomerInput): Promise<Customer> {
    // span: billing.createCustomer
    // 1. Create in Stripe
    // 2. Store in local DB (customers table)
    // 3. Emit billing.customer.created event
    // 4. Audit log
    // 5. Metric: billing.customer.created
  }

  async getCustomer(ctx: Context, customerId: string): Promise<Customer> {
    // 1. Check local DB first
    // 2. If stale or missing, fetch from Stripe and sync
  }

  // --- Subscriptions ---
  async createSubscription(ctx: Context, input: CreateSubscriptionInput): Promise<Subscription> {
    // span: billing.createSubscription
    // 1. Validate no active sub exists
    // 2. Create in Stripe with idempotency key
    // 3. Store in local DB
    // 4. Emit billing.subscription.created
    // 5. Audit log
  }

  async cancelSubscription(ctx: Context, subscriptionId: string, reason?: string): Promise<Subscription> {}
  async changeSubscription(ctx: Context, subscriptionId: string, newPlanId: string): Promise<Subscription> {}
  async pauseSubscription(ctx: Context, subscriptionId: string): Promise<Subscription> {}
  async resumeSubscription(ctx: Context, subscriptionId: string): Promise<Subscription> {}

  // --- Charges ---
  async createCharge(ctx: Context, input: CreateChargeInput): Promise<Charge> {}
  async refundCharge(ctx: Context, chargeId: string, amount?: number): Promise<Refund> {}

  // --- Credits ---
  async getCredits(ctx: Context, customerId: string): Promise<CreditBalance> {}
  async addCredits(ctx: Context, input: AddCreditsInput): Promise<CreditTransaction> {}
  async deductCredits(ctx: Context, input: DeductCreditsInput): Promise<CreditTransaction> {}
  async getCreditHistory(ctx: Context, customerId: string, pagination: PaginationParams): Promise<PaginatedResult<CreditTransaction>> {}

  // --- Usage-Based Billing ---
  async recordUsage(ctx: Context, input: RecordUsageInput): Promise<void> {}
  async getUsageSummary(ctx: Context, customerId: string, period: DateRange): Promise<UsageSummary> {}

  // --- Invoices ---
  async getInvoices(ctx: Context, customerId: string): Promise<Invoice[]> {}
  async getUpcomingInvoice(ctx: Context, customerId: string): Promise<Invoice | null> {}

  // --- Webhook Processing ---
  async handleWebhook(ctx: Context, rawBody: Buffer, signature: string): Promise<void> {
    // 1. Verify signature
    // 2. Deduplicate (check webhook_events table)
    // 3. Route to processor
    // 4. Store in webhook_events table
    // 5. Emit internal event
  }

  // --- Hooks ---
  protected onSubscriptionCreated?(ctx: Context, sub: Subscription): Promise<void>;
  protected onSubscriptionCanceled?(ctx: Context, sub: Subscription): Promise<void>;
  protected onSubscriptionPastDue?(ctx: Context, sub: Subscription): Promise<void>;
  protected onPaymentSucceeded?(ctx: Context, charge: Charge): Promise<void>;
  protected onPaymentFailed?(ctx: Context, charge: Charge): Promise<void>;
  protected onRefundCreated?(ctx: Context, refund: Refund): Promise<void>;
  protected onCreditsLow?(ctx: Context, balance: CreditBalance, threshold: number): Promise<void>;
}
```

### 4.2 Billing Database Schemas

These are the local tables the billing package should define. The principle: **store what you need for your app's logic locally, fetch from Stripe when you need billing-provider details.**

```
billing_customers {
  id              uuid PK
  tenant_id       text NOT NULL
  external_id     text NOT NULL       -- Stripe customer ID (cus_xxx)
  email           text NOT NULL
  name            text
  status          text NOT NULL       -- 'active' | 'suspended' | 'deleted'
  metadata        jsonb
  created_at      timestamp NOT NULL
  updated_at      timestamp NOT NULL
  deleted_at      timestamp
}

billing_subscriptions {
  id                    uuid PK
  tenant_id             text NOT NULL
  customer_id           uuid FK → billing_customers.id
  external_id           text NOT NULL       -- Stripe subscription ID (sub_xxx)
  plan_id               text NOT NULL
  status                text NOT NULL       -- 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused' | 'incomplete'
  current_period_start  timestamp
  current_period_end    timestamp
  cancel_at             timestamp
  canceled_at           timestamp
  trial_end             timestamp
  metadata              jsonb
  created_at            timestamp NOT NULL
  updated_at            timestamp NOT NULL
}

billing_charges {
  id              uuid PK
  tenant_id       text NOT NULL
  customer_id     uuid FK → billing_customers.id
  external_id     text NOT NULL       -- Stripe charge/payment_intent ID
  amount          integer NOT NULL    -- in smallest currency unit (cents)
  currency        text NOT NULL
  status          text NOT NULL       -- 'succeeded' | 'failed' | 'pending' | 'refunded' | 'partially_refunded'
  description     text
  idempotency_key text
  failure_reason  text
  metadata        jsonb
  created_at      timestamp NOT NULL
}

billing_refunds {
  id              uuid PK
  charge_id       uuid FK → billing_charges.id
  external_id     text NOT NULL
  amount          integer NOT NULL
  reason          text
  status          text NOT NULL       -- 'succeeded' | 'failed' | 'pending'
  created_at      timestamp NOT NULL
}

billing_credit_transactions {
  id              uuid PK
  tenant_id       text NOT NULL
  customer_id     uuid FK → billing_customers.id
  amount          integer NOT NULL    -- positive = credit, negative = debit
  currency        text NOT NULL
  balance_after   integer NOT NULL
  description     text NOT NULL
  reference_type  text               -- 'manual' | 'refund' | 'usage' | 'promotion'
  reference_id    text               -- FK to the thing that caused this transaction
  created_at      timestamp NOT NULL
}

billing_usage_records {
  id              uuid PK
  tenant_id       text NOT NULL
  customer_id     uuid FK → billing_customers.id
  metric_name     text NOT NULL       -- 'api_calls' | 'storage_gb' | 'ai_tokens' | etc
  quantity        numeric NOT NULL
  timestamp       timestamp NOT NULL
  idempotency_key text
  metadata        jsonb
  created_at      timestamp NOT NULL
}

billing_webhook_events {
  id              uuid PK
  external_id     text NOT NULL UNIQUE  -- Stripe event ID (evt_xxx)
  type            text NOT NULL
  status          text NOT NULL       -- 'received' | 'processed' | 'failed'
  payload         jsonb NOT NULL
  error           text
  attempts        integer NOT NULL DEFAULT 0
  processed_at    timestamp
  created_at      timestamp NOT NULL
}

billing_plans {
  id              uuid PK
  external_id     text NOT NULL       -- Stripe price ID (price_xxx)
  name            text NOT NULL
  description     text
  amount          integer NOT NULL
  currency        text NOT NULL
  interval        text NOT NULL       -- 'month' | 'year'
  features        jsonb               -- feature flags/limits for this plan
  active          boolean NOT NULL DEFAULT true
  created_at      timestamp NOT NULL
  updated_at      timestamp NOT NULL
}
```

### What stays in Stripe vs. what's local

| Data | Local DB | Stripe API |
|---|---|---|
| Customer email, name, tenantId | Yes (primary) | Yes (synced) |
| Payment methods, card details | No (never) | Yes (PCI) |
| Subscription status, plan | Yes (cached, synced via webhooks) | Yes (source of truth) |
| Charges/payments | Yes (record, amounts, status) | Yes (source of truth for disputes) |
| Invoices, line items | No (fetch on demand) | Yes |
| Credit balance | Yes (local ledger) | Optional (Stripe customer balance) |
| Usage records | Yes (primary, reported to Stripe) | Yes (metered billing) |
| Webhook events | Yes (dedup + audit trail) | Yes |
| Plans/prices | Yes (cached for display) | Yes (source of truth) |

### 4.3 Webhook Handling

The webhook handler needs a full routing system:

```ts
const WEBHOOK_PROCESSORS: Record<string, (ctx: Context, event: Stripe.Event, billing: Billing) => Promise<void>> = {
  // Customer events
  'customer.created':            processCustomerCreated,
  'customer.updated':            processCustomerUpdated,
  'customer.deleted':            processCustomerDeleted,

  // Subscription events
  'customer.subscription.created':    processSubscriptionCreated,
  'customer.subscription.updated':    processSubscriptionUpdated,
  'customer.subscription.deleted':    processSubscriptionDeleted,
  'customer.subscription.paused':     processSubscriptionPaused,
  'customer.subscription.resumed':    processSubscriptionResumed,
  'customer.subscription.trial_will_end': processTrialWillEnd,

  // Payment events
  'payment_intent.succeeded':    processPaymentSucceeded,
  'payment_intent.payment_failed': processPaymentFailed,

  // Invoice events
  'invoice.paid':                processInvoicePaid,
  'invoice.payment_failed':      processInvoicePaymentFailed,
  'invoice.upcoming':            processInvoiceUpcoming,
  'invoice.finalized':           processInvoiceFinalized,

  // Charge events
  'charge.succeeded':            processChargeSucceeded,
  'charge.failed':               processChargeFailed,
  'charge.refunded':             processChargeRefunded,
  'charge.dispute.created':      processDisputeCreated,
};
```

Each processor:
1. Parses the Stripe event payload
2. Syncs local DB state
3. Emits a typed domain event
4. Calls the appropriate hook on the `Billing` abstract class

### 4.4 Billing Metrics

```
billing.customer.created      counter
billing.subscription.created  counter
billing.subscription.canceled counter
billing.subscription.past_due counter
billing.charge.succeeded      counter   { currency }
billing.charge.failed         counter   { currency }
billing.charge.amount          histogram { currency }
billing.credit.added          counter   { currency }
billing.credit.deducted       counter   { currency }
billing.usage.recorded        counter   { metric_name }
billing.webhook.received      counter   { event_type }
billing.webhook.processed     counter   { event_type }
billing.webhook.failed        counter   { event_type }
billing.api.latency           histogram { operation }
```

---

## 5. Cross-Cutting: Observability Everywhere

### The `withSpan` utility

To avoid repetitive try/catch/span boilerplate in every method of every abstract class:

```ts
// @mariachi/core
async function withSpan<T>(
  tracer: TracerAdapter | undefined,
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span?: Span) => Promise<T>,
): Promise<T> {
  if (!tracer) return fn(undefined);
  return tracer.withSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attributes)) {
      span.setAttribute(k, v);
    }
    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', (error as Error).message);
      throw error;
    }
  });
}
```

### Standard metrics per package

Every abstract class emits these standard metrics:

```
{package}.{operation}.count       counter
{package}.{operation}.latency     histogram
{package}.{operation}.error       counter
```

---

## 6. New: Retry Utility

Add a `retry` utility to `@mariachi/core` that every package can use for retryable operations:

```ts
interface RetryConfig {
  attempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
}

async function retry<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T>;
```

Used by:
- Billing adapter calls (Stripe API can 429)
- Email sending (transient failures)
- Storage operations (S3 occasional 503)
- Search indexing (Typesense under load)
- Integration functions (external APIs)

---

---

## Finalized Decisions

These decisions were discussed and locked in:

| Decision | Choice | Rationale |
|---|---|---|
| Observability wiring | **Container resolve** — abstract classes pull logger/tracer/metrics from global container | Less boilerplate, single source of truth |
| Events transport | **Keep Redis Pub/Sub** — Streams can be added as a separate adapter later | Works well enough, lower complexity now |
| DB schema location | **Both** — defined in each package, re-exported from `@mariachi/database/schema` as unified registry | Co-location for package work, unified import for migrations |
| Hooks pattern | **Protected optional methods** — subclass overrides them | Cleaner, simpler, aligns with abstract class pattern |
| Testing package | **Test doubles + test harness** — `createTestBilling()` etc. that wire abstract classes with test doubles | Zero-effort testing with the abstract class pattern |
| Abstract classes | **Abstract + Default concrete** — `DefaultNotifications extends Notifications` shipped alongside | Zero-effort for simple use cases, subclass for custom hooks |
| Billing adapters | **Stripe only** for now | Validate the pattern before adding a second provider |

---

## Summary of Changes by Priority

### P0 — Architecture ✅ DONE
1. ✅ Add `withSpan`, `retry`, `Disposable`, `Instrumentable` to `@mariachi/core`
2. ✅ Remove all in-memory adapters from production packages (cache, events, jobs, rate-limit, search, notifications, config)
3. ✅ Add `docker-compose.dev.yml` for local infrastructure (Postgres, Redis, Typesense, Mailpit)
4. ✅ Add abstract service class pattern to every package (abstract + Default concrete): Cache, Events, Jobs, RateLimiting, Search, Notifications, Storage, Auth, Audit, Tenancy, Database, Communication, AI, Billing

### P1 — Billing overhaul ✅ DONE
5. ✅ Add all billing Drizzle schemas (8 tables: customers, subscriptions, charges, refunds, credit_transactions, usage_records, webhook_events, plans)
6. ✅ Implement `Billing` abstract class + `DefaultBilling` with full observability + lifecycle hooks
7. ✅ Implement full webhook routing + 10 processors (customer.created/updated, subscription.created/updated/deleted, payment.succeeded/failed, invoice.paid, charge.refunded, dispute.created)
8. ✅ Usage records schema defined; recording via `Billing.recordUsage` method
9. ✅ Credit transactions schema defined; ledger with transaction history
10. ✅ Billing metrics on all operations

### P2 — Observability ✅ DONE
11. ✅ Implement `OpenTelemetryTracerAdapter` using `@opentelemetry/api`
12. ✅ Implement `PrometheusMetricsAdapter` using `prom-client`
13. ✅ Implement `SentryErrorTracker` using `@sentry/node`
14. ✅ Wire observability into every abstract class via container resolve

### P3 — Database schemas ✅ DONE
15. ✅ Auth: `roles`, `permissions`, `user_roles`, `api_keys`, `sessions` tables
16. ✅ Notifications: `notifications`, `notification_preferences` tables
17. ✅ AI: `ai_sessions`, `ai_messages`, `ai_telemetry` tables
18. ✅ Config: `feature_flags` table
19. Notifications in-app: DB schema defined, DB-backed store to be wired in future pass

### P4 — Enhanced features ✅ DONE
20. ✅ Auth: `OAuthAdapter` (authorization code, token refresh), `BruteForceProtector` (Redis-backed lockout)
21. ✅ Events: `DeadLetterHandler` (retry + dead letter), `publishWithTrace` (traceId propagation)
22. ✅ Jobs: `enqueueWithDedup`, `JobPriority` tiers (critical/high/normal/low)
23. ✅ Search: `SearchAnalytics` (query recording, zero-result tracking)
24. ✅ AI: `TokenBudget` enforcement, `checkTokenBudget` method, `StreamChunk` type
25. ✅ Storage: `putValidated` (file size + MIME type validation), `UploadValidation` type
26. ✅ Notifications: template rendering (`renderTemplate`, `sendTemplatedEmail`)

### Bonus
27. ✅ `@mariachi/testing`: `createTestHarness()` wires global container with test logger for abstract class testing
