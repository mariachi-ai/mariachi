# Conventions

Rules marked **(validate)** are checked by `mariachi validate` in apps. Rules marked **(lint)** are
checked in this repo by `pnpm lint:conventions`. Suppress a single finding with a
`// mariachi-validate-ignore <rule>` comment on the same or the preceding line, and say why.

## TypeScript and modules

- ESM everywhere (`"type": "module"`), TypeScript strict, ES2022, `moduleResolution: "bundler"`.
- Relative imports are extensionless: `import { x } from './x'`. **(validate: `extensionless-imports`, lint)**
- Import `@mariachi/*` by package root or a documented subpath (`@mariachi/events/outbox`,
  `@mariachi/database/schema`), never `.../src/...` or `.../dist/...`. **(validate: `no-deep-imports`)**
- Framework packages build with tsup (ESM + CJS + d.ts). Optional vendor SDKs are optional
  `peerDependencies` loaded lazily with `loadOptionalPeer`, so importing a package never pulls in an SDK
  you don't use.

## Layers

- Controllers never import services, repositories, or database packages. They call procedures with
  `this.call(ctx, 'domain.action', input)`. **(validate: `no-service-import-in-controller`, `no-db-in-controller`, lint)**
- Services never import HTTP frameworks or `@mariachi/server`, `api-facade`, `webhooks`. **(validate: `no-http-in-service`)**
- Each `*.service.ts` has a `*.handler.ts` registering its procedures, and a test. **(validate: warnings)**
- Procedure names are `domain.action` and unique. Registering a name twice throws
  `communication/duplicate-procedure` at startup. **(validate: `unique-procedure-names`)**

## Context

Every operation takes `ctx: Context` as its first argument: services, repositories, procedures,
`communication.call(ctx, name, input)`, `jobs.enqueue(ctx, ...)`, `events.publish(ctx, ...)`. Never build a
fresh context mid-request; that drops the tenant, the user and the trace. Jobs and events serialize the
context into their envelope and rebuild it on the consumer side.

## Errors

- Throw `MariachiError` subclasses from `@mariachi/core`: `ValidationError`, `NotFoundError`,
  `ConflictError`, `AuthError`, or the package error (`DatabaseError`, `JobsError`, ...), each with a stable
  `code` like `billing/card-declined`. **(validate: `no-raw-error`, lint)**
- The code decides the HTTP status (`errorToHttpStatus`): `*/not-found` → 404, `*/conflict` → 409,
  `validation/*` → 400, `auth/*` → 401/403, `rate-limit/*` → 429, anything unknown → 500.
- Every HTTP server returns the same envelope, `{ error: { code, message, traceId, details? } }`. For
  5xx errors the message is replaced with a generic one so internals never leak.
- Zod errors are converted with `fromZodError` into `ValidationError` with `details` listing the issues.

## Configuration

- Read settings with `loadConfig()` / `useConfig()` and secrets with `createSecrets()`. `process.env` is
  only read inside `@mariachi/config` (`readEnv`). **(validate: `no-process-env`, lint)** `validate` allows it
  in `src/config.ts`, `src/config/`, root `*.config.ts` files and `scripts/`.
- Config is validated with Zod at startup; a bad value fails the boot with `ConfigError`.

## Data

- Declare tables with `defineTable` in `src/schema/`. Generate migrations with `mariachi db generate`
  and never hand-write them. Check with `mariachi db check` in CI.
- Soft delete by default: tables with `deletedAt` hide deleted rows from reads; `hardDelete` is explicit.
- Tables with `tenantId` are tenant-scoped; see [architecture.md](./architecture.md#multi-tenancy).
- Access data through `DrizzleRepository` subclasses. Don't pass the Drizzle client around.
- Use `withTransaction(db, ctx, fn)`; repositories inside `fn` join the transaction automatically.

## Validation at boundaries

Zod validates every input that crosses a boundary: HTTP body, params and query (route `schema`),
procedure input and output (`register(name, { schema })`), job payloads (`defineJob({ schema })`), event
payloads (`defineEvent(name, { schema })`) and config. Inside the service layer, trust the types.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case with a role suffix | `invoice-items.service.ts` |
| Procedures | `domainCamel.action` | `invoiceItems.create` |
| Events | lowercase, dot-separated **(validate: `event-name-format`)** | `billing.invoice.paid` |
| Jobs | kebab-case | `send-digest` |
| Tables | snake_case plural; DSL keys camelCase (columns become snake_case) | `invoice_items.created_at` |
| Error codes | `package-or-domain/kebab-reason` | `database/tenant-required` |

## Adapters

Construct infrastructure with factories and config (`createCache`, `createEventBus`, `createJobQueue`,
`createPostgresDatabase`), not `new RedisCacheAdapter(...)`, so tests and local development can swap in
memory adapters.
