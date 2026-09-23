# Roadmap

This file states what is actually true today. If a feature isn't described here or in
[`packages/core/docs/`](packages/core/docs/README.md), don't assume it exists.

## Status

Pre-1.0. All `@mariachi/*` packages share one version (currently `0.1.x`) and are released together
through Changesets. Breaking changes are still allowed, and each one is recorded in a changeset.

Each package's status is listed in the [catalog](packages/core/docs/packages.md):

- **beta**: hardened and tested (unit tests, plus integration tests against real Postgres, Redis, NATS,
  Typesense or S3 (MinIO) where the package touches infrastructure). The API can still change before 1.0.
- **alpha**: works, but hardening is in progress.

## Done

**Guardrails.**
- Vitest configs split into unit and integration tests, with integration tests running on Testcontainers.
- Biome, plus convention lint rules (`scripts/lint-conventions.mjs`).
- CI gating on build, typecheck, lint, docs and tests, with integration tests run against service containers.
- Changesets with one version shared across all packages.
- Docs link check.

**Architecture.**
- Explicit dependency injection with typed container keys.
- `AsyncLocalStorage` context store.
- `communication.call(ctx, name, input)` with a typed `Procedures` registry. Duplicate registration throws, and calls have timeouts and spans.
- Dependency-free `./schema` subpaths, with vendor SDKs as optional peer dependencies.
- A JSON error envelope, and lifecycle with reverse-order shutdown and liveness/readiness/startup health checks.
- Config loading that returns a `ConfigError` on invalid values.

**Security.**
- Raw-body handling fixed, and real auth strategies (JWT, API key, service token, webhook signature) replace the stubs.
- JWT algorithms, issuer and audience are pinned.
- OAuth uses PKCE and state, and brute-force counting is atomic.
- Tenancy uses a combined policy, and tenant-scoped repositories fail closed.
- Storage path traversal is fixed.
- Encryption is envelope encryption with rotation and associated data, using the `mx1:` format.
- Webhook secrets are redacted from logs.

**Data.**
- The `defineTable` DSL supports indexes, foreign keys, and composite and check constraints.
- `compileSchema`, plus `mariachi db generate|check|migrate|seed`.
- `withTransaction` binds the transaction through context.
- Cursor pagination, `DatabaseError`, and a real health check.

**Async.**
- Jobs: retry and backoff, dedup, a context envelope, a dead-letter queue, cancellation, schedule pruning, and a graceful drain.
- Events: resubscribe on reconnect, envelope metadata, a dead-letter queue, a Redis Streams adapter, and a transactional outbox with a relay.
- Cache: stampede protection, `SCAN`, and owned locks.
- Realtime: cross-instance fan-out, heartbeat, per-user connection limits, and channel authorization.

**HTTP.**
- Zod-declared routes are validated and generate OpenAPI.
- Controller prefixes are applied automatically.
- Rate limiting is wired in with `RateLimit-*` headers.
- `server` is the transport and `api-facade` is the policy layer.

**Domain packages.**
- Billing: a Postgres mirror of Stripe, including plans; webhooks that are stored, versioned and replayable; a locked credit ledger; usage; refunds, plan changes and pause/resume.
- Notifications: per-channel queued delivery with one delivery row per channel, preferences and opt-out, Twilio, FCM and SMTP, and HTML-escaped templates.
- AI: sessions persisted in Postgres, token budgets, streaming, Anthropic plus cross-provider fallback, and a cost table from config.
- Audit: an append-only trigger, a per-tenant hash chain kept in the database with `verifyChain`, tenant-scoped reads, retention and export.
- Auth: database-backed RBAC permissions, API keys stored in Postgres with safe rotation, and atomic webhook dedup.
- Feature flags with tenant overrides, and storage with streaming, presigned uploads and local signed URLs served through the facade.
- Search on Typesense with typed fields, alias reindexing and quoted filters; rate limiting with three algorithms and per-tenant tiers; an integrations registry that can call functions, with per-tenant credentials.
- `@mariachi/testing` doubles kept honest by contract suites that also run against the real adapters.

**CLI and docs.**
- `mariachi init` generates a working project, and `mariachi generate entity|service|controller|job|integration` fills it in.
- `mariachi validate` checks architecture rules.
- A scaffold test generates a project, then typechecks it and runs its tests against the real packages.
- `packages/core/docs/` holds the canonical docs.
- The package catalog is generated from `package.json`.

## Next

- **Reference app.** `apps/` and `examples/` predate the current APIs. They're excluded from build,
  typecheck and lint, and shouldn't be copied from. Replace them with one app built on `mariachi init`
  that exercises sign-up, a job, a webhook and a notification. Run that app as an end-to-end test in CI,
  then delete the old directories.
- **Contract test suites.** For each adapter interface, run one shared suite against both the real
  adapter and its `@mariachi/testing` double.
- **Promotion to stable.** A package becomes stable when it has contract tests, a README with a status,
  public API and config, `Disposable` and health wiring, and no open breaking changes.

## Ideas, not scheduled

None of these exist in code. Don't generate code that uses them.

- Out-of-process communication transports (HTTP, gRPC, tRPC). Today only the in-process transport
  exists, but the procedure contracts are designed so a transport can be swapped in later.
- Database adapters other than Postgres (MySQL, SQLite).
- GraphQL facade.
