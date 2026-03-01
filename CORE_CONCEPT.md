# Mariachi Framework — LLM Implementation Guidelines

> **Important:** This document describes the *full vision* for the framework, including planned features that are not yet implemented. For a guide that reflects only what is currently implemented, see [`docs/ai-guide.md`](docs/ai-guide.md) and the [`.mariachi/`](.mariachi/) quick-reference rules.
>
> **Currently unimplemented features described in this document:**
> - Communication adapters: `grpc`, `trpc`, `graphql` (only `InProcessAdapter` exists)
> - Database adapters: `mysql`, `sqlite`, `mongodb` (only `postgres` via Drizzle exists)
> - Cache adapters: in-memory production adapter (test doubles are in `@mariachi/testing`)
> - Jobs adapters: `memory` (only `bullmq` exists; use `TestJobQueue` for tests)
> - Some folder structures listed below are aspirational -- actual file layout may differ
>
> When generating code, prefer the patterns documented in [`docs/ai-guide.md`](docs/ai-guide.md) and the [recipes](docs/recipes/) which reflect the actual codebase.

> **For the LLM implementing this framework:**
> This document is your primary reference. When generating code, scaffolding, or architecture for any application built on this framework, you must follow the conventions, file structures, and patterns defined here. Do not invent alternative patterns — consistency across the codebase is the goal. If a component or pattern is not covered here, default to the closest analogous pattern in this document and flag it in a comment.

---

## General Rules for the LLM

- **Always use the adapter pattern.** No component should be tightly coupled to a specific vendor or library. Every external dependency is accessed through an abstraction defined in this framework.
- **Never hardcode secrets, credentials, or environment-specific values.** Always resolve these through the Config & Secrets layer (Component 7).
- **Every cross-service or cross-module call must go through the Communication layer** (Component 1), not direct imports between services, unless in monolith mode where direct function calls are explicitly permitted.
- **All errors must be typed.** Use the typed error classes defined per component. Never throw raw strings or untyped `Error` objects across boundaries.
- **Observability is not optional.** Every component has observability hooks. Do not skip instrumentation when generating code.
- **Follow the folder structure exactly.** Each component has a defined file layout. Do not reorganize or consolidate files unless the structure explicitly permits it.
- **When in doubt about monolith vs. microservice mode**, default to monolith and leave a `// TODO: extract to service` comment at the boundary.
- **Generate tests alongside implementation.** Every module gets a corresponding test file using the testing utilities in Component 18.
- **Context propagation is mandatory.** Request context (user ID, tenant ID, trace ID) must be threaded through every operation. Never lose context between layers.
- **Typed contracts over runtime assumptions.** Use Zod schemas for all inputs, outputs, events, and configs. Validate at boundaries, not deep in business logic.

---

## Project Root Structure

```
/
├── apps/                        # Deployable applications
│   ├── api/                     # API Facade + Controllers
│   │   ├── servers/             # FastifyAdapter instances (public, admin, webhooks)
│   │   ├── controllers/         # One controller file per domain
│   │   └── index.ts
│   ├── services/                # Domain services (monolith: all here; microservice: split into own apps)
│   │   ├── billing/
│   │   ├── users/
│   │   └── ...
│   ├── worker/                  # Job workers
│   └── ...
├── packages/                    # Shared framework packages
│   ├── api-facade/              # FastifyAdapter, auth strategies, context building
│   ├── communication/
│   ├── database/
│   ├── cache/
│   ├── events/
│   ├── jobs/
│   ├── auth/
│   ├── config/
│   ├── storage/
│   ├── notifications/
│   ├── billing/
│   ├── search/
│   ├── observability/
│   ├── rate-limit/
│   ├── audit/
│   ├── tenancy/
│   ├── lifecycle/
│   ├── ai/
│   └── integrations/
├── integrations/                # Generated third-party integrations (Component 20)
├── docs/                        # Architecture docs, ADRs, examples
├── MARIACHI.md                 # This file
└── tsconfig.base.json
```

---

## 1. Communication Layer

### Purpose
Handles all inter-module and inter-service communication. In monolith mode this is direct function calls with a middleware pipeline. In microservice mode this is a network transport (gRPC or HTTP) with the same middleware pipeline applied.

### Rules for the LLM
- All route/procedure definitions must go through the communication layer — never expose raw mariachi routes (e.g. raw Express routes) in business logic.
- Middleware order is fixed: **auth → rate limiting → tracing → logging → handler**.
- In monolith mode, the same middleware pipeline applies — do not skip it.
- Every handler must declare its input and output schema using Zod.

### Adapters
- `http` — Express / Fastify / Hono
- `grpc` — gRPC with protobuf
- `trpc` — tRPC for type-safe internal APIs
- `graphql` — Apollo / Pothos

### Folder Structure
```
packages/communication/
├── index.ts                     # Public API
├── adapters/
│   ├── http.ts
│   ├── grpc.ts
│   ├── trpc.ts
│   └── graphql.ts
├── middleware/
│   ├── auth.ts
│   ├── rate-limit.ts
│   ├── tracing.ts
│   └── logger.ts
├── types.ts                     # Handler, Middleware, Request, Response types
└── test/
    └── communication.test.ts
```

### Usage Convention
```ts
// Every handler follows this contract
const handler: Handler<InputSchema, OutputSchema> = async (ctx, input) => {
  // ctx carries: userId, tenantId, traceId, logger
  return output;
};
```

---

## 2. Database / Persistence

### Purpose
Structured data storage with a consistent repository interface. Built on Drizzle ORM for PostgreSQL as the primary adapter.

### Rules for the LLM
- Never write raw SQL outside of the database package unless using the query builder exposed by this layer.
- All schema definitions live in `packages/database/schema/`. One file per domain entity.
- Migrations are always generated — never hand-write migration files.
- All queries must go through the repository pattern. Do not expose the Drizzle client directly to application code.
- Soft deletes are the default. Hard deletes must be explicitly opted into and commented.
- All timestamps use `created_at`, `updated_at`, `deleted_at` naming convention.
- Multi-tenant tables always include a `tenant_id` column.

### Adapters
- `postgres` — Drizzle + PostgreSQL (primary)
- `mysql` — Drizzle + MySQL
- `sqlite` — Drizzle + SQLite (local/dev)
- `mongodb` — Mongoose (non-relational use cases)

### Folder Structure
```
packages/database/
├── index.ts
├── client.ts                    # Connection, pooling setup
├── adapters/
│   ├── postgres.ts
│   ├── mysql.ts
│   ├── sqlite.ts
│   └── mongodb.ts
├── schema/                      # One file per domain entity
│   ├── users.ts
│   ├── tenants.ts
│   └── ...
├── repositories/                # One repository per entity
│   ├── base.repository.ts       # Generic CRUD base
│   └── users.repository.ts
├── migrations/                  # Auto-generated, never hand-edited
├── seed/
│   └── index.ts
├── types.ts
└── test/
    └── database.test.ts
```

### Repository Convention
```ts
// Every repository extends the base
class UsersRepository extends BaseRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  // domain-specific methods here
}

// BaseRepository provides:
// findById, findMany, create, update, softDelete, hardDelete, paginate
```

---

## 3. Caching

### Purpose
Short-lived data storage for performance. Separate from the event/pub-sub layer.

### Rules for the LLM
- Never cache data that contains secrets or full PII without explicit justification.
- Always define a TTL. No indefinite cache entries.
- Use namespaced keys: `{tenant}:{entity}:{id}`. Never use flat unnamespaced keys.
- Distributed locking must use the cache layer — never implement ad-hoc locking.

### Adapters
- `redis` — ioredis (primary)
- `memcached`
- `memory` — LRU in-process (dev/testing only)

### Folder Structure
```
packages/cache/
├── index.ts
├── adapters/
│   ├── redis.ts
│   ├── memcached.ts
│   └── memory.ts
├── lock.ts                      # Distributed lock implementation
├── memo.ts                      # Memoization helpers
├── types.ts
└── test/
    └── cache.test.ts
```

### Key Convention
```ts
// Always use the key builder — never construct keys inline
cache.key('users', tenantId, userId)  // → "tenant-abc:users:user-123"
```

---

## 4. Realtime / Pub-Sub Events

### Purpose
Async event broadcasting between modules and services. For background job processing see Component 5.

### Rules for the LLM
- All events must be defined in a shared types file as a typed schema (Zod or TypeBox).
- Event names use `{domain}.{entity}.{verb}` format e.g. `auth.user.created`.
- Consumers must be idempotent — assume any event can be delivered more than once.
- Never publish events directly from repositories. Events are published from the service/use-case layer.

### Adapters
- `redis` — Redis Pub/Sub
- `nats` — NATS Core
- `pusher` — Pusher (client-facing realtime)
- `ably` — Ably
- `socketio` — Socket.io

### Folder Structure
```
packages/events/
├── index.ts
├── adapters/
│   ├── redis.ts
│   ├── nats.ts
│   ├── pusher.ts
│   ├── ably.ts
│   └── socketio.ts
├── bus.ts                       # EventBus class
├── types.ts                     # All event schemas defined here
└── test/
    └── events.test.ts
```

### Event Definition Convention
```ts
// packages/events/types.ts
export const UserCreatedEvent = z.object({
  type: z.literal('auth.user.created'),
  tenantId: z.string(),
  userId: z.string(),
  email: z.string(),
  occurredAt: z.string().datetime(),
});

// Publishing
await events.publish('auth.user.created', payload);

// Subscribing
events.subscribe('auth.user.created', async (event) => { ... });
```

---

## 5. Jobs / Queue / Workers

### Purpose
Background and async work. Handles fire-and-forget tasks, scheduled jobs, and long-running processing.

### Rules for the LLM
- Every job must be defined as a named, typed job definition. No anonymous inline jobs.
- Job handlers must be idempotent.
- All jobs must have retry configuration defined explicitly — do not rely on defaults.
- Scheduled/recurring jobs are defined in a single `jobs/schedules.ts` file, not scattered across the codebase.
- Job files live in `{app}/jobs/` for app-specific jobs, or `packages/jobs/handlers/` for shared jobs.

### Adapters
- `bullmq` — BullMQ on Redis (primary)
- `nats-jetstream` — NATS JetStream
- `kafka` — Kafka
- `sqs` — AWS SQS
- `inngest` — Inngest

### Folder Structure
```
packages/jobs/
├── index.ts
├── adapters/
│   ├── bullmq.ts
│   ├── nats-jetstream.ts
│   ├── kafka.ts
│   ├── sqs.ts
│   └── inngest.ts
├── queue.ts                     # Queue client
├── worker.ts                    # Worker base class
├── scheduler.ts                 # Recurring/cron job registration
├── types.ts
└── test/
    └── jobs.test.ts

apps/worker/
├── jobs/
│   ├── schedules.ts             # All recurring jobs registered here
│   ├── send-email.job.ts
│   ├── process-payment.job.ts
│   └── ...
└── index.ts
```

### Job Definition Convention
```ts
// Every job follows this structure
export const SendEmailJob = defineJob({
  name: 'notifications.send-email',
  schema: z.object({ userId: z.string(), templateId: z.string() }),
  retry: { attempts: 3, backoff: 'exponential' },
  handler: async (data, ctx) => {
    // ctx carries: logger, traceId, attemptNumber
  },
});
```

---

## 6. Auth & Identity

### Purpose
Authentication (who are you) and authorization (what can you do).

### Rules for the LLM
- Auth is always resolved in the communication middleware layer. Never check auth inside a repository or deep in business logic.
- The resolved user/session object is always available via `ctx.user` in handlers.
- Permissions are always checked via the authorization adapter, never via hardcoded role string comparisons in business logic.
- API keys must be hashed before storage. Never store plaintext API keys.
- OAuth tokens (access + refresh) must be stored via the secrets layer, not in a plain DB column.

### Adapters
- **Authentication:** JWT, Sessions, OAuth/OIDC, Magic Link, API Keys, Passkeys
- **Authorization:** RBAC (custom), Casbin, OPA, Permit.io
- **Providers:** Clerk, Auth0, Supabase Auth, Better Auth, self-rolled

### Folder Structure
```
packages/auth/
├── index.ts
├── adapters/
│   ├── jwt.ts
│   ├── session.ts
│   ├── oauth.ts
│   ├── api-key.ts
│   └── passkey.ts
├── providers/
│   ├── clerk.ts
│   ├── auth0.ts
│   └── self-rolled.ts
├── authorization/
│   ├── rbac.ts
│   ├── casbin.ts
│   └── opa.ts
├── middleware.ts                # Auth middleware for communication layer
├── types.ts                     # User, Session, Permission types
└── test/
    └── auth.test.ts
```

---

## 7. Configuration & Secrets

### Purpose
Typed application configuration and secure secret resolution. Feature flags included.

### Rules for the LLM
- All config is defined as a Zod schema and validated at startup. The application must not start with invalid config.
- Never access `process.env` directly in application code outside of this package.
- All secrets are referenced by key name, resolved at runtime through the adapter.
- Feature flags are resolved through this layer — never hardcode feature conditionals without a corresponding flag definition.

### Adapters
- **Secrets:** `.env` (dev), HashiCorp Vault, AWS SSM/Secrets Manager, Doppler, Infisical
- **Feature Flags:** Unleash, LaunchDarkly, GrowthBook, DB-backed self-rolled

### Folder Structure
```
packages/config/
├── index.ts
├── adapters/
│   ├── env.ts
│   ├── vault.ts
│   ├── aws-ssm.ts
│   ├── doppler.ts
│   └── infisical.ts
├── flags/
│   ├── adapters/
│   │   ├── unleash.ts
│   │   ├── launchdarkly.ts
│   │   └── db.ts
│   └── index.ts
├── schema.ts                    # App config Zod schema — define all config here
├── types.ts
└── test/
    └── config.test.ts
```

### Config Schema Convention
```ts
// packages/config/schema.ts
export const AppConfig = z.object({
  database: z.object({ url: z.string().url() }),
  redis: z.object({ url: z.string().url() }),
  auth: z.object({ jwtSecret: z.string().min(32) }),
  // ...
});

// Accessing config in application code
const config = useConfig(); // always typed, never raw process.env
```

---

## 8. File & Asset Storage

### Purpose
Binary data, media, and document storage with a consistent interface.

### Rules for the LLM
- Never store file contents in the database. Store the reference (key/URL) only.
- Access control (public vs. private) must be declared at upload time, not assumed.
- Always use signed URLs for private asset access. Never expose storage bucket URLs directly.
- File keys follow the convention: `{tenant}/{entity}/{id}/{filename}`.

### Adapters
- `s3` — AWS S3 (primary)
- `r2` — Cloudflare R2
- `gcs` — Google Cloud Storage
- `local` — Local disk (dev/testing only)
- `backblaze` — Backblaze B2

### Folder Structure
```
packages/storage/
├── index.ts
├── adapters/
│   ├── s3.ts
│   ├── r2.ts
│   ├── gcs.ts
│   ├── local.ts
│   └── backblaze.ts
├── types.ts
└── test/
    └── storage.test.ts
```

### Usage Convention
```ts
// Upload
const key = storage.key(tenantId, 'avatars', userId, 'profile.jpg');
await storage.put(key, buffer, { access: 'private', contentType: 'image/jpeg' });

// Access
const url = await storage.signedUrl(key, { expiresIn: 3600 });
```

---

## 9. Email & Notifications

### Purpose
All outbound user communication — email, SMS, push, and in-app notifications.

### Rules for the LLM
- Never construct email HTML inline in business logic. Always use a named template.
- All notification sends are fire-and-forget via the jobs layer — never block a request on email delivery.
- In-app notifications are stored in the database and delivered via the events layer.
- Unsubscribe state must be checked before sending any marketing or non-transactional communication.

### Adapters
- **Email:** Resend, SendGrid, AWS SES, Postmark, SMTP
- **SMS:** Twilio, AWS SNS, Vonage
- **Push:** Firebase FCM, APNs, OneSignal
- **Templates:** React Email, Handlebars

### Folder Structure
```
packages/notifications/
├── index.ts
├── adapters/
│   ├── email/
│   │   ├── resend.ts
│   │   ├── sendgrid.ts
│   │   ├── ses.ts
│   │   └── smtp.ts
│   ├── sms/
│   │   ├── twilio.ts
│   │   └── sns.ts
│   └── push/
│       ├── fcm.ts
│       └── onesignal.ts
├── templates/                   # Named templates — one file per template
│   ├── welcome.tsx
│   ├── reset-password.tsx
│   └── ...
├── in-app.ts                    # In-app notification store + delivery
├── types.ts
└── test/
    └── notifications.test.ts
```

---

## 10. Billing & Payments

### Purpose
Subscriptions, one-time charges, usage-based billing, and credit management.

### Rules for the LLM
- All billing operations must be idempotent. Always pass idempotency keys to payment gateway calls.
- Webhook handlers must verify the webhook signature before processing. Never trust unverified webhook payloads.
- Never store raw card data. Store only gateway-issued customer/payment method IDs.
- Billing state (plan, status, credits) is the source of truth from the payment gateway — sync it, don't duplicate it loosely.
- Failed payments must trigger a typed event into the event bus for downstream handling.

### Adapters
- `stripe` — Stripe (primary)
- `paddle` — Paddle
- `lemonsqueezy` — LemonSqueezy
- `braintree` — Braintree

### Folder Structure
```
packages/billing/
├── index.ts
├── adapters/
│   ├── stripe.ts
│   ├── paddle.ts
│   ├── lemonsqueezy.ts
│   └── braintree.ts
├── webhooks/
│   ├── handler.ts               # Signature verification + routing
│   └── processors/              # One file per webhook event type
│       ├── subscription-updated.ts
│       ├── payment-failed.ts
│       └── ...
├── features/
│   ├── subscriptions.ts
│   ├── one-time.ts
│   ├── usage.ts
│   └── credits.ts
├── types.ts
└── test/
    └── billing.test.ts
```

---

## 11. Search

### Purpose
Full-text and faceted search across application data.

### Rules for the LLM
- Search indexes are not the source of truth. The database is. Always sync from DB → index, never the reverse.
- Index sync hooks are registered in the repository layer (Component 2) — on create/update/delete, enqueue an index sync job.
- Search queries go through this package's interface, never directly to the search provider client.

### Adapters
- `postgres-fts` — PostgreSQL full-text search (simple use cases)
- `typesense` — Typesense (primary recommended)
- `meilisearch` — Meilisearch
- `elasticsearch` — Elasticsearch / OpenSearch
- `algolia` — Algolia

### Folder Structure
```
packages/search/
├── index.ts
├── adapters/
│   ├── postgres-fts.ts
│   ├── typesense.ts
│   ├── meilisearch.ts
│   ├── elasticsearch.ts
│   └── algolia.ts
├── indexer.ts                   # Index management (create, sync, delete)
├── types.ts
└── test/
    └── search.test.ts
```

---

## 12. Observability

### Purpose
Tracing, metrics, logging, and error tracking. Plugged into all other components as a cross-cutting concern.

### Rules for the LLM
- Every inbound request gets a `traceId`. It must be propagated through all downstream calls, jobs, and AI requests.
- Use structured logging only — no `console.log`. All log calls go through the logger from this package.
- Log levels: `error` for unhandled failures, `warn` for handled degradation, `info` for significant business events, `debug` for development detail.
- Metrics are emitted from the communication layer and jobs layer automatically. Add custom metrics for significant business operations only.
- Error tracking captures unhandled exceptions automatically. Do not manually call error tracking for handled errors.

### Adapters
- **Tracing:** OpenTelemetry (OTEL), Jaeger, Datadog, Honeycomb
- **Metrics:** Prometheus, StatsD, Datadog
- **Logging:** Pino → Loki, Datadog, CloudWatch, Logtail
- **Errors:** Sentry, Highlight.io, Axiom

### Folder Structure
```
packages/observability/
├── index.ts
├── adapters/
│   ├── tracing/
│   │   ├── otel.ts
│   │   ├── datadog.ts
│   │   └── honeycomb.ts
│   ├── metrics/
│   │   ├── prometheus.ts
│   │   └── statsd.ts
│   ├── logging/
│   │   ├── pino.ts
│   │   └── winston.ts
│   └── errors/
│       ├── sentry.ts
│       └── highlight.ts
├── logger.ts                    # Logger factory — use this everywhere
├── tracer.ts                    # Tracer — wrap operations with spans
├── metrics.ts                   # Metrics client
├── types.ts
└── test/
    └── observability.test.ts
```

### Logger Convention
```ts
// Always get a logger from context — never instantiate directly
const logger = ctx.logger.child({ module: 'billing', operation: 'charge' });
logger.info({ userId, amount }, 'Processing charge');
```

---

## 13. Rate Limiting & Throttling

### Purpose
Protect the system from abuse. Plugged into the communication layer middleware.

### Rules for the LLM
- Rate limiting is configured at the route/procedure level, not globally applied as a blanket rule.
- Always return `429 Too Many Requests` with a `Retry-After` header.
- Rate limit state is always stored in the cache layer, never in-process memory for distributed deployments.
- Per-tenant and per-user limits are separate configurations — define both for any sensitive endpoint.

### Adapters
- `redis` — Redis sliding window (primary)
- `memory` — In-memory (dev/single instance only)
- `upstash` — Upstash Redis
- `cloudflare` — Cloudflare rate limiting

### Folder Structure
```
packages/rate-limit/
├── index.ts
├── adapters/
│   ├── redis.ts
│   ├── memory.ts
│   ├── upstash.ts
│   └── cloudflare.ts
├── middleware.ts                # Pre-built middleware for communication layer
├── types.ts
└── test/
    └── rate-limit.test.ts
```

---

## 14. Audit Logging

### Purpose
Tamper-evident record of who did what, when. For compliance and debugging.

### Rules for the LLM
- Audit log entries are append-only. No updates or deletes on the audit log table.
- Every privileged action (auth events, billing events, admin actions, data exports) must produce an audit log entry.
- Audit log entries are written asynchronously via the jobs layer — never block a request on audit log writes.
- The audit log entry schema is fixed: `{ actor, action, resource, resourceId, tenantId, ipAddress, userAgent, occurredAt, metadata }`.

### Folder Structure
```
packages/audit/
├── index.ts
├── logger.ts                    # Audit log write interface
├── schema.ts                    # Drizzle schema for audit_logs table
├── query.ts                     # Read/export interface
├── types.ts
└── test/
    └── audit.test.ts
```

### Audit Entry Convention
```ts
await audit.log({
  actor: ctx.user.id,
  action: 'billing.subscription.cancelled',
  resource: 'subscription',
  resourceId: subscriptionId,
  tenantId: ctx.tenantId,
  metadata: { reason, planId },
});
```

---

## 15. Multi-tenancy

### Purpose
Cross-cutting isolation of data, config, billing, and auth by tenant. Required for SaaS applications.

### Rules for the LLM
- Every DB table in a multi-tenant application must have a `tenant_id` column. No exceptions.
- Tenant context must be resolved early in the request lifecycle (via subdomain, header, or JWT claim) and attached to `ctx.tenantId`.
- Never construct a DB query that could return rows from multiple tenants. The repository base class enforces this automatically when `tenantId` is present in context.
- Per-tenant feature flags and config overrides are resolved through the config layer, scoped to `tenantId`.

### Isolation Strategies
- `row-level` — shared DB, `tenant_id` column on every table (default)
- `schema-per-tenant` — shared DB, separate schema per tenant
- `db-per-tenant` — separate database per tenant (high isolation, high cost)

### Folder Structure
```
packages/tenancy/
├── index.ts
├── resolver.ts                  # Extract tenantId from request (subdomain, header, JWT)
├── context.ts                   # Tenant context propagation
├── middleware.ts                # Middleware for communication layer
├── types.ts
└── test/
    └── tenancy.test.ts
```

---

## 16. App Lifecycle & Health

### Purpose
Startup/shutdown orchestration and health reporting for operational readiness.

### Rules for the LLM
- All packages must register startup and shutdown hooks via the lifecycle manager.
- Startup hooks initialize connections (DB, cache, queues). Shutdown hooks drain connections gracefully.
- Health check endpoints must be implemented: `/health` (liveness), `/ready` (readiness), `/live` (startup probe).
- Readiness checks must verify all critical dependencies (DB, cache, queue) before reporting ready.
- Graceful shutdown must allow in-flight requests and jobs to complete before exiting.

### Folder Structure
```
packages/lifecycle/
├── index.ts
├── startup.ts
├── shutdown.ts
├── health.ts                    # Health check handlers
├── types.ts
└── test/
    └── lifecycle.test.ts
```

---

## 17. CLI & Scaffolding

### Purpose
Code generation and project scaffolding so the LLM (and developers) produce consistent output.

### Rules for the LLM
- When generating a new service, module, job, route, or integration — use the templates defined here as your starting point.
- Always generate the test file alongside the implementation.
- Always update the barrel export (`index.ts`) when adding a new export.
- Generated files include a header comment indicating they are mariachi-generated and which template was used.

### Commands
```
mariachi generate service <name>
mariachi generate module <name>
mariachi generate job <name>
mariachi generate route <method> <path>
mariachi generate integration <name>
mariachi generate migration <description>
```

### Folder Structure
```
packages/cli/
├── index.ts
├── commands/
│   ├── generate.ts
│   └── migrate.ts
├── templates/
│   ├── service/
│   ├── module/
│   ├── job/
│   ├── route/
│   └── integration/
└── utils/
    └── scaffold.ts
```

---

## 18. Testing Utilities

### Purpose
Standardized helpers to make every component testable in isolation.

### Rules for the LLM
- All adapter dependencies must have an in-memory test double registered in this package.
- Never make real network calls in unit tests. Use the in-memory adapters.
- Integration tests (real DB, real queue) live in `test/integration/` and are explicitly tagged.
- Use factory helpers for all test data — never write inline raw objects.
- Test files are colocated or in a `/test` subfolder alongside the module they test.

### Folder Structure
```
packages/testing/
├── index.ts
├── adapters/                    # In-memory test doubles for all packages
│   ├── database.ts
│   ├── cache.ts
│   ├── events.ts
│   ├── jobs.ts
│   ├── storage.ts
│   ├── notifications.ts
│   └── ai.ts
├── factories/                   # Data factories per entity
│   ├── user.factory.ts
│   ├── tenant.factory.ts
│   └── ...
├── fixtures/                    # Static fixture data
├── setup.ts                     # Global test setup (DB, lifecycle)
└── types.ts
```

---

## 19. AI / LLM

### Purpose
Abstraction for all AI model interactions — sessions, history, tool calls, telemetry, and cost tracking.

### Rules for the LLM
- Never call an AI provider SDK directly in application code. Always go through this package.
- Every AI interaction must have a `sessionId`. Sessions are persisted to the database.
- All AI requests are logged: model, input tokens, output tokens, latency, estimated cost, and the full request/response.
- Tool definitions are typed and versioned. Register tools in the tool registry, not inline in call sites.
- Streaming responses must handle partial failures gracefully and resume where possible.
- Cost and token usage must be attributed to a `userId` and `tenantId` for billing/quota enforcement.
- Agent loops must have a `maxIterations` guard. Never allow unbounded loops.

### Adapters (via AI SDK)
- `openai` — OpenAI GPT-4o, o3, etc.
- `anthropic` — Claude Sonnet, Opus, Haiku
- `google` — Gemini
- `mistral` — Mistral
- `groq` — Groq
- `ollama` — Local models
- `bedrock` — AWS Bedrock

### Folder Structure
```
packages/ai/
├── index.ts
├── adapters/
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── google.ts
│   ├── mistral.ts
│   ├── groq.ts
│   ├── ollama.ts
│   └── bedrock.ts
├── session/
│   ├── manager.ts               # Create, resume, expire sessions
│   ├── schema.ts                # DB schema for sessions + messages
│   └── types.ts
├── tools/
│   ├── registry.ts              # Tool registration and lookup
│   └── types.ts
├── prompts/
│   ├── registry.ts              # Named, versioned prompt templates
│   └── types.ts
├── patterns/
│   ├── agent.ts                 # Agent loop with tool use + maxIterations guard
│   └── rag.ts                   # RAG pattern — integrates with search layer
├── telemetry.ts                 # Auto-logging for all AI calls
├── cost.ts                      # Token cost estimation by model
├── types.ts
└── test/
    └── ai.test.ts
```

### Session Convention
```ts
// Create or resume a session
const session = await ai.session(sessionId ?? ai.newSessionId(), {
  model: 'claude-sonnet-4',
  systemPrompt: prompts.get('customer-support'),
  tenantId: ctx.tenantId,
  userId: ctx.user.id,
});

// Send a message — history is managed automatically
const response = await session.send(userMessage);

// Tool registration
ai.tools.register('search-docs', {
  description: 'Search documentation',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }) => search.query(query),
});
```

### DB Schema
```
ai_sessions         { id, tenant_id, user_id, model, created_at, last_active_at, expires_at }
ai_messages         { id, session_id, role, content, tool_calls, created_at }
ai_telemetry        { id, session_id, model, input_tokens, output_tokens, latency_ms, cost_usd, created_at }
```

---

## 20. Integration Pattern & Conventions

### Purpose
Standardized structure for third-party API integrations. When the LLM needs to integrate with an external API, it follows this pattern — not a custom one-off approach.

### Rules for the LLM
- Every third-party integration gets its own folder under `integrations/<name>/`.
- Credentials are never hardcoded or inlined. Always define a `credentials.ts` with a Zod schema and resolve via the config layer.
- Each integration exports named, typed functions. No default exports.
- Every integration function has typed input, typed output, explicit error handling, and retry logic.
- Generate a test file with a dry-run helper for every integration.
- When adding an integration, add an entry to `integrations/registry.ts`.
- OAuth integrations must implement the full authorize/callback/refresh lifecycle using the auth layer's OAuth utilities.

### Folder Structure
```
integrations/
├── registry.ts                  # Central manifest of all integrations
├── <name>/
│   ├── index.ts                 # Exported functions — public API of the integration
│   ├── credentials.ts           # Zod schema for required credentials
│   ├── types.ts                 # Input/output types for all functions
│   ├── client.ts                # Configured HTTP/SDK client (internal)
│   └── test.ts                  # Dry-run helpers and tests
```

### Integration File Conventions

**`credentials.ts`**
```ts
import { z } from 'zod';
import { useConfig } from '@mariachi/config';

export const SlackCredentials = z.object({
  botToken: z.string(),
  signingSecret: z.string(),
});

export const getCredentials = (tenantId?: string) =>
  useConfig().secrets.get('slack', tenantId); // always from secrets layer
```

**`index.ts`**
```ts
import { z } from 'zod';
import { defineIntegrationFn } from '@mariachi/integrations';

export const sendMessage = defineIntegrationFn({
  name: 'slack.sendMessage',
  input: z.object({ channel: z.string(), text: z.string() }),
  output: z.object({ ts: z.string() }),
  handler: async (input, ctx) => {
    const creds = await getCredentials(ctx.tenantId);
    // implementation
  },
});
```

**`registry.ts`**
```ts
export const integrationRegistry = [
  {
    name: 'slack',
    description: 'Send messages and interact with Slack workspaces',
    credentialSchema: SlackCredentials,
    functions: ['sendMessage', 'createChannel', 'inviteUser'],
  },
  // add new integrations here
];
```

### Webhook Receiver Convention
When an integration receives inbound webhooks, add a `webhook.ts` file:
```ts
// integrations/<name>/webhook.ts
export const handleWebhook = defineWebhookHandler({
  verify: (req) => verifySignature(req, creds.signingSecret),  // always verify
  parse: (body) => WebhookPayloadSchema.parse(body),
  handle: async (payload, ctx) => {
    await events.publish(`<name>.<event>`, payload); // emit into event bus
  },
});
```

### FaaS Deployment (When Needed)
If an integration needs to run as an isolated function:
```
integrations/<name>/
└── deploy/
    ├── lambda.ts                # AWS Lambda handler wrapper
    ├── cloudflare-worker.ts     # Cloudflare Worker wrapper
    └── deploy.config.ts         # Platform-specific config
```

---

## Error Handling Conventions

### Rules for the LLM
- Every package exports a typed error class that extends `MariachiError`.
- Errors carry a `code` (machine-readable), `message` (human-readable), and optional `metadata`.
- HTTP status codes are mapped from error codes in the communication layer — not set manually in handlers.
- Never swallow errors silently. Either handle them with a typed catch, or let them propagate to the communication layer's error handler.

```ts
// Base
export class MariachiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly metadata?: Record<string, unknown>,
  ) { super(message); }
}

// Per-package
export class DatabaseError extends MariachiError {}
export class AuthError extends MariachiError {}
export class BillingError extends MariachiError {}

// Usage
throw new AuthError('auth/token-expired', 'JWT has expired', { expiredAt });
```

---

## Context Propagation

Every request, job, and AI session carries a `Context` object threaded through all operations:

```ts
interface Context {
  traceId: string;
  userId: string | null;
  tenantId: string | null;
  logger: Logger;
  // extended per-operation
}
```

### Rules for the LLM
- `ctx` is always the first argument to handlers, service methods, and job handlers.
- When spawning a job from a request, pass the current `traceId` and `tenantId` into the job payload so context is preserved.
- When making an AI call from a request, pass `ctx` so telemetry is attributed correctly.

---

## Monolith vs. Microservice Mode

### Monolith Mode
- All packages are imported directly.
- Communication layer uses direct function calls with the middleware pipeline applied in-process.
- Single deployable unit.
- Database, cache, queue are shared.

### Microservice Mode
- Each `apps/` entry is an independently deployable service.
- Communication between services uses gRPC or HTTP via the communication layer.
- Services own their own DB schema (separate schema or tables namespaced by service).
- Events and jobs are the primary cross-service communication primitives — avoid synchronous cross-service calls where possible.

### Decision Guide for the LLM
- Default to **monolith** unless the application explicitly requires independent scaling of components.
- Extract to a microservice when: a component has significantly different scaling needs, requires a different runtime, or has strict isolation requirements.
- Leave `// EXTRACT: candidate for <service-name> service` comments at boundaries that may need extraction later.

---

## Application Structure

This is the most important architectural pattern in the framework. Every application follows a strict three-layer structure. The LLM must never collapse or skip layers.

```
Client
  → API Facade         (HTTP in, auth resolution, context building, rate limiting)
  → Controller         (input validation, shaping, forwards via communication layer)
  → Service            (business logic, domain operations, all framework components)
```

Each layer has a single responsibility and a strict import contract. Violations of these contracts are the most common source of architectural drift.

### Layer Responsibilities

**API Facade** — the public edge. Responsible for:
- Receiving HTTP requests
- Resolving identity (session, API key, service token) into a `ResolvedIdentity`
- Building `ctx` (traceId, userId, tenantId, logger)
- Applying rate limiting
- Forwarding to the controller
- Returning the HTTP response

The facade never contains business logic. It never imports from domain packages, the database, cache, or any service package. Its only imports are `@mariachi/api-facade`, `@mariachi/auth`, and `@mariachi/communication`.

**Controller** — the translation layer. Responsible for:
- Receiving the shaped HTTP input and `ctx` from the facade
- Validating and reshaping the input into the service's expected schema (renaming fields, applying defaults, stripping HTTP-specific fields)
- Making a typed call through the communication layer
- Returning the result

The controller never contains business logic. It never imports from the database, cache, events, or jobs packages. Its only imports are `@mariachi/communication` and Zod schemas.

**Service** — the domain layer. Responsible for:
- All business logic
- Orchestrating framework components (DB, cache, events, jobs, billing, AI, etc.)
- Emitting domain events
- Writing audit log entries

The service never imports from HTTP frameworks, the facade, or controller packages. It has no knowledge of transport.

### Import Rules (strictly enforced)

| Layer | May import | May NOT import |
|---|---|---|
| Facade | `@mariachi/api-facade`, `@mariachi/auth`, `@mariachi/communication` | DB, cache, events, jobs, domain packages |
| Controller | `@mariachi/communication`, Zod schemas | DB, cache, events, jobs, HTTP frameworks |
| Service | Any `@mariachi/*` package | HTTP frameworks, facade, controller |

### Folder Structure

```
apps/api/
├── servers/
│   ├── public.ts                # Public API server (session + API key auth)
│   ├── admin.ts                 # Admin API server (session auth, stricter limits)
│   └── webhooks.ts              # Inbound webhook server (signature verification only)
├── controllers/                 # One file per domain
│   ├── billing.controller.ts
│   ├── users.controller.ts
│   └── ...
└── index.ts                     # Boots servers, registers lifecycle hooks

apps/services/                   # Monolith: all services here
├── billing/
│   ├── billing.service.ts
│   ├── billing.handler.ts       # Registers service methods with communication layer
│   └── test/
│       └── billing.service.test.ts
├── users/
│   ├── users.service.ts
│   ├── users.handler.ts
│   └── test/
│       └── users.service.test.ts
└── ...
```

In microservice mode, each `apps/services/<domain>/` becomes its own independently deployable app. The controller code does not change — only the communication layer's transport switches from in-process to network.

### Code Conventions Per Layer

**Facade route (thin — just context forwarding):**
```ts
// apps/api/servers/public.ts
fastify.post('/charges', async (req, reply) => {
  const result = await BillingController.createCharge(req.ctx, req.body);
  return reply.send(result);
});
```

**Controller (validation + forwarding — no logic):**
```ts
// apps/api/controllers/billing.controller.ts
export const BillingController = {
  createCharge: async (ctx: Context, req: CreateChargeRequest) => {
    const input = CreateChargeInput.parse({
      customerId: req.customerId,
      amount: req.amount,
      currency: req.currency ?? 'usd',
    });
    return communication.call('billing.createCharge', ctx, input);
  },
};
```

**Handler (wiring — no logic, just registration):**
```ts
// apps/services/billing/billing.handler.ts
communication.register('billing.createCharge', {
  schema: { input: CreateChargeInput, output: ChargeOutput },
  handler: (ctx, input) => BillingService.createCharge(ctx, input),
});
```

**Service (all the real work):**
```ts
// apps/services/billing/billing.service.ts
export const BillingService = {
  createCharge: async (ctx: Context, input: CreateChargeInput) => {
    const customer = await customers.findById(ctx, input.customerId);
    const charge = await billing.charge(customer, input.amount);
    await audit.log(ctx, 'billing.charge.created', { chargeId: charge.id });
    await events.publish('billing.charge.created', { ...charge, tenantId: ctx.tenantId });
    return charge;
  },
};
```

### Rules for the LLM
- Never put business logic in a controller. If you find yourself importing a repository or calling a domain service from a controller, stop and move that logic to the service layer.
- Never put HTTP-specific code (status codes, headers, request parsing) in a service. If you find yourself doing this, stop and move it to the controller or facade.
- Never skip the controller layer and call the service directly from the facade.
- Every service method has a corresponding handler registration. If you add a method to a service, add its handler registration.
- Controllers are boring by design. If a controller file is growing complex, that is a signal that logic has leaked into the wrong layer.

---

## 21. API Facade

### Purpose
The public-facing HTTP layer. Abstracts authentication strategies, context building, rate limiting, and multi-server configuration behind a clean `FastifyAdapter` interface. Multiple servers can be composed with different auth strategies, rate limits, and route sets.

### Rules for the LLM
- Every application has at least one server defined via `FastifyAdapter`.
- Auth strategy is declared at the server level, not at the route level, unless a specific route needs an override.
- The resolved identity (`ResolvedIdentity`) is always attached to `req.ctx` before any route handler runs. Route handlers never perform auth logic themselves.
- `traceId` is always generated at the facade edge and attached to `ctx`. It is never generated deeper in the stack.
- Multiple servers share no state directly — they communicate only through the service layer via the communication layer.
- Webhook servers use signature verification as their auth strategy, not session or API key.

### Auth Strategies
- `session` — Cookie-based or JWT Bearer session, resolved via auth package
- `api-key` — Hashed API key lookup, produces `ResolvedIdentity` with `apiKeyId` for usage tracking
- `service` — Service-to-service token (mTLS or shared secret), for internal servers
- `webhook` — HMAC signature verification only, no user identity resolution

### ResolvedIdentity
Every auth strategy produces this shape before the request proceeds:
```ts
interface ResolvedIdentity {
  userId: string;
  tenantId: string;
  scopes: string[];
  identityType: 'session' | 'api-key' | 'service' | 'webhook';
  apiKeyId?: string;     // present for api-key — used for per-key usage tracking
  sessionId?: string;    // present for session
}
```

### Folder Structure
```
packages/api-facade/
├── index.ts
├── server.ts                    # FastifyAdapter base class
├── servers/
│   ├── public.ts                # Preset: session + API key, standard rate limits
│   ├── admin.ts                 # Preset: session only, strict rate limits
│   ├── webhooks.ts              # Preset: signature verification, no user auth
│   └── internal.ts              # Preset: service token, no rate limits
├── auth/
│   ├── resolver.ts              # Runs the correct strategy, builds ResolvedIdentity
│   ├── strategies/
│   │   ├── session.ts
│   │   ├── api-key.ts
│   │   ├── service.ts
│   │   └── webhook.ts
│   └── types.ts
├── middleware/
│   ├── context.ts               # Builds ctx from ResolvedIdentity + request metadata
│   ├── rate-limit.ts            # Per-identity rate limiting via rate-limit package
│   └── tracing.ts               # Generates traceId, injects into ctx and response headers
├── router.ts                    # Route registration helpers
├── types.ts
└── test/
    └── facade.test.ts
```

### FastifyAdapter Convention
```ts
// Fluent builder — each method returns `this` for chaining
class FastifyAdapter {
  constructor(config: ServerConfig) {}

  withAuth(strategy: AuthStrategy | AuthStrategy[]): this
  withRateLimit(config: RateLimitConfig): this
  withMiddleware(fn: Middleware): this
  register(routes: RouteDefinition[]): this
  listen(port: number): Promise<void>
  close(): Promise<void>
}
```

### Composing Multiple Servers
```ts
// apps/api/index.ts
const publicServer = new FastifyAdapter({ name: 'public' })
  .withAuth(['session', 'api-key'])
  .withRateLimit({ perUser: 1000, perApiKey: 5000, window: '1h' })
  .register(publicRoutes);

const adminServer = new FastifyAdapter({ name: 'admin' })
  .withAuth('session')
  .withRateLimit({ perUser: 100, window: '1m' })
  .register(adminRoutes);

const webhookServer = new FastifyAdapter({ name: 'webhooks' })
  .withAuth('webhook')
  .register(webhookRoutes);

await lifecycle.startAll([
  () => publicServer.listen(3000),
  () => adminServer.listen(3001),
  () => webhookServer.listen(3002),
]);
```

### Context Built by the Facade
After auth resolution, every request has this on `req.ctx` before hitting a route handler:
```ts
interface Context {
  traceId: string;           // generated at facade edge
  userId: string | null;     // null for webhook/unauthenticated
  tenantId: string | null;
  scopes: string[];
  identityType: string;
  apiKeyId?: string;         // present for API key requests
  logger: Logger;            // child logger with traceId, userId, tenantId bound
  server: string;            // which server this came through (public/admin/webhooks)
}
```

---

## 22. CLI & Project Scaffolding (`create-mariachi`)

### Purpose
Programmatic project generation and code scaffolding for Mariachi applications. The package is the source of truth for all templates. The CLI is a thin interactive wrapper over the same programmatic API, meaning an LLM and a human developer use the exact same underlying generator.

### Rules for the LLM
- When scaffolding a new project or adding a component, always use the generator API rather than writing files manually from scratch. This ensures generated output stays in sync with the canonical templates.
- After generating code, always run `mariachi validate` and read the output before considering generation complete. Fix all violations before proceeding.
- Never modify files in `node_modules/@mariachi/create/templates/` — these are the canonical source. If a template needs customization, eject it into the project's own `mariachi.templates/` override folder.
- All generated files include a header comment identifying the template used, so future regeneration can detect and handle drift.

### Package Structure

```
packages/create/                 # @mariachi/create — programmatic API + templates
├── index.ts                     # Public programmatic API
├── generators/
│   ├── project.ts               # Full project scaffold
│   ├── service.ts               # Add a domain service + handler
│   ├── controller.ts            # Add a controller for a domain
│   ├── job.ts                   # Add a job definition + handler
│   ├── integration.ts           # Scaffold an integration folder
│   └── migration.ts             # Generate a migration file name + stub
├── templates/                   # File-based templates — __name__ is replaced at generation time
│   ├── project/                 # Full monorepo scaffold
│   │   ├── apps/
│   │   │   ├── api/
│   │   │   │   ├── servers/
│   │   │   │   │   └── public.ts.hbs
│   │   │   │   ├── controllers/
│   │   │   │   └── index.ts.hbs
│   │   │   ├── services/
│   │   │   └── worker/
│   │   ├── packages/
│   │   ├── integrations/
│   │   ├── docs/
│   │   ├── MARIACHI.md
│   │   ├── package.json.hbs
│   │   └── tsconfig.base.json
│   ├── service/
│   │   ├── __name__.service.ts.hbs
│   │   ├── __name__.handler.ts.hbs
│   │   └── test/
│   │       └── __name__.service.test.ts.hbs
│   ├── controller/
│   │   └── __name__.controller.ts.hbs
│   ├── job/
│   │   └── __name__.job.ts.hbs
│   └── integration/
│       ├── index.ts.hbs
│       ├── credentials.ts.hbs
│       ├── types.ts.hbs
│       ├── client.ts.hbs
│       └── test.ts.hbs
├── validate/
│   ├── index.ts                 # validate() function — checks project against conventions
│   └── rules/                   # One file per rule category
│       ├── imports.ts           # Import boundary rules
│       ├── structure.ts         # Folder/file structure rules
│       ├── naming.ts            # Naming convention rules
│       └── schema.ts            # Zod schema requirement rules
└── cli.ts                       # CLI entry point — wraps generators with interactive prompts

packages/cli/                    # mariachi — the CLI binary
├── index.ts
├── commands/
│   ├── init.ts                  # mariachi init <name>
│   ├── generate.ts              # mariachi generate <type> <name>
│   ├── validate.ts              # mariachi validate
│   └── migrate.ts               # mariachi migrate
└── prompts/
    └── init.ts                  # Interactive prompts for human use (Clack)
```

### Programmatic API

The LLM uses this directly:

```ts
import { createProject, generateService, generateController, validate } from '@mariachi/create';

// Scaffold a full new project
await createProject({
  name: 'my-app',
  mode: 'monolith',             // 'monolith' | 'microservice'
  adapters: {
    database: 'postgres',
    cache: 'redis',
    queue: 'bullmq',
    auth: ['session', 'api-key'],
    storage: 's3',
    email: 'resend',
  },
  features: ['billing', 'ai', 'multi-tenancy', 'search'],
  outputDir: './my-app',
});

// Add a domain service to an existing project
await generateService({
  name: 'payments',
  projectRoot: './my-app',
});

// Add a controller for that domain
await generateController({
  name: 'payments',
  projectRoot: './my-app',
});
```

### CLI (Human Use)

Interactive mode for human developers:

```bash
# Scaffold a new project interactively
mariachi init my-app

# Non-interactive (useful for scripts and LLM use)
mariachi init my-app \
  --mode monolith \
  --db postgres \
  --cache redis \
  --queue bullmq \
  --auth session,api-key \
  --features billing,ai

# Add components to an existing project
mariachi generate service payments
mariachi generate controller payments
mariachi generate job process-payment
mariachi generate integration stripe
mariachi generate migration add-payments-table

# Validate the project against Mariachi conventions
mariachi validate
mariachi validate --fix          # Auto-fix where possible
```

### Validation Rules

The `validate()` function checks a project against the full set of Mariachi conventions and returns structured violations. This is the LLM's self-correction mechanism.

```ts
const result = await validate('./my-app');

// Result shape
interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

interface Violation {
  rule: string;          // e.g. 'imports/no-db-in-controller'
  severity: 'error' | 'warning';
  file: string;
  message: string;
  suggestion?: string;   // what to do to fix it
}
```

**Import boundary rules:**
- `imports/no-db-in-controller` — controllers may not import `@mariachi/database` or any repository
- `imports/no-db-in-facade` — facade files may not import `@mariachi/database`
- `imports/no-http-in-service` — service files may not import HTTP frameworks or facade packages
- `imports/no-http-in-controller` — controllers may not import HTTP frameworks directly
- `imports/service-must-use-communication` — controllers must call services via `@mariachi/communication`, not direct imports

**Structure rules:**
- `structure/handler-for-every-service` — every `*.service.ts` must have a corresponding `*.handler.ts`
- `structure/test-for-every-service` — every `*.service.ts` must have a corresponding `*.test.ts`
- `structure/controller-for-every-domain` — every domain with a service must have a controller in `apps/api/controllers/`
- `structure/integration-has-credentials` — every folder under `integrations/` must have a `credentials.ts`
- `structure/integration-in-registry` — every folder under `integrations/` must have an entry in `integrations/registry.ts`

**Naming rules:**
- `naming/event-format` — published event names must match `{domain}.{entity}.{verb}` format
- `naming/cache-key-format` — cache keys must be constructed via `cache.key()`, not inline strings
- `naming/timestamps` — DB schema timestamp columns must be named `created_at`, `updated_at`, `deleted_at`

**Schema rules:**
- `schema/handler-must-declare-schema` — every `communication.register()` call must include `input` and `output` Zod schemas
- `schema/no-process-env` — `process.env` must not be accessed outside of `packages/config/`
- `schema/no-hardcoded-secrets` — strings matching common secret patterns (keys, tokens, passwords) must not appear outside config/secrets files

### Template Variables

All `.hbs` templates support these variables at generation time:

```
{{name}}              # The component name e.g. "payments"
{{Name}}              # PascalCase e.g. "Payments"
{{name-kebab}}        # kebab-case e.g. "payments"
{{mode}}              # "monolith" | "microservice"
{{adapters.database}} # Selected DB adapter
{{adapters.cache}}    # Selected cache adapter
{{features}}          # Array of enabled features
{{mariachi.version}}  # Framework version
{{generatedAt}}       # ISO timestamp
```

### Template Override

To customize a template for a specific project without forking the package:

```
my-app/
└── mariachi.templates/          # Local overrides — same structure as packages/create/templates/
    └── service/
        └── __name__.service.ts.hbs   # Overrides the default service template
```

The generator checks for local overrides before falling back to the package templates.

---

## Documentation Templates

When generating a new application or service, always create:

- `docs/architecture.md` — high-level overview, monolith vs. microservice decision, component inventory
- `docs/adr/` — Architecture Decision Records for significant decisions
- `docs/runbook.md` — How to run, deploy, and debug the application
- `docs/integrations.md` — List of active integrations and their credential requirements