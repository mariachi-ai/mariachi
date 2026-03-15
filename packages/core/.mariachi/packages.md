# Mariachi Packages

Quick reference for all 28 packages. Use this to decide which package to reach for.

## Foundation

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/core` | Types, errors, context, DI container, `Result<T,E>` | `getContainer()`, `createContext()`, `KEYS` |
| `@mariachi/config` | Typed config from env, secrets, feature flags | `loadConfig()`, `useConfig()` |
| `@mariachi/observability` | Logging, tracing, metrics, error tracking | `createObservability(config)` |
| `@mariachi/lifecycle` | App bootstrap, startup/shutdown hooks, health checks | `bootstrap()` |

## Communication & API

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/communication` | Inter-module procedure calls with middleware | `createCommunication()` |
| `@mariachi/api-facade` | HTTP servers with auth, rate limiting, controllers | `new FastifyAdapter()`, `BaseController` |
| `@mariachi/server` | Low-level Fastify adapter (used by api-facade) | `FastifyServerAdapter` |
| `@mariachi/webhooks` | Inbound webhook endpoints with auth and logging | `WebhookController`, `WebhookServer` |

## Data & Storage

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/database` | Schema definitions, repository interface, types | `defineTable()`, `column`, `Database` |
| `@mariachi/database-postgres` | PostgreSQL + Drizzle ORM implementation | `createPostgresDatabase()`, `DrizzleRepository` |
| `@mariachi/cache` | Redis caching, distributed locks, memoization | `createCache()`, `createLock()` |
| `@mariachi/storage` | File/object storage (S3, local) | `Storage`, `DefaultStorage` |

## Async & Events

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/events` | Pub/sub event bus (Redis or NATS) | `createEventBus()` |
| `@mariachi/jobs` | Background job queue and scheduling (BullMQ) | `createJobQueue()`, `defineJob` |
| `@mariachi/realtime` | WebSocket connections, channels, broadcasting | `Realtime`, `WSAdapter` |

## Security & Access

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/auth` | JWT, API keys, OAuth, RBAC | `createAuth()`, `createAuthorization()` |
| `@mariachi/auth-clerk` | Clerk authentication, webhook verification (Svix) | `createClerkAuth()`, `ClerkWebhookController` |
| `@mariachi/auth-fusionauth` | FusionAuth JWT + webhook verification (JWKS / HMAC or PEM) | `createFusionAuthAuth()`, `FusionAuthWebhookHandler` |
| `@mariachi/tenancy` | Multi-tenant isolation (subdomain, header, JWT) | `createTenantResolver()`, `createTenancyMiddleware()` |
| `@mariachi/rate-limit` | Redis sliding-window rate limiting | `createRateLimiter()` |

## Domain Features

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/billing` | Stripe payments, subscriptions, credits, webhooks | `createBilling()`, `StripeAdapter` |
| `@mariachi/notifications` | Email (Resend), SMS, push, in-app notifications | `Notifications`, `createEmailAdapter()` |
| `@mariachi/search` | Full-text search (Typesense) | `createSearch()` |
| `@mariachi/ai` | AI/LLM sessions, tools, prompts, agent loops | `createAI()`, `runAgent()` |
| `@mariachi/audit` | Append-only audit logging | `createAuditLogger()` |
| `@mariachi/integrations` | Third-party integration pattern | `defineIntegrationFn()` |

## Tooling

| Package | Use when you need... | Factory / Entry |
|---------|---------------------|-----------------|
| `@mariachi/testing` | In-memory test doubles, factories | `createTestHarness()`, `TestRepository` |
| `@mariachi/create` | Code scaffolding and validation rules | `mariachi generate` |
| `@mariachi/cli` | CLI binary | `mariachi init/generate/validate` |
