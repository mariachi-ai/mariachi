# Mariachi

Mariachi is a TypeScript backend framework designed to give you -- or an AI assistant -- a complete, opinionated starting point for building production backend applications. Instead of stitching together dozens of libraries and reinventing patterns for auth, billing, jobs, and notifications, Mariachi provides all of these as modular packages behind consistent adapter-based abstractions.

The framework is structured as a **modular monolith**: all packages live in one monorepo and share a single process by default, but the architecture is designed so that any piece can be extracted into its own service later. You get the simplicity of a monolith with the option to scale into microservices when the time comes.

Every external dependency -- Postgres, Redis, Stripe, Typesense, Resend, OpenAI -- is hidden behind an adapter. You configure which adapter to use, and the rest of your code never knows or cares about the underlying vendor. Swap Redis for another cache, switch from Stripe to another payment provider, or replace Resend with SendGrid -- none of your business logic changes.

---

## How It Works

Requests flow through three layers:

```
HTTP Request
  --> Facade       Fastify server, auth strategies, rate limiting
  --> Controller   Input validation (Zod), delegates to communication layer
  --> Service      Business logic, database, cache, events, jobs
```

**The API app** (`apps/api`) handles HTTP concerns: it creates Fastify servers with auth and rate limiting, registers controllers, and delegates all business logic through the communication layer.

**The services app** (`apps/services`) is where domain logic lives. Each domain (users, orders, billing, etc.) has a service with business logic and a handler that wires it to the communication layer. Controllers never import services directly -- they call `communication.call('users.create', ctx, input)`, and the communication layer routes it to the right handler.

**The worker app** (`apps/worker`) runs background jobs via BullMQ. Define a job with a Zod schema and retry config, register it in the worker, and enqueue it from anywhere.

This separation means your API layer is thin and your business logic is portable. If you later need to split a domain into its own service, you swap the in-process communication adapter for a network transport and nothing else changes.

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **pnpm** (package manager)
- **Docker** (for local infrastructure)

### Install and Run

```bash
pnpm install
pnpm run build
pnpm run dev
```

### Local Infrastructure

Start Postgres, Redis, Typesense, and Mailpit with Docker:

```bash
docker compose -f docker-compose.dev.yml up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL 16 | 5432 | Primary database |
| Redis 7 | 6379 | Cache, events, jobs, rate limiting |
| Typesense 27 | 8108 | Full-text search |
| Mailpit | 1025 (SMTP) / 8025 (UI) | Email testing |

### Run Tests

```bash
pnpm run test          # Watch mode
pnpm run test:run      # Single run (CI)
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | -- |
| `REDIS_URL` | Redis connection string | -- |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | -- |
| `PORT` | Public API port | 3000 |
| `ADMIN_PORT` | Admin API port | 3001 |
| `WEBHOOK_PORT` | Webhook server port | 3002 |

See [`docs/runbook.md`](docs/runbook.md) for the full list.

---

## Project Structure

```
apps/
  api/              HTTP servers + controllers (Facade + Controller layers)
  services/         Domain services + communication handlers (Service layer)
  worker/           BullMQ job workers and schedules

packages/           28 shared framework packages (see full list below)
integrations/       Third-party integrations (Slack, etc.)
examples/           Reference implementations (API, services, worker, realtime)
docs/               Architecture docs, AI guide, recipes, ADRs
.mariachi/          Quick-reference rules for AI assistants
```

---

## Packages

Mariachi ships 28 packages organized into six categories. Each package follows the same pattern: an abstract interface, a factory function, and one or more adapter implementations.

### Foundation

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/core` | Shared types, typed errors, `Context`, DI container, `Result<T,E>`, retry utilities |
| `@mariachi/config` | Zod-validated config from environment variables, secrets management, feature flags |
| `@mariachi/observability` | Structured logging (Pino), distributed tracing (OpenTelemetry), metrics (Prometheus), error tracking (Sentry) |
| `@mariachi/lifecycle` | App bootstrap, ordered startup/shutdown hooks, health checks |

### Communication and API

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/communication` | Inter-module procedure calls with a middleware pipeline (auth, tracing, logging) |
| `@mariachi/api-facade` | Fastify HTTP servers with pluggable auth strategies, rate limiting, and controller registration |
| `@mariachi/server` | Low-level Fastify adapter with context and tracing plugins |
| `@mariachi/webhooks` | Inbound webhook endpoints with auth verification, payload logging, and direct/queue processing modes |

### Data and Storage

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/database` | Schema DSL (`defineTable`, `column`), repository interface, query filters, pagination types |
| `@mariachi/database-postgres` | PostgreSQL + Drizzle ORM implementation, `DrizzleRepository` base class with tenant isolation and soft deletes |
| `@mariachi/cache` | Redis caching with `getOrSet`, key builders, distributed locks, memoization |
| `@mariachi/storage` | File/object storage abstraction (S3, local filesystem) |

### Async and Events

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/events` | Pub/sub event bus with Redis and NATS adapters, dead letter handling |
| `@mariachi/jobs` | Background job queue and scheduling via BullMQ, with Zod schemas and retry policies |
| `@mariachi/realtime` | WebSocket connections, channel subscriptions, broadcasting, per-user messaging |

### Security and Access

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/auth` | JWT authentication, API key management, OAuth flows, RBAC authorization, brute-force protection |
| `@mariachi/auth-clerk` | Clerk authentication adapter, webhook verification (Svix), middleware, and webhook controller |
| `@mariachi/tenancy` | Multi-tenant isolation via subdomain, header, or JWT claim resolution |
| `@mariachi/rate-limit` | Redis sliding-window rate limiting with per-user and per-key rules |

### Domain Features

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/billing` | Stripe payments, subscriptions, credits, usage-based billing, webhook processing |
| `@mariachi/notifications` | Multi-channel notifications: email (Resend), SMS, push, in-app, with template rendering and preference management |
| `@mariachi/search` | Full-text search via Typesense with indexing, querying, and analytics |
| `@mariachi/ai` | AI/LLM integration via AI SDK: sessions, tool registration, prompt management, agent loops, token budget tracking |
| `@mariachi/audit` | Append-only audit logging with queryable history |
| `@mariachi/integrations` | Pattern for third-party integrations: `defineIntegrationFn` with typed credentials, schemas, and retry |

### Tooling

| Package | What it gives you |
|---------|-------------------|
| `@mariachi/testing` | In-memory test doubles for every adapter (cache, events, jobs, storage, email, DB, AI), plus factories for test users/tenants/contexts |
| `@mariachi/create` | Code scaffolding and validation rules for project structure, naming, and import boundaries |
| `@mariachi/cli` | CLI binary (`mariachi init`, `mariachi generate`, `mariachi validate`) |

---

## Using Mariachi with AI Assistants

Mariachi is designed to be AI-friendly. The consistent patterns, typed contracts, and layered documentation mean an AI assistant can generate correct, idiomatic code without reading every source file.

### Documentation Layers

The docs are structured in three layers, from fastest to most detailed:

| Layer | Location | When to use |
|-------|----------|-------------|
| **Quick rules** | [`.mariachi/`](.mariachi/) | Point your AI here first. Three short files covering architecture, patterns, and packages. |
| **AI guide** | [`docs/ai-guide.md`](docs/ai-guide.md) | Decision trees ("I need to..."), package cheat sheet with code snippets, and common gotchas. |
| **Recipes** | [`docs/recipes/`](docs/recipes/) | Step-by-step instructions for common tasks with copy-paste code from the actual codebase. |

### Tips for Prompting

When asking an AI to build on Mariachi, these prompting strategies will get better results:

**Start with context.** Tell the AI to read `.mariachi/architecture.md` and `docs/ai-guide.md` before writing any code. This gives it the three-layer architecture, naming conventions, and import boundaries.

**Be specific about the layer.** Instead of "add user management", say "add a `UsersController` in `apps/api/src/controllers/` that calls `communication.call('users.create', ctx, input)`, and add a service with handler in `apps/services/src/users/`". The more you match Mariachi's vocabulary (controller, service, handler, procedure), the better the output.

**Reference the recipes.** For common tasks, point the AI to the relevant recipe:
- "Follow `docs/recipes/add-domain-entity.md` to add an orders domain"
- "Follow `docs/recipes/add-background-job.md` to add an order processing job"
- "Follow `docs/recipes/add-webhook-endpoint.md` to add a Stripe webhook"
- "Follow `docs/recipes/add-integration.md` to add a GitHub integration"

**Use the package cheat sheet.** If the AI is unsure which package to use, point it to `docs/ai-guide.md#decision-tree-which-component-to-use` or `.mariachi/packages.md`.

**Warn about CORE_CONCEPT.md.** The full spec (`CORE_CONCEPT.md`) describes planned features that don't exist yet (MySQL, gRPC, GraphQL adapters, etc.). If the AI reads it, it may generate code for non-existent APIs. The `docs/ai-guide.md` reflects only what's actually implemented.

### Example Prompt

> Read `.mariachi/architecture.md` and `docs/ai-guide.md` for project conventions. Then follow `docs/recipes/add-domain-entity.md` to add a `products` domain with fields: name (text), price (numeric), description (text), categoryId (text). Include the schema, compiled table, repository, service, handler, controller, and tests.

---

## CLI

```bash
mariachi generate service <name>      # Scaffold a domain service with handler and tests
mariachi generate integration <name>  # Scaffold a third-party integration
mariachi validate                     # Check project structure and conventions
mariachi validate ./apps              # Validate a specific path
```

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`.mariachi/architecture.md`](.mariachi/architecture.md) | Three-layer architecture, import boundaries, naming conventions |
| [`.mariachi/patterns.md`](.mariachi/patterns.md) | Core patterns: adapters, DI, context propagation, Zod schemas |
| [`.mariachi/conventions.md`](.mariachi/conventions.md) | TypeScript/ESM rules, dependency rules, error handling, anti-patterns |
| [`.mariachi/packages.md`](.mariachi/packages.md) | Quick lookup table for all 28 packages |
| [`docs/ai-guide.md`](docs/ai-guide.md) | Decision trees, package cheat sheet, common gotchas |
| [`docs/architecture.md`](docs/architecture.md) | Architecture overview with mermaid diagrams |
| [`docs/runbook.md`](docs/runbook.md) | Operational guide and full environment variable reference |
| [`docs/integrations.md`](docs/integrations.md) | How integrations work |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| [`CORE_CONCEPT.md`](CORE_CONCEPT.md) | Full framework specification (includes planned/unimplemented features) |
| [`IMPROVEMENTS.md`](IMPROVEMENTS.md) | Planned improvements and roadmap |

### Recipes

- [Add a domain entity end-to-end](docs/recipes/add-domain-entity.md) -- schema, repository, service, handler, controller, tests
- [Add a background job](docs/recipes/add-background-job.md) -- job definition, worker registration, scheduling, enqueuing
- [Add a webhook endpoint](docs/recipes/add-webhook-endpoint.md) -- auth controller, webhook controller, direct vs queue mode
- [Add a third-party integration](docs/recipes/add-integration.md) -- credentials, client, integration function, registry
- [Wiring and bootstrap](docs/recipes/wiring-and-bootstrap.md) -- full initialization order from config to running servers
# mariachi
